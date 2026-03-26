"""
Auto-Trade Scheduler
────────────────────
A single asyncio background task that runs forever while the FastAPI process
is alive.  Every POLL_INTERVAL_SECONDS it:

  1. Queries Firestore for all strategies with autoTrade == True (all users).
  2. Fetches user email + notification prefs once per unique UID.
  3. Fires check_strategy() for each active strategy concurrently.
  4. Separately checks strategies with autoTrade == False for signal-alert emails.
  5. Sleeps until the next tick.

The task is started inside the FastAPI lifespan context manager so it shares
the same event loop as the HTTP server and the MarketDataService.

Errors inside individual strategy checks are caught by check_strategy()
itself; errors in gather() are caught here via return_exceptions=True.
"""

from __future__ import annotations

import asyncio
import os
from collections import defaultdict

from app.core.logging import get_logger
from app.engine.auto_trader import check_strategy
from app.engine.signals import detect_signals
from app.services.firestore_service import (
    get_active_strategies,
    get_notification_prefs,
    get_signal_watch_strategies,
    get_user_email,
    update_strategy,
)
from app.services.market_data import MarketDataService
from app.services.email_service import email_signal, fire_email
from app.services.stream_manager import AlpacaStreamManager
from app.models.schemas import Timeframe

logger = get_logger(__name__)

# Configurable via AUTO_TRADE_INTERVAL_SECONDS env var.
# Default 15 s — fast enough to catch 1m candle signals in near real-time.
POLL_INTERVAL_SECONDS = int(os.environ.get("AUTO_TRADE_INTERVAL_SECONDS", "15"))

_FRONTEND_TO_TF: dict[str, Timeframe] = {
    "1m":    Timeframe.M1,
    "5m":    Timeframe.M5,
    "15m":   Timeframe.M15,
    "1h":    Timeframe.H1,
    "4h":    Timeframe.H4,
    "1d":    Timeframe.D1,
    "1Min":  Timeframe.M1,
    "5Min":  Timeframe.M5,
    "15Min": Timeframe.M15,
    "1Hour": Timeframe.H1,
    "4Hour": Timeframe.H4,
    "1Day":  Timeframe.D1,
}


async def _build_user_context(uids: set[str]) -> dict[str, tuple[str | None, dict]]:
    """
    For each UID fetch (email, notif_prefs) concurrently.
    Returns {uid: (email, prefs)}.
    """
    async def _fetch(uid: str) -> tuple[str, str | None, dict]:
        email = await get_user_email(uid)
        prefs = await get_notification_prefs(uid)
        return uid, email, prefs

    results = await asyncio.gather(*[_fetch(uid) for uid in uids], return_exceptions=True)
    context: dict[str, tuple[str | None, dict]] = {}
    for item in results:
        if isinstance(item, Exception):
            logger.warning("user_context_fetch_error", error=str(item))
            continue
        uid, email, prefs = item
        context[uid] = (email, prefs)
    return context


async def _check_signal_watch(
    uid: str,
    strategy: dict,
    market_svc: MarketDataService,
    user_email: str | None,
    notif_prefs: dict,
) -> None:
    """
    For strategies with autoTrade=False: detect signals and fire an email
    alert if the user has emailOnSignal enabled.  No orders are placed.
    """
    if not user_email:
        return
    if not notif_prefs.get("emailEnabled") or not notif_prefs.get("emailOnSignal", True):
        return

    strategy_id = strategy.get("id", "<unknown>")
    ticker = strategy.get("ticker", "")
    if not ticker:
        return

    tf_str = strategy.get("timeframe", "15m")
    tf_enum = _FRONTEND_TO_TF.get(tf_str, Timeframe.M15)

    try:
        candles = await market_svc.get_ohlcv(ticker, tf_enum, limit=150)
    except Exception as exc:
        logger.warning("signal_watch_bar_fetch_failed", uid=uid, strategy_id=strategy_id, error=str(exc))
        return

    if len(candles) < 10:
        return

    bars = [
        {"time": c.time, "open": c.open, "high": c.high,
         "low": c.low, "close": c.close, "volume": c.volume}
        for c in candles
    ]

    signals = detect_signals(bars, strategy)
    if not signals:
        return

    latest = signals[-1]

    # Dedup — same guard as auto_trader
    last_exec = strategy.get("lastExecutedSignalTime") or 0
    if latest["time"] <= last_exec:
        return

    logger.info(
        "signal_watch_alert",
        uid=uid, strategy_id=strategy_id, ticker=ticker,
        direction=latest["direction"], signal_time=latest["time"],
    )

    # Mark as "notified" so we don't spam on every tick
    await update_strategy(uid, strategy_id, {"lastExecutedSignalTime": latest["time"]})

    fire_email(email_signal(
        to=user_email,
        strategy_name=strategy.get("name", ""),
        ticker=ticker,
        timeframe=tf_str,
        indicator=strategy.get("indicator", ""),
        direction=latest["direction"],
        price=latest["price"],
        timestamp=latest["time"],
    ))


async def auto_trade_loop(
    market_svc: MarketDataService,
    stream_mgr: AlpacaStreamManager | None = None,
) -> None:
    """
    Main perpetual loop.  Runs until cancelled (FastAPI shutdown).
    """
    logger.info("auto_trade_scheduler_started", interval_s=POLL_INTERVAL_SECONDS)

    while True:
        try:
            # ── Fetch active strategies (autoTrade=True) ──────────────────────
            strategies = await get_active_strategies()

            # ── Collect all UIDs to batch-fetch context ───────────────────────
            all_uids: set[str] = {uid for uid, _ in strategies}

            # Also include signal-watch strategy UIDs
            signal_watch: list[tuple[str, dict]] = []
            try:
                signal_watch = await get_signal_watch_strategies()
                all_uids |= {uid for uid, _ in signal_watch}
            except Exception as exc:
                logger.warning("signal_watch_fetch_error", error=str(exc))

            # ── Sync stream-manager subscriptions ─────────────────────────────
            if stream_mgr:
                needed_tickers: set[str] = set()
                for _, strat in strategies:
                    t = strat.get("ticker")
                    if t:
                        needed_tickers.add(t)
                for _, strat in signal_watch:
                    t = strat.get("ticker")
                    if t:
                        needed_tickers.add(t)
                if needed_tickers:
                    await stream_mgr.update_subscriptions(needed_tickers, market_svc)

            # ── Batch-fetch email + prefs once per unique user ────────────────
            user_context: dict[str, tuple[str | None, dict]] = {}
            if all_uids:
                user_context = await _build_user_context(all_uids)

            # ── Execute auto-trade strategies ─────────────────────────────────
            if strategies:
                logger.info("auto_trade_checking", count=len(strategies))
                tasks = [
                    check_strategy(
                        uid, strategy, market_svc,
                        user_email=user_context.get(uid, (None, {}))[0],
                        notif_prefs=user_context.get(uid, (None, {}))[1],
                        stream_mgr=stream_mgr,
                    )
                    for uid, strategy in strategies
                ]
                results = await asyncio.gather(*tasks, return_exceptions=True)

                for (uid, strategy), result in zip(strategies, results):
                    if isinstance(result, Exception):
                        logger.error(
                            "auto_trade_check_error",
                            uid=uid,
                            strategy_id=strategy.get("id"),
                            error=str(result),
                        )
            else:
                logger.debug("auto_trade_no_active_strategies")

            # ── Signal-watch (autoTrade=False) for email alerts ───────────────
            if signal_watch:
                sw_tasks = [
                    _check_signal_watch(
                        uid, strategy, market_svc,
                        user_email=user_context.get(uid, (None, {}))[0],
                        notif_prefs=user_context.get(uid, (None, {}))[1],
                    )
                    for uid, strategy in signal_watch
                ]
                await asyncio.gather(*sw_tasks, return_exceptions=True)

        except asyncio.CancelledError:
            logger.info("auto_trade_scheduler_stopped")
            return
        except Exception as exc:
            # Top-level safety net — keep the loop alive even on unexpected errors
            logger.error("auto_trade_loop_error", error=str(exc), exc_info=True)

        await asyncio.sleep(POLL_INTERVAL_SECONDS)
