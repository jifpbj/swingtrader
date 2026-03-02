"""
WebSocket endpoint — /ws/trades/{ticker}

Streams a mixed feed of:
  • candle  — latest OHLCV tick
  • indicator — recomputed TechnicalIndicators every N ticks
  • prediction — updated forecast every M ticks
  • signal  — emitted when a new alpha signal is triggered

The endpoint supports multiple concurrent clients per ticker and
handles clean disconnection without crashing the broadcast loop.
"""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict

import pandas as pd
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.dependencies import (
    get_analysis_engine,
    get_market_data,
    get_predictive_model,
)
from app.api.routes.market import _bars_to_df, _derive_signals, _mock_sentiment
from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.schemas import (
    SentimentSnapshot,
    Timeframe,
    WSMessage,
    WSMessageType,
)

logger = get_logger(__name__)
router = APIRouter(tags=["websocket"])

# ─── Connection registry ──────────────────────────────────────────────────────
# Maps ticker → set of active WebSocket connections.
# Using a module-level dict means all workers share state; for multi-process
# deployments, replace with a Redis pub/sub channel.

_connections: dict[str, set[WebSocket]] = defaultdict(set)


async def _broadcast(ticker: str, message: WSMessage) -> None:
    """Send a message to all subscribers of a ticker, dropping dead sockets."""
    dead: set[WebSocket] = set()
    payload = message.model_dump_json()

    for ws in list(_connections.get(ticker, set())):
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)

    for ws in dead:
        _connections[ticker].discard(ws)


# ─── WebSocket route ──────────────────────────────────────────────────────────

@router.websocket("/ws/trades/{ticker}")
async def ws_trades(
    websocket: WebSocket,
    ticker: str,
) -> None:
    """
    Connect: ws://host/ws/trades/BTC%2FUSD?timeframe=15Min

    Query params:
      timeframe   — Timeframe enum value (default: 15Min)
      horizon     — Prediction horizon in bars (default: 10)
    """
    await websocket.accept()

    # Parse query params
    params = dict(websocket.query_params)
    try:
        timeframe = Timeframe(params.get("timeframe", Timeframe.M15))
    except ValueError:
        timeframe = Timeframe.M15
    horizon = int(params.get("horizon", 10))

    ticker = ticker.upper()
    _connections[ticker].add(websocket)

    logger.info(
        "ws_connected",
        ticker=ticker,
        timeframe=timeframe,
        remote=websocket.client,
    )

    # Grab services from app.state via the websocket's app reference
    app = websocket.app
    svc = get_market_data(websocket)  # type: ignore[arg-type]
    engine = get_analysis_engine(websocket)  # type: ignore[arg-type]
    model = get_predictive_model(websocket)  # type: ignore[arg-type]

    settings = get_settings()
    tick_interval = settings.mock_tick_interval_ms / 1000

    # Send ACK so the client knows the connection is live
    await websocket.send_text(
        WSMessage(
            type=WSMessageType.SUBSCRIBE_ACK,
            data={"ticker": ticker, "timeframe": timeframe, "horizon": horizon},
            timestamp=int(time.time()),
        ).model_dump_json()
    )

    # Pre-fetch history so we can compute indicators immediately
    try:
        bars = await svc.get_ohlcv(ticker, timeframe, limit=200)
    except Exception as exc:
        logger.error("ws_history_fetch_failed", ticker=ticker, error=str(exc))
        bars = []

    df_history: pd.DataFrame = _bars_to_df(bars) if len(bars) >= 50 else pd.DataFrame()

    tick_count = 0
    INDICATOR_EVERY = 5    # recompute indicators every N ticks
    PREDICTION_EVERY = 15  # recompute prediction every M ticks
    SIGNAL_EVERY = 20      # check for new signals every P ticks

    try:
        async for candle in svc.stream_ticks(ticker, tick_interval):
            # ── 1. Broadcast raw candle ───────────────────────────────────────
            await _broadcast(
                ticker,
                WSMessage(
                    type=WSMessageType.CANDLE,
                    data=candle.model_dump(),
                    timestamp=int(time.time()),
                ),
            )

            # Keep rolling history in sync
            if not df_history.empty:
                new_row = pd.DataFrame(
                    [{
                        "open": candle.open, "high": candle.high,
                        "low": candle.low, "close": candle.close,
                        "volume": candle.volume,
                    }],
                    index=[candle.time],
                )
                df_history = pd.concat([df_history, new_row]).iloc[-200:]

            tick_count += 1

            # ── 2. Indicators ─────────────────────────────────────────────────
            if tick_count % INDICATOR_EVERY == 0 and len(df_history) >= 50:
                try:
                    indicators = await engine.compute_indicators(
                        df_history, ticker, timeframe
                    )
                    await _broadcast(
                        ticker,
                        WSMessage(
                            type=WSMessageType.INDICATOR,
                            data=indicators.model_dump(),
                            timestamp=int(time.time()),
                        ),
                    )

                    # ── 3. Prediction ─────────────────────────────────────────
                    if tick_count % PREDICTION_EVERY == 0:
                        forecast = await model.predict(indicators, timeframe, horizon)
                        await _broadcast(
                            ticker,
                            WSMessage(
                                type=WSMessageType.PREDICTION,
                                data=forecast.model_dump(),
                                timestamp=int(time.time()),
                            ),
                        )

                        # ── 4. Signals ────────────────────────────────────────
                        if tick_count % SIGNAL_EVERY == 0:
                            regime = await engine.compute_regime(
                                indicators,
                                SentimentSnapshot(
                                    score=_mock_sentiment(ticker),
                                    source="mock_nlp",
                                    confidence=0.6,
                                ),
                            )
                            signals = _derive_signals(
                                indicators, forecast, regime, ticker, timeframe
                            )
                            for sig in signals:
                                await _broadcast(
                                    ticker,
                                    WSMessage(
                                        type=WSMessageType.SIGNAL,
                                        data=sig.model_dump(),
                                        timestamp=int(time.time()),
                                    ),
                                )

                except Exception as exc:
                    logger.warning(
                        "ws_analysis_error", ticker=ticker, error=str(exc)
                    )

            # Yield control so other coroutines can run
            await asyncio.sleep(0)

    except WebSocketDisconnect:
        logger.info("ws_disconnected", ticker=ticker)
    except Exception as exc:
        logger.error("ws_stream_error", ticker=ticker, error=str(exc))
        try:
            await websocket.send_text(
                WSMessage(
                    type=WSMessageType.ERROR,
                    data={"message": str(exc)},
                    timestamp=int(time.time()),
                ).model_dump_json()
            )
        except Exception:
            pass
    finally:
        _connections[ticker].discard(websocket)
        logger.info(
            "ws_cleanup",
            ticker=ticker,
            remaining=len(_connections.get(ticker, set())),
        )
