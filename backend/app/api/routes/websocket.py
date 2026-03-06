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
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

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

# ─── Stream hub registry ──────────────────────────────────────────────────────
# One producer loop per (ticker, timeframe, horizon) key.
# For multi-process deployments, replace this in-memory registry with
# a shared broker (Redis pub/sub, NATS, Kafka).

StreamKey = tuple[str, Timeframe, int]


@dataclass
class StreamState:
    clients: set[WebSocket] = field(default_factory=set)
    producer: asyncio.Task[None] | None = None


_streams: dict[StreamKey, StreamState] = {}
_streams_lock = asyncio.Lock()


async def _send_safely(ws: WebSocket, payload: str, timeout_s: float = 1.0) -> bool:
    try:
        await asyncio.wait_for(ws.send_text(payload), timeout=timeout_s)
        return True
    except Exception:
        return False


async def _broadcast(key: StreamKey, message: WSMessage) -> int:
    """Fan out to all subscribers of a stream key and prune dead sockets."""
    async with _streams_lock:
        state = _streams.get(key)
        if state is None or not state.clients:
            return 0
        clients = list(state.clients)

    payload = message.model_dump_json()
    results = await asyncio.gather(
        *(_send_safely(ws, payload) for ws in clients),
        return_exceptions=False,
    )

    dead = [ws for ws, ok in zip(clients, results) if not ok]
    if not dead:
        return len(clients)

    async with _streams_lock:
        state = _streams.get(key)
        if state is None:
            return 0
        for ws in dead:
            state.clients.discard(ws)
        return len(state.clients)


async def _subscribe(
    websocket: WebSocket,
    key: StreamKey,
    *,
    start_producer: Callable[[], Awaitable[None]],
) -> int:
    """Register a subscriber and lazily start the producer task."""
    async with _streams_lock:
        state = _streams.get(key)
        if state is None:
            state = StreamState()
            _streams[key] = state
        state.clients.add(websocket)

        if state.producer is None or state.producer.done():
            state.producer = asyncio.create_task(start_producer())

        return len(state.clients)


async def _unsubscribe(websocket: WebSocket, key: StreamKey) -> int:
    """Unregister subscriber and stop producer when stream has no clients."""
    async with _streams_lock:
        state = _streams.get(key)
        if state is None:
            return 0

        state.clients.discard(websocket)
        remaining = len(state.clients)
        producer = state.producer

        if remaining == 0:
            _streams.pop(key, None)
            if producer and not producer.done():
                producer.cancel()

        return remaining


async def _run_stream(
    *,
    key: StreamKey,
    tick_interval: float,
    svc,
    engine,
    model,
) -> None:
    ticker, timeframe, horizon = key

    # Pre-fetch history so we can compute indicators immediately
    try:
        bars = await svc.get_ohlcv(ticker, timeframe, limit=200)
    except Exception as exc:
        logger.error("ws_history_fetch_failed", ticker=ticker, error=str(exc))
        bars = []

    df_history: pd.DataFrame = _bars_to_df(bars) if len(bars) >= 50 else pd.DataFrame()

    tick_count = 0
    INDICATOR_EVERY = 5
    PREDICTION_EVERY = 15
    SIGNAL_EVERY = 20

    try:
        async for candle in svc.stream_ticks(ticker, timeframe, tick_interval):
            # Stop quickly if there are no listeners left.
            async with _streams_lock:
                state = _streams.get(key)
                if state is None or not state.clients:
                    break

            active = await _broadcast(
                key,
                WSMessage(
                    type=WSMessageType.CANDLE,
                    data=candle.model_dump(),
                    timestamp=int(time.time()),
                ),
            )
            if active == 0:
                break

            if not df_history.empty:
                new_row = pd.DataFrame(
                    [{
                        "open": candle.open,
                        "high": candle.high,
                        "low": candle.low,
                        "close": candle.close,
                        "volume": candle.volume,
                    }],
                    index=[candle.time],
                )
                df_history = pd.concat([df_history, new_row]).iloc[-200:]

            tick_count += 1

            if tick_count % INDICATOR_EVERY == 0 and len(df_history) >= 50:
                try:
                    indicators = await engine.compute_indicators(
                        df_history, ticker, timeframe
                    )
                    await _broadcast(
                        key,
                        WSMessage(
                            type=WSMessageType.INDICATOR,
                            data=indicators.model_dump(),
                            timestamp=int(time.time()),
                        ),
                    )

                    if tick_count % PREDICTION_EVERY == 0:
                        forecast = await model.predict(
                            indicators, timeframe, horizon_bars=horizon
                        )
                        await _broadcast(
                            key,
                            WSMessage(
                                type=WSMessageType.PREDICTION,
                                data=forecast.model_dump(),
                                timestamp=int(time.time()),
                            ),
                        )

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
                                    key,
                                    WSMessage(
                                        type=WSMessageType.SIGNAL,
                                        data=sig.model_dump(),
                                        timestamp=int(time.time()),
                                    ),
                                )
                except Exception as exc:
                    logger.warning(
                        "ws_analysis_error",
                        ticker=ticker,
                        timeframe=timeframe,
                        error=str(exc),
                    )

            await asyncio.sleep(0)
    except asyncio.CancelledError:
        logger.info(
            "ws_stream_cancelled",
            ticker=ticker,
            timeframe=timeframe,
            horizon=horizon,
        )
        raise
    except Exception as exc:
        logger.error(
            "ws_stream_error",
            ticker=ticker,
            timeframe=timeframe,
            horizon=horizon,
            error=str(exc),
        )
    finally:
        logger.info(
            "ws_stream_stopped",
            ticker=ticker,
            timeframe=timeframe,
            horizon=horizon,
        )


# ─── WebSocket route ──────────────────────────────────────────────────────────

@router.websocket("/ws/trades/{ticker:path}")
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

    try:
        horizon = int(params.get("horizon", 10))
    except (TypeError, ValueError):
        horizon = 10
    horizon = max(1, min(50, horizon))

    ticker = ticker.upper()
    key: StreamKey = (ticker, timeframe, horizon)

    logger.info(
        "ws_connected",
        ticker=ticker,
        timeframe=timeframe,
        horizon=horizon,
        remote=websocket.client,
    )

    # Grab services from app.state
    svc = get_market_data(websocket)
    engine = get_analysis_engine(websocket)
    model = get_predictive_model(websocket)

    settings = get_settings()
    tick_interval = settings.tick_interval_ms / 1000

    async def start_producer() -> None:
        await _run_stream(
            key=key,
            tick_interval=tick_interval,
            svc=svc,
            engine=engine,
            model=model,
        )

    subscribers = await _subscribe(
        websocket,
        key,
        start_producer=start_producer,
    )

    try:
        # Send ACK so the client knows the connection is live.
        await websocket.send_text(
            WSMessage(
                type=WSMessageType.SUBSCRIBE_ACK,
                data={"ticker": ticker, "timeframe": timeframe, "horizon": horizon},
                timestamp=int(time.time()),
            ).model_dump_json()
        )

        # Keep socket open and detect disconnects.
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
    except WebSocketDisconnect:
        logger.info("ws_disconnected", ticker=ticker, timeframe=timeframe, horizon=horizon)
    except Exception as exc:
        logger.error("ws_connection_error", ticker=ticker, error=str(exc))
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
        remaining = await _unsubscribe(websocket, key)
        logger.info(
            "ws_cleanup",
            ticker=ticker,
            timeframe=timeframe,
            horizon=horizon,
            remaining=remaining,
            subscribers=subscribers,
        )
