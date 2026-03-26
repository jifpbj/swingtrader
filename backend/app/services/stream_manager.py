"""
Alpaca WebSocket Stream Manager
────────────────────────────────
Maintains persistent WebSocket connections to Alpaca's real-time data feeds
(stocks via IEX, crypto via v1beta3).  Provides:

  - `get_latest_price(ticker)` — last trade price from the stream
  - `get_bars(ticker, timeframe, limit)` — rolling bar window seeded by REST,
    then kept current by the streaming minute bars

The auto-trader and frontend WebSocket consumers read from this shared cache
instead of hitting the REST API on every tick.

Architecture:
  - Two background asyncio tasks (stocks + crypto) run the WebSocket loops
  - On first subscription of a ticker, 150 historical bars are fetched via REST
    (one-time bootstrap) and stored in _bar_cache
  - Incoming minute bars from the WebSocket are aggregated into higher-timeframe
    bars as they close
  - Graceful degradation: if the WS is down, callers get `None` and fall back
    to REST — the stream manager never blocks or crashes the auto-trader
"""

from __future__ import annotations

import asyncio
import json
import random
import time
from collections import deque
from typing import Any

import websockets
from websockets.exceptions import ConnectionClosed

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.models.schemas import Candle, Timeframe, TIMEFRAME_SECONDS

logger = get_logger(__name__)

# How many bars to keep per (ticker, timeframe) pair
_MAX_BARS = 250

# Price is considered stale after this many seconds
_PRICE_STALE_SECONDS = 30.0


class AlpacaStreamManager:
    """Centralised Alpaca WebSocket connection + bar/price cache."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._latest_prices: dict[str, tuple[float, float]] = {}  # symbol → (price, ts)
        self._bar_cache: dict[tuple[str, str], deque[Candle]] = {}  # (ticker, tf_value) → deque
        self._subscribed_stocks: set[str] = set()
        self._subscribed_crypto: set[str] = set()
        self._lock = asyncio.Lock()
        self._stock_task: asyncio.Task[None] | None = None
        self._crypto_task: asyncio.Task[None] | None = None
        self._stock_ws: Any = None
        self._crypto_ws: Any = None
        self._running = False

    # ─── Lifecycle ───────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Launch background WebSocket tasks.  Idempotent."""
        if self._running:
            return
        self._running = True

        api_key = self._settings.alpaca_api_key
        secret = self._settings.alpaca_secret_key
        if not api_key or not secret:
            logger.warning("stream_manager_no_keys", msg="No Alpaca API keys — stream manager disabled")
            self._running = False
            return

        self._stock_task = asyncio.create_task(
            self._ws_loop(
                url=self._settings.alpaca_ws_stock_url,
                label="stock",
                api_key=api_key,
                secret_key=secret,
            ),
            name="stream_manager_stock",
        )
        self._crypto_task = asyncio.create_task(
            self._ws_loop(
                url=self._settings.alpaca_ws_crypto_url,
                label="crypto",
                api_key=api_key,
                secret_key=secret,
            ),
            name="stream_manager_crypto",
        )
        logger.info("stream_manager_started")

    async def stop(self) -> None:
        """Cancel background tasks and close connections."""
        self._running = False
        for task in (self._stock_task, self._crypto_task):
            if task and not task.done():
                task.cancel()
        await asyncio.gather(
            self._stock_task or asyncio.sleep(0),
            self._crypto_task or asyncio.sleep(0),
            return_exceptions=True,
        )
        logger.info("stream_manager_stopped")

    # ─── Public reads (called by auto-trader / scheduler) ────────────────────

    def get_latest_price(self, ticker: str) -> float | None:
        """
        Return the last trade price from the WebSocket stream.
        Returns None if no price is available or the price is stale (>30 s).
        """
        entry = self._latest_prices.get(ticker)
        if entry is None:
            return None
        price, ts = entry
        if time.time() - ts > _PRICE_STALE_SECONDS:
            return None
        return price

    def get_bars(
        self,
        ticker: str,
        timeframe: Timeframe,
        limit: int = 200,
    ) -> list[Candle] | None:
        """
        Return the last `limit` bars from the rolling cache.
        Returns None if no bars are cached for this (ticker, timeframe).
        """
        key = (ticker, timeframe.value)
        dq = self._bar_cache.get(key)
        if dq is None or len(dq) == 0:
            return None
        bars = list(dq)[-limit:]
        return bars if len(bars) >= 10 else None

    # ─── Subscription management ─────────────────────────────────────────────

    async def update_subscriptions(
        self,
        needed_tickers: set[str],
        market_svc: Any = None,
    ) -> None:
        """
        Sync WebSocket subscriptions with the set of tickers actively needed.
        Subscribes to new tickers, unsubscribes from stale ones.
        If `market_svc` is provided, bootstraps bar cache for new tickers.
        """
        needed_stocks = {t for t in needed_tickers if "/" not in t}
        needed_crypto = {t for t in needed_tickers if "/" in t}

        # ── Stock subscriptions ──────────────────────────────────────────────
        new_stocks = needed_stocks - self._subscribed_stocks
        gone_stocks = self._subscribed_stocks - needed_stocks

        if new_stocks and self._stock_ws:
            try:
                await self._stock_ws.send(json.dumps({
                    "action": "subscribe",
                    "trades": sorted(new_stocks),
                    "bars": sorted(new_stocks),
                }))
                self._subscribed_stocks |= new_stocks
                logger.info("stream_manager_subscribed_stocks", tickers=sorted(new_stocks))
            except Exception as exc:
                logger.warning("stream_manager_subscribe_error", label="stock", error=str(exc))

        if gone_stocks and self._stock_ws:
            try:
                await self._stock_ws.send(json.dumps({
                    "action": "unsubscribe",
                    "trades": sorted(gone_stocks),
                    "bars": sorted(gone_stocks),
                }))
                self._subscribed_stocks -= gone_stocks
                logger.info("stream_manager_unsubscribed_stocks", tickers=sorted(gone_stocks))
            except Exception as exc:
                logger.warning("stream_manager_unsubscribe_error", label="stock", error=str(exc))

        # ── Crypto subscriptions ─────────────────────────────────────────────
        new_crypto = needed_crypto - self._subscribed_crypto
        gone_crypto = self._subscribed_crypto - needed_crypto

        if new_crypto and self._crypto_ws:
            try:
                await self._crypto_ws.send(json.dumps({
                    "action": "subscribe",
                    "trades": sorted(new_crypto),
                    "bars": sorted(new_crypto),
                }))
                self._subscribed_crypto |= new_crypto
                logger.info("stream_manager_subscribed_crypto", tickers=sorted(new_crypto))
            except Exception as exc:
                logger.warning("stream_manager_subscribe_error", label="crypto", error=str(exc))

        if gone_crypto and self._crypto_ws:
            try:
                await self._crypto_ws.send(json.dumps({
                    "action": "unsubscribe",
                    "trades": sorted(gone_crypto),
                    "bars": sorted(gone_crypto),
                }))
                self._subscribed_crypto -= gone_crypto
                logger.info("stream_manager_unsubscribed_crypto", tickers=sorted(gone_crypto))
            except Exception as exc:
                logger.warning("stream_manager_unsubscribe_error", label="crypto", error=str(exc))

        # ── Bootstrap bar cache for brand-new tickers ────────────────────────
        if market_svc and (new_stocks or new_crypto):
            bootstrap_tasks = []
            for ticker in new_stocks | new_crypto:
                bootstrap_tasks.append(self._bootstrap_bars(ticker, market_svc))
            if bootstrap_tasks:
                await asyncio.gather(*bootstrap_tasks, return_exceptions=True)

    async def _bootstrap_bars(self, ticker: str, market_svc: Any) -> None:
        """
        Fetch 150 historical bars via REST for each standard timeframe
        and seed the bar cache.  Called once per new ticker subscription.
        """
        # Only bootstrap timeframes that strategies might actually use
        timeframes = [Timeframe.M1, Timeframe.M5, Timeframe.M15, Timeframe.H1, Timeframe.D1]
        for tf in timeframes:
            key = (ticker, tf.value)
            if key in self._bar_cache:
                continue
            try:
                bars = await market_svc.get_ohlcv(ticker, tf, limit=150)
                if bars:
                    async with self._lock:
                        self._bar_cache[key] = deque(bars, maxlen=_MAX_BARS)
                    logger.info(
                        "stream_manager_bootstrap",
                        ticker=ticker, timeframe=tf.value, count=len(bars),
                    )
            except Exception as exc:
                logger.warning(
                    "stream_manager_bootstrap_error",
                    ticker=ticker, timeframe=tf.value, error=str(exc),
                )

    # ─── WebSocket loop (shared between stock & crypto) ──────────────────────

    async def _ws_loop(
        self,
        url: str,
        label: str,
        api_key: str,
        secret_key: str,
    ) -> None:
        """
        Persistent WebSocket connection loop with exponential backoff reconnect.
        Runs until self._running is False or the task is cancelled.
        """
        delay = 1.0
        max_delay = float(self._settings.ws_reconnect_max_delay)

        while self._running:
            try:
                async with websockets.connect(
                    url,
                    ping_interval=30,
                    ping_timeout=10,
                    close_timeout=5,
                    max_size=10 * 1024 * 1024,  # 10 MB
                ) as ws:
                    logger.info("stream_manager_connected", label=label, url=url)

                    # Store ws reference for subscription management
                    if label == "stock":
                        self._stock_ws = ws
                    else:
                        self._crypto_ws = ws

                    # ── Authenticate ─────────────────────────────────────────
                    await ws.send(json.dumps({
                        "action": "auth",
                        "key": api_key,
                        "secret": secret_key,
                    }))

                    # Wait for auth response
                    auth_raw = await asyncio.wait_for(ws.recv(), timeout=10.0)
                    auth_msgs = json.loads(auth_raw)
                    if isinstance(auth_msgs, list):
                        for msg in auth_msgs:
                            if msg.get("T") == "error":
                                logger.error(
                                    "stream_manager_auth_error",
                                    label=label, code=msg.get("code"), detail=msg.get("msg"),
                                )
                                return  # Don't retry on auth failure
                            if msg.get("T") == "success" and msg.get("msg") == "authenticated":
                                logger.info("stream_manager_authenticated", label=label)

                    # ── Subscribe to already-known tickers ───────────────────
                    tickers = (
                        self._subscribed_stocks if label == "stock"
                        else self._subscribed_crypto
                    )
                    if tickers:
                        await ws.send(json.dumps({
                            "action": "subscribe",
                            "trades": sorted(tickers),
                            "bars": sorted(tickers),
                        }))
                        logger.info("stream_manager_resubscribed", label=label, count=len(tickers))

                    delay = 1.0  # Reset backoff on successful connect

                    # ── Message loop ─────────────────────────────────────────
                    async for raw in ws:
                        if not self._running:
                            break
                        try:
                            messages = json.loads(raw)
                            if not isinstance(messages, list):
                                messages = [messages]
                            for msg in messages:
                                await self._dispatch(msg)
                        except json.JSONDecodeError:
                            logger.warning("stream_manager_bad_json", label=label)

            except asyncio.CancelledError:
                logger.info("stream_manager_cancelled", label=label)
                return
            except ConnectionClosed as exc:
                logger.warning("stream_manager_disconnected", label=label, code=exc.code, reason=str(exc.reason))
            except Exception as exc:
                logger.warning("stream_manager_error", label=label, error=str(exc))

            # Clear ws reference
            if label == "stock":
                self._stock_ws = None
            else:
                self._crypto_ws = None

            if not self._running:
                return

            # Exponential backoff with jitter
            jitter = random.uniform(0, delay * 0.3)
            wait = min(delay + jitter, max_delay)
            logger.info("stream_manager_reconnecting", label=label, delay_s=round(wait, 1))
            await asyncio.sleep(wait)
            delay = min(delay * 2, max_delay)

    # ─── Message dispatch ────────────────────────────────────────────────────

    async def _dispatch(self, msg: dict[str, Any]) -> None:
        """Route an incoming message to the appropriate handler."""
        msg_type = msg.get("T")

        if msg_type == "t":
            # Trade update
            self._handle_trade(msg)
        elif msg_type == "b":
            # Minute bar
            await self._handle_bar(msg)
        elif msg_type == "success":
            pass  # Auth/subscription confirmations — already logged
        elif msg_type == "subscription":
            logger.debug(
                "stream_manager_subscription_ack",
                trades=msg.get("trades"),
                bars=msg.get("bars"),
            )
        elif msg_type == "error":
            logger.warning(
                "stream_manager_stream_error",
                code=msg.get("code"), detail=msg.get("msg"),
            )

    def _handle_trade(self, msg: dict[str, Any]) -> None:
        """Update latest price from a trade message."""
        symbol = msg.get("S", "")
        price = msg.get("p")
        if symbol and price is not None:
            self._latest_prices[symbol] = (float(price), time.time())

    async def _handle_bar(self, msg: dict[str, Any]) -> None:
        """
        Process an incoming minute bar from the WebSocket.

        Alpaca streams 1-minute bars.  We append to the M1 cache directly.
        For higher timeframes (5m, 15m, 1h, 4h, 1d), we aggregate:
        when enough M1 bars have accumulated to close a higher-timeframe
        bucket, we build the OHLCV candle and append it.
        """
        symbol = msg.get("S", "")
        if not symbol:
            return

        ts_str = msg.get("t", "")  # ISO 8601 timestamp
        bar = Candle(
            time=int(self._iso_to_unix(ts_str)),
            open=float(msg.get("o", 0)),
            high=float(msg.get("h", 0)),
            low=float(msg.get("l", 0)),
            close=float(msg.get("c", 0)),
            volume=float(msg.get("v", 0)),
        )

        # Also update latest price from the bar close
        self._latest_prices[symbol] = (bar.close, time.time())

        # Append to M1 cache
        m1_key = (symbol, Timeframe.M1.value)
        async with self._lock:
            if m1_key not in self._bar_cache:
                self._bar_cache[m1_key] = deque(maxlen=_MAX_BARS)
            self._bar_cache[m1_key].append(bar)

        # Aggregate into higher timeframes
        await self._aggregate_bar(symbol, bar)

    async def _aggregate_bar(self, symbol: str, m1_bar: Candle) -> None:
        """
        Check if the incoming M1 bar completes a higher-timeframe bucket.
        If so, build the aggregated OHLCV candle and append it.
        """
        higher_tfs = [
            (Timeframe.M5, 5),
            (Timeframe.M15, 15),
            (Timeframe.H1, 60),
            (Timeframe.H4, 240),
            (Timeframe.D1, 1440),
        ]

        for tf, minutes in higher_tfs:
            bucket_seconds = minutes * 60
            bucket_start = m1_bar.time - (m1_bar.time % bucket_seconds)
            key = (symbol, tf.value)

            async with self._lock:
                dq = self._bar_cache.get(key)
                if dq is None:
                    # No bootstrapped data for this timeframe — skip aggregation
                    continue

                # Check if there's already a bar for this bucket (in-progress)
                if dq and dq[-1].time == bucket_start:
                    # Update in-progress bar
                    current = dq[-1]
                    current.high = max(current.high, m1_bar.high)
                    current.low = min(current.low, m1_bar.low)
                    current.close = m1_bar.close
                    current.volume += m1_bar.volume
                else:
                    # New bucket — append new bar
                    dq.append(Candle(
                        time=bucket_start,
                        open=m1_bar.open,
                        high=m1_bar.high,
                        low=m1_bar.low,
                        close=m1_bar.close,
                        volume=m1_bar.volume,
                    ))

    @staticmethod
    def _iso_to_unix(iso: str) -> float:
        """Convert an ISO 8601 timestamp to Unix epoch seconds."""
        from datetime import datetime, timezone
        try:
            # Alpaca sends e.g. "2024-01-15T14:30:00Z"
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            return dt.timestamp()
        except (ValueError, AttributeError):
            return time.time()
