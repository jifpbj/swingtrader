"""
Auto-Trader Engine — per-strategy execution
────────────────────────────────────────────
Called by the scheduler every N s for each strategy that has autoTrade=True.

Flow per strategy:
  1. Map frontend timeframe string → backend Timeframe enum
  2. Fetch 150 OHLCV bars via the shared MarketDataService
  3. Detect crossover signals via signals.py
  4. Dedup: skip if signal already executed (lastExecutedSignalTime)
  5. Fetch per-user Alpaca keys from Firestore (cached 5 min)
  6. Check current Alpaca position for the symbol
  7. Determine order side (buy / sell / skip)
  8. Compute order qty (dollar-mode or unit-mode)
  9. Place market order via Alpaca REST API
  10. Write result back to Firestore (openEntry or TradeRecord)
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.core.logging import get_logger
from app.engine.signals import detect_signals
from app.models.schemas import Timeframe
from app.services.firestore_service import (
    add_trade,
    get_alpaca_keys,
    update_strategy,
)
from app.services.market_data import MarketDataService

logger = get_logger(__name__)

# ─── Timeframe mapping (frontend string → backend enum) ──────────────────────

_FRONTEND_TO_TF: dict[str, Timeframe] = {
    "1m":  Timeframe.M1,
    "5m":  Timeframe.M5,
    "15m": Timeframe.M15,
    "1h":  Timeframe.H1,
    "4h":  Timeframe.H4,
    "1d":  Timeframe.D1,
    # tolerate backend enum values passed directly
    "1Min":  Timeframe.M1,
    "5Min":  Timeframe.M5,
    "15Min": Timeframe.M15,
    "1Hour": Timeframe.H1,
    "4Hour": Timeframe.H4,
    "1Day":  Timeframe.D1,
}

_DEFAULT_TF = Timeframe.M15

# ─── Alpaca base URLs ─────────────────────────────────────────────────────────

_ALPACA_BASE: dict[str, str] = {
    "paper": "https://paper-api.alpaca.markets",
    "live":  "https://api.alpaca.markets",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _alpaca_symbol(ticker: str) -> str:
    """BTC/USD → BTCUSD (Alpaca expects no slash for crypto)."""
    return ticker.replace("/", "")


async def _fetch_position(
    symbol: str,
    base_url: str,
    api_key: str,
    secret_key: str,
) -> dict[str, Any] | None:
    """
    GET /v2/positions/{symbol}.
    Returns the position dict or None if no open position.
    """
    headers = {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": secret_key,
    }
    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as client:
        try:
            resp = await client.get(f"/v2/positions/{symbol}", headers=headers)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return None
            logger.warning(
                "alpaca_position_error",
                symbol=symbol,
                status=exc.response.status_code,
                body=exc.response.text[:300],
                error=str(exc),
            )
            return None
        except Exception as exc:
            logger.warning("alpaca_position_error", symbol=symbol, error=str(exc))
            return None


async def _place_order(
    symbol: str,
    qty: float | None,
    notional: float | None,
    side: str,
    base_url: str,
    api_key: str,
    secret_key: str,
) -> dict[str, Any] | None:
    """
    POST /v2/orders — market order, gtc time_in_force.
    Pass either qty (units) or notional (dollars); not both.
    Returns Alpaca order dict on success, None on error.
    """
    headers = {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": secret_key,
    }
    body: dict[str, Any] = {
        "symbol": symbol,
        "side": side,
        "type": "market",
        "time_in_force": "gtc",
    }
    if notional is not None:
        body["notional"] = str(round(notional, 2))
    elif qty is not None:
        body["qty"] = str(qty)

    logger.info(
        "alpaca_order_attempt",
        symbol=symbol,
        side=side,
        qty=qty,
        notional=notional,
        base_url=base_url,
    )

    async with httpx.AsyncClient(base_url=base_url, timeout=15.0) as client:
        try:
            resp = await client.post("/v2/orders", json=body, headers=headers)
            if not resp.is_success:
                logger.warning(
                    "alpaca_order_rejected",
                    symbol=symbol, side=side,
                    status=resp.status_code,
                    body=resp.text[:500],
                )
                return None
            return resp.json()
        except Exception as exc:
            logger.warning(
                "alpaca_order_error",
                symbol=symbol, side=side, qty=qty, notional=notional, error=str(exc),
            )
            return None


async def _get_latest_price(
    symbol: str,
    api_key: str,
    secret_key: str,
) -> float | None:
    """
    GET /v1beta3/crypto/us/latest/trades or /v2/stocks/trades/latest.
    Returns latest trade price or None.
    Always uses data.alpaca.markets (not paper-api).
    """
    is_crypto = "/" in symbol or (len(symbol) > 5 and symbol.isalpha() is False)
    headers = {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": secret_key,
    }
    data_url = "https://data.alpaca.markets"
    async with httpx.AsyncClient(base_url=data_url, timeout=10.0) as client:
        try:
            if is_crypto:
                resp = await client.get(
                    "/v1beta3/crypto/us/latest/trades",
                    params={"symbols": symbol},
                    headers=headers,
                )
            else:
                resp = await client.get(
                    "/v2/stocks/trades/latest",
                    params={"symbols": symbol},
                    headers=headers,
                )
            resp.raise_for_status()
            trades = resp.json().get("trades", {})
            trade = trades.get(symbol, {})
            price = trade.get("p") or trade.get("price")
            result = float(price) if price else None
            logger.debug("alpaca_price_fetched", symbol=symbol, price=result)
            return result
        except Exception as exc:
            logger.warning("alpaca_price_fetch_error", symbol=symbol, error=str(exc))
            return None


# ─── Core check function ──────────────────────────────────────────────────────

async def check_strategy(
    uid: str,
    strategy: dict[str, Any],
    market_svc: MarketDataService,
) -> None:
    """
    Evaluate one strategy and place an order if a fresh signal is detected.
    Logs every decision point so failures are traceable.
    """
    strategy_id = strategy.get("id", "<unknown>")
    ticker      = strategy.get("ticker", "")

    if not ticker:
        logger.warning("auto_trader_skip_no_ticker", uid=uid, strategy_id=strategy_id)
        return

    logger.info(
        "auto_trader_checking",
        uid=uid,
        strategy_id=strategy_id,
        ticker=ticker,
        indicator=strategy.get("indicator"),
        timeframe=strategy.get("timeframe"),
    )

    # ── 1. Map timeframe ──────────────────────────────────────────────────────
    tf_str  = strategy.get("timeframe", "15m")
    tf_enum = _FRONTEND_TO_TF.get(tf_str, _DEFAULT_TF)
    if tf_str not in _FRONTEND_TO_TF:
        logger.warning("auto_trader_unknown_timeframe", uid=uid, strategy_id=strategy_id, tf=tf_str)

    # ── 2. Fetch OHLCV bars ───────────────────────────────────────────────────
    try:
        candles = await market_svc.get_ohlcv(ticker, tf_enum, limit=150)
    except Exception as exc:
        logger.warning("auto_trader_bar_fetch_failed", uid=uid, strategy_id=strategy_id, error=str(exc))
        return

    if len(candles) < 10:
        logger.warning(
            "auto_trader_skip_insufficient_bars",
            uid=uid, strategy_id=strategy_id, ticker=ticker, bar_count=len(candles),
        )
        return

    logger.info("auto_trader_bars_ok", uid=uid, strategy_id=strategy_id, bar_count=len(candles))

    # Convert Candle objects → plain dicts for signals.py
    bars = [
        {
            "time":   c.time,
            "open":   c.open,
            "high":   c.high,
            "low":    c.low,
            "close":  c.close,
            "volume": c.volume,
        }
        for c in candles
    ]

    # ── 3. Detect signals ─────────────────────────────────────────────────────
    signals = detect_signals(bars, strategy)
    if not signals:
        logger.info(
            "auto_trader_skip_no_signals",
            uid=uid, strategy_id=strategy_id, ticker=ticker,
            indicator=strategy.get("indicator"), params=strategy.get("params"),
        )
        return

    latest = signals[-1]
    logger.info(
        "auto_trader_latest_signal",
        uid=uid, strategy_id=strategy_id, ticker=ticker,
        direction=latest["direction"], signal_time=latest["time"],
        total_signals=len(signals),
    )

    # ── 4. Dedup ──────────────────────────────────────────────────────────────
    last_exec = strategy.get("lastExecutedSignalTime") or 0
    if latest["time"] <= last_exec:
        logger.info(
            "auto_trader_skip_duplicate",
            uid=uid, strategy_id=strategy_id,
            signal_time=latest["time"], last_exec=last_exec,
        )
        return

    # ── 5. Alpaca keys ────────────────────────────────────────────────────────
    trading_mode = strategy.get("tradingMode", "paper")
    keys = await get_alpaca_keys(uid)
    if not keys:
        logger.warning("auto_trader_no_alpaca_keys", uid=uid, strategy_id=strategy_id)
        return

    if trading_mode == "live":
        api_key    = keys.get("liveApiKey", "")
        secret_key = keys.get("liveSecretKey", "")
    else:
        api_key    = keys.get("paperApiKey", "")
        secret_key = keys.get("paperSecretKey", "")

    if not api_key or not secret_key:
        logger.warning(
            "auto_trader_keys_missing",
            uid=uid, strategy_id=strategy_id, trading_mode=trading_mode,
            has_paper_key=bool(keys.get("paperApiKey")),
            has_live_key=bool(keys.get("liveApiKey")),
        )
        return

    base_url   = _ALPACA_BASE.get(trading_mode, _ALPACA_BASE["paper"])
    alpaca_sym = _alpaca_symbol(ticker)

    # ── 6. Current position ───────────────────────────────────────────────────
    position     = await _fetch_position(alpaca_sym, base_url, api_key, secret_key)
    position_qty = float(position.get("qty", 0)) if position else 0.0
    has_position = position_qty > 0

    logger.info(
        "auto_trader_position_check",
        uid=uid, strategy_id=strategy_id,
        symbol=alpaca_sym, has_position=has_position, position_qty=position_qty,
    )

    # ── 7. Determine side ─────────────────────────────────────────────────────
    direction = latest["direction"]
    if direction == "entry" and not has_position:
        side = "buy"
    elif direction == "sell" and has_position:
        side = "sell"
    else:
        logger.info(
            "auto_trader_skip_direction_mismatch",
            uid=uid, strategy_id=strategy_id,
            direction=direction, has_position=has_position,
            hint=(
                "entry+no_position→buy, sell+position→sell; "
                "entry+position or sell+no_position are skipped"
            ),
        )
        return

    # ── 8. Compute qty / notional ─────────────────────────────────────────────
    lot_mode    = strategy.get("lotSizeMode", "dollars")
    lot_dollars = float(strategy.get("lotSizeDollars", 1_000) or 1_000)
    is_crypto   = "/" in ticker

    # Buy side
    order_qty: float | None     = None
    order_notional: float | None = None

    if side == "buy":
        if lot_mode == "dollars" and lot_dollars > 0:
            if is_crypto:
                # Use notional for crypto — Alpaca handles fractional units automatically
                order_notional = lot_dollars
            else:
                # Equities: compute whole-share qty
                price = await _get_latest_price(ticker, api_key, secret_key)
                if price and price > 0:
                    order_qty = max(1.0, round(lot_dollars / price, 6))
                else:
                    # Fallback to 1 unit if price unavailable
                    order_qty = float(strategy.get("orderQty", 1) or 1)
        else:
            # unit mode — use the stored unit count
            order_qty = float(strategy.get("orderQty", 1) or 1)

    # Sell side — always sell the full open position
    else:
        order_qty = position_qty

    if order_qty is None and order_notional is None:
        logger.warning(
            "auto_trader_skip_zero_qty",
            uid=uid, strategy_id=strategy_id, side=side,
        )
        return

    logger.info(
        "auto_trader_placing_order",
        uid=uid, strategy_id=strategy_id,
        symbol=alpaca_sym, side=side, qty=order_qty, notional=order_notional,
        trading_mode=trading_mode, base_url=base_url,
    )

    # ── 9. Place order ────────────────────────────────────────────────────────
    order = await _place_order(
        alpaca_sym, order_qty, order_notional, side, base_url, api_key, secret_key,
    )
    if order is None:
        logger.warning(
            "auto_trader_order_failed",
            uid=uid, strategy_id=strategy_id, symbol=alpaca_sym, side=side,
        )
        return

    signal_time  = latest["time"]
    signal_price = latest["price"]
    now_ms       = int(time.time() * 1000)

    # Resolve actual filled qty from order response for bookkeeping
    filled_qty = float(order.get("filled_qty") or order.get("qty") or order_qty or 0)

    logger.info(
        "auto_trade_executed",
        uid=uid,
        strategy_id=strategy_id,
        ticker=ticker,
        side=side,
        qty=filled_qty,
        notional=order_notional,
        price=signal_price,
        order_id=order.get("id"),
    )

    # ── 10. Write Firestore ───────────────────────────────────────────────────
    if side == "buy":
        await update_strategy(uid, strategy_id, {
            "lastExecutedSignalTime": signal_time,
            "openEntry": {
                "time":  signal_time,
                "price": signal_price,
                "qty":   filled_qty,
            },
            "orderQty": filled_qty,
        })
    else:
        # Compute P&L from openEntry
        open_entry  = strategy.get("openEntry") or {}
        entry_price = float(open_entry.get("price", signal_price))
        entry_qty   = float(open_entry.get("qty", filled_qty))
        entry_time  = int(open_entry.get("time", signal_time))

        pnl_dollars = (signal_price - entry_price) * entry_qty
        pnl_percent = pnl_dollars / (entry_price * entry_qty) if entry_price > 0 else 0.0

        await add_trade(uid, {
            "strategyId":     strategy_id,
            "strategyName":   strategy.get("name", ""),
            "ticker":         alpaca_sym,
            "entryTime":      entry_time,
            "exitTime":       signal_time,
            "entryPrice":     entry_price,
            "exitPrice":      signal_price,
            "qty":            entry_qty,
            "pnlDollars":     pnl_dollars,
            "pnlPercent":     pnl_percent,
            "lotSizeDollars": lot_dollars,
            "createdAt":      now_ms,
        })

        await update_strategy(uid, strategy_id, {
            "lastExecutedSignalTime": signal_time,
            "openEntry": None,
        })
