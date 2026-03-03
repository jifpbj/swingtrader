"""
Market Data Service
───────────────────
Abstract base + two concrete implementations:

  MockMarketDataService   — deterministic seeded data, no API keys needed.
  AlpacaMarketDataService — live Alpaca Markets REST + WebSocket feed.

Inject via app/api/dependencies.py — callers never instantiate directly.
"""

from __future__ import annotations

import asyncio
import math
import random
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import AsyncIterator

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.schemas import Candle, Timeframe, TIMEFRAME_SECONDS

logger = get_logger(__name__)

# ─── Timeframe → Alpaca bar size mapping ──────────────────────────────────────
_ALPACA_TIMEFRAME: dict[Timeframe, str] = {
    Timeframe.M1:  "1Min",
    Timeframe.M5:  "5Min",
    Timeframe.M15: "15Min",
    Timeframe.H1:  "1Hour",
    Timeframe.H4:  "4Hour",
    Timeframe.D1:  "1Day",
}

# Default anchor prices for mock data (extended when new tickers are requested)
_SEED_PRICES: dict[str, float] = {
    "BTC/USD":  67_000.0,
    "BTC/USDT": 67_000.0,
    "ETH/USD":  3_800.0,
    "ETH/USDT": 3_800.0,
    "SOL/USD":  178.0,
    "SOL/USDT": 178.0,
    "AAPL":     192.5,
    "TSLA":     248.0,
    "NVDA":     875.0,
    "EUR/USD":  1.086,
}


# ─── Abstract base ─────────────────────────────────────────────────────────────

class MarketDataService(ABC):
    """All market data sources must implement this interface."""

    @abstractmethod
    async def get_ohlcv(
        self,
        ticker: str,
        timeframe: Timeframe,
        limit: int = 200,
    ) -> list[Candle]:
        """Return historical OHLCV bars, newest last."""

    @abstractmethod
    async def get_latest_price(self, ticker: str) -> float:
        """Return the most recent trade price."""

    @abstractmethod
    async def stream_ticks(
        self,
        ticker: str,
        timeframe: Timeframe,
        interval_seconds: float,
    ) -> AsyncIterator[Candle]:
        """
        Async generator that yields a simulated or live tick candle
        every `interval_seconds`.  Caller must `aclose()` the generator.
        """


# ─── Mock implementation ───────────────────────────────────────────────────────

class MockMarketDataService(MarketDataService):
    """
    Generates deterministic synthetic OHLCV data.

    Uses a seeded geometric Brownian motion (GBM) model so results are
    reproducible across restarts (same seed → same history).
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        self._prices: dict[str, float] = {}  # tracks live price per ticker

    async def get_ohlcv(
        self,
        ticker: str,
        timeframe: Timeframe,
        limit: int = 200,
    ) -> list[Candle]:
        bars = await asyncio.get_event_loop().run_in_executor(
            None, self._generate_bars, ticker, timeframe, limit
        )
        logger.debug("mock_ohlcv_generated", ticker=ticker, count=len(bars))
        return bars

    async def get_latest_price(self, ticker: str) -> float:
        return self._prices.get(ticker, _SEED_PRICES.get(ticker, 100.0))

    async def stream_ticks(
        self,
        ticker: str,
        timeframe: Timeframe,
        interval_seconds: float = 1.0,
    ) -> AsyncIterator[Candle]:
        price = self._prices.get(ticker, _SEED_PRICES.get(ticker, 100.0))
        bar_seconds = TIMEFRAME_SECONDS.get(timeframe, 60)

        while True:
            await asyncio.sleep(interval_seconds)

            # GBM tick: μ=0, σ scaled to feel realistic
            sigma = 0.0025 if price > 1_000 else 0.003
            drift = random.gauss(0, sigma)
            price *= math.exp(drift)

            now = int(time.time())
            half_spread = price * 0.0008
            low_wick = price * random.uniform(0.0002, 0.0015)
            high_wick = price * random.uniform(0.0002, 0.0015)
            open_price = price * (1 + random.gauss(0, 0.0005))

            candle = Candle(
                time=now - (now % bar_seconds),  # floor to bar boundary
                open=round(open_price, 4),
                high=round(max(open_price, price) + high_wick, 4),
                low=round(min(open_price, price) - low_wick, 4),
                close=round(price, 4),
                volume=round(random.uniform(50, 2000), 2),
            )

            self._prices[ticker] = price
            yield candle

    # ─── Bar generation (executor) ────────────────────────────────────────────

    def _generate_bars(
        self, ticker: str, timeframe: Timeframe, limit: int
    ) -> list[Candle]:
        seed_price = _SEED_PRICES.get(ticker, 100.0)
        bar_seconds = TIMEFRAME_SECONDS.get(timeframe, 900)
        now = int(time.time())

        # Deterministic seed based on ticker so history is stable
        rng = random.Random(abs(hash(ticker)) % (2**31))

        price = seed_price
        bars: list[Candle] = []

        for i in range(limit, 0, -1):
            sigma = 0.002 if seed_price > 1_000 else 0.003
            drift = rng.gauss(0, sigma)
            price = max(price * math.exp(drift), 0.01)

            open_p = price * (1 + rng.gauss(0, 0.0003))
            close_p = price
            high_extra = price * rng.uniform(0.0002, 0.006)
            low_extra = price * rng.uniform(0.0002, 0.006)

            bar_time = now - i * bar_seconds
            bars.append(
                Candle(
                    time=bar_time,
                    open=round(open_p, 4),
                    high=round(max(open_p, close_p) + high_extra, 4),
                    low=round(min(open_p, close_p) - low_extra, 4),
                    close=round(close_p, 4),
                    volume=round(rng.uniform(100, 5000), 2),
                )
            )

        self._prices[ticker] = price
        return bars


# ─── Alpaca implementation ────────────────────────────────────────────────────

class AlpacaMarketDataService(MarketDataService):
    """
    Fetches OHLCV data from Alpaca Markets REST API v2.
    Uses httpx for async HTTP.

    For live tick streaming, Alpaca provides a WebSocket feed at:
      wss://stream.data.alpaca.markets/v2/{feed}/{symbol}
    The `stream_ticks` method here polls the REST API instead for simplicity;
    use the Alpaca SDK's WebSocket client for production-grade streaming.
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        self._headers = {
            "APCA-API-KEY-ID": self._settings.alpaca_api_key,
            "APCA-API-SECRET-KEY": self._settings.alpaca_secret_key,
        }
        self._http: httpx.AsyncClient | None = None

    async def _client(self) -> httpx.AsyncClient:
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(
                base_url=self._settings.alpaca_data_url,
                headers=self._headers,
                timeout=10.0,
            )
        return self._http

    async def close(self) -> None:
        if self._http and not self._http.is_closed:
            await self._http.aclose()

    async def get_ohlcv(
        self,
        ticker: str,
        timeframe: Timeframe,
        limit: int = 200,
    ) -> list[Candle]:
        """
        GET /v2/stocks/{symbol}/bars  or  /v2/crypto/bars
        https://docs.alpaca.markets/reference/stockbars
        """
        is_crypto = "/" in ticker
        base = "/v2/crypto/bars" if is_crypto else "/v2/stocks/bars"
        symbol = ticker.replace("/", "")  # Alpaca uses "BTCUSD" not "BTC/USD"

        client = await self._client()
        try:
            resp = await client.get(
                base,
                params={
                    "symbols": symbol,
                    "timeframe": _ALPACA_TIMEFRAME[timeframe],
                    "limit": limit,
                    "sort": "asc",
                },
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "alpaca_bars_error",
                ticker=ticker,
                status=exc.response.status_code,
                detail=exc.response.text[:200],
            )
            raise

        bars_raw = data.get("bars", {}).get(symbol, [])
        bars: list[Candle] = []
        for b in bars_raw:
            ts = int(
                datetime.fromisoformat(b["t"].replace("Z", "+00:00"))
                .astimezone(timezone.utc)
                .timestamp()
            )
            bars.append(
                Candle(
                    time=ts,
                    open=b["o"],
                    high=b["h"],
                    low=b["l"],
                    close=b["c"],
                    volume=b["v"],
                )
            )

        logger.info("alpaca_bars_fetched", ticker=ticker, count=len(bars))
        return bars

    async def get_latest_price(self, ticker: str) -> float:
        is_crypto = "/" in ticker
        base = "/v2/crypto/latest/trades" if is_crypto else "/v2/stocks/trades/latest"
        symbol = ticker.replace("/", "")

        client = await self._client()
        try:
            resp = await client.get(base, params={"symbols": symbol})
            resp.raise_for_status()
            data = resp.json()
            trade = data.get("trades", {}).get(symbol, {})
            return float(trade.get("p", 0))
        except Exception as exc:
            logger.warning("alpaca_price_error", ticker=ticker, error=str(exc))
            return 0.0

    async def stream_ticks(
        self,
        ticker: str,
        timeframe: Timeframe,
        interval_seconds: float = 1.0,
    ) -> AsyncIterator[Candle]:
        """
        Polls the latest bar on each interval.
        For true streaming, integrate alpaca-py's DataStream client here.
        """
        last_sig: tuple[int, float, float, float, float] | None = None
        while True:
            await asyncio.sleep(interval_seconds)
            try:
                bars = await self.get_ohlcv(ticker, timeframe, limit=1)
                if bars:
                    latest = bars[-1]
                    sig = (
                        latest.time,
                        latest.open,
                        latest.high,
                        latest.low,
                        latest.close,
                    )
                    if sig != last_sig:
                        last_sig = sig
                        yield latest
            except Exception as exc:
                logger.warning("alpaca_stream_error", ticker=ticker, error=str(exc))
