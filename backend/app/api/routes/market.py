"""
REST API — Market data, indicators, predictions, signals.

All endpoints are async, use DI for services, and return Pydantic models
that FastAPI serialises to JSON automatically.
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from math import ceil

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from app.api.dependencies import (
    AnalysisEngineDep,
    MarketDataDep,
    PredictiveModelDep,
    _TICKER_RE,
)
from app.core.logging import get_logger
from app.models.schemas import (
    AlphaSignal,
    AssetSearchResult,
    MarketRegime,
    OHLCVResponse,
    PriceProbabilityForecast,
    SentimentSnapshot,
    SignalDirection,
    SignalStrength,
    TechnicalIndicators,
    TIMEFRAME_SECONDS,
    Timeframe,
)
from app.services.cache import backtest_cache, indicator_cache, ohlcv_cache, prediction_cache

import pandas as pd

logger = get_logger(__name__)
router = APIRouter(prefix="/market", tags=["market"])


def _validated_ticker(ticker: str) -> str:
    """Validate and normalise a ticker path param (supports `/` for crypto pairs)."""
    t = ticker.strip().upper()
    if not _TICKER_RE.match(t):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid ticker symbol.",
        )
    return t


# ─── Asset search ─────────────────────────────────────────────────────────────

@router.get(
    "/popular",
    response_model=list[AssetSearchResult],
    summary="Default popular assets shown before a search query is entered",
)
async def get_popular(svc: MarketDataDep) -> list[AssetSearchResult]:
    return await svc.get_popular()


@router.get(
    "/search",
    response_model=list[AssetSearchResult],
    summary="Fuzzy search tradable assets by symbol or name",
)
async def search_assets(
    svc: MarketDataDep,
    q: str = Query(min_length=1, max_length=30, description="Symbol or name fragment"),
    limit: int = Query(default=10, ge=1, le=50),
) -> list[AssetSearchResult]:
    return await svc.search_assets(q.strip().upper(), limit=limit)


# ─── Latest price ────────────────────────────────────────────────────────────

class PriceResponse(BaseModel):
    ticker: str
    price: float


@router.get(
    "/price/{ticker:path}",
    response_model=PriceResponse,
    summary="Latest trade price (no cache — suitable for 1-second polling)",
)
async def get_price(ticker: str, svc: MarketDataDep) -> PriceResponse:
    ticker = _validated_ticker(ticker)
    price = await svc.get_latest_price(ticker)
    return PriceResponse(ticker=ticker, price=price)


# ─── OHLCV ───────────────────────────────────────────────────────────────────

@router.get(
    "/ohlcv/{ticker:path}",
    response_model=OHLCVResponse,
    summary="Historical OHLCV bars",
)
async def get_ohlcv(
    ticker: str,
    svc: MarketDataDep,
    timeframe: Timeframe = Query(default=Timeframe.M15),
    limit: int = Query(default=200, ge=1, le=25000),
    end: str | None = Query(default=None, description="End datetime ISO-8601; omit for most-recent bars"),
) -> OHLCVResponse:
    ticker = _validated_ticker(ticker)
    cache_key = f"ohlcv:{ticker}:{timeframe}:{limit}:{end or ''}"
    cached = await ohlcv_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        bars = await svc.get_ohlcv(ticker, timeframe, limit, end)
    except Exception as exc:
        logger.error("ohlcv_fetch_failed", ticker=ticker, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to fetch market data. Please try again.",
        ) from exc

    result = OHLCVResponse(ticker=ticker, timeframe=timeframe, bars=bars)
    await ohlcv_cache.set(cache_key, result)
    return result


# ─── Backtest History ─────────────────────────────────────────────────────────

# These mirror the constants in src/lib/indicators.ts so bar counts are identical.
_SHORT_TIMEFRAMES = {Timeframe.M1, Timeframe.M5, Timeframe.M15}

# Calendar seconds per period (used for short timeframes where each bar = fixed secs)
_SHORT_TF_PERIOD_SECS: dict[str, int] = {
    "4H": 4 * 3_600,
    "1D": 86_400,
    "5D": 5 * 86_400,
    "1W": 604_800,
    "1M": 2_592_000,
}

# Trading-day counts for long-timeframe periods
_LONG_TF_PERIOD_TRADING_DAYS: dict[str, float] = {
    "1M": 21,
    "6M": 126,
    "1Y": 252,
    "5Y": 1260,
}

# Trading bars per calendar day for each long timeframe
_BARS_PER_DAY: dict[Timeframe, float] = {
    Timeframe.H1: 6.5,
    Timeframe.H4: 1.625,
    Timeframe.D1: 1.0,
}

def _backtest_bar_count(timeframe: Timeframe, period: str) -> int:
    """
    Return the number of OHLCV bars needed to fully cover *period* at *timeframe*.

    Adds:
      - 60-bar indicator warmup buffer (EMA/RSI/MACD need ~20-50 bars to prime)
      - 1.5× calendar multiplier to absorb weekends + public holidays
    Result is capped at 25 000 (Alpaca's max-limit per request).
    """
    WARMUP = 60
    BUFFER = 1.5
    bar_secs = TIMEFRAME_SECONDS.get(timeframe, 900)

    if timeframe in _SHORT_TIMEFRAMES:
        period_secs = _SHORT_TF_PERIOD_SECS.get(period, _SHORT_TF_PERIOD_SECS["1M"])
        raw = period_secs / bar_secs
    elif period == "YTD":
        now = datetime.now(timezone.utc)
        ytd_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        calendar_days = max(1, (now - ytd_start).days + 1)
        trading_days = round(calendar_days * 252 / 365)
        raw = trading_days * _BARS_PER_DAY.get(timeframe, 1.0)
    else:
        trading_days = _LONG_TF_PERIOD_TRADING_DAYS.get(period, 252)
        raw = trading_days * _BARS_PER_DAY.get(timeframe, 1.0)

    return min(ceil(raw * BUFFER) + WARMUP, 25_000)


@router.get(
    "/backtest-history/{ticker:path}",
    response_model=OHLCVResponse,
    summary="Full OHLCV history sized exactly for one backtest period + indicator warmup",
)
async def get_backtest_history(
    ticker: str,
    svc: MarketDataDep,
    timeframe: Timeframe = Query(default=Timeframe.M15),
    period: str = Query(
        default="1M",
        description="Period key: 4H | 1D | 1W | 1M | 6M | YTD | 1Y",
    ),
) -> OHLCVResponse:
    ticker = _validated_ticker(ticker)
    period = period.upper()
    cache_key = f"backtest:{ticker}:{timeframe}:{period}"

    cached = await backtest_cache.get(cache_key)
    if cached is not None:
        return cached

    limit = _backtest_bar_count(timeframe, period)
    logger.info(
        "backtest_history_fetch",
        ticker=ticker, timeframe=timeframe, period=period, limit=limit,
    )

    try:
        bars = await svc.get_ohlcv(ticker, timeframe, limit)
    except Exception as exc:
        logger.error("backtest_history_failed", ticker=ticker, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to fetch historical data. Please try again.",
        ) from exc

    result = OHLCVResponse(ticker=ticker, timeframe=timeframe, bars=bars)
    await backtest_cache.set(cache_key, result)
    return result


# ─── Technical Indicators ────────────────────────────────────────────────────

@router.get(
    "/indicators/{ticker:path}",
    response_model=TechnicalIndicators,
    summary="RSI, MACD, Bollinger Bands, ATR, EMA",
)
async def get_indicators(
    ticker: str,
    svc: MarketDataDep,
    engine: AnalysisEngineDep,
    timeframe: Timeframe = Query(default=Timeframe.M15),
) -> TechnicalIndicators:
    ticker = _validated_ticker(ticker)
    cache_key = f"indicators:{ticker}:{timeframe}"
    cached = await indicator_cache.get(cache_key)
    if cached is not None:
        return cached

    indicators = await _load_indicators(ticker, timeframe, svc, engine)
    await indicator_cache.set(cache_key, indicators)
    return indicators


# ─── Market Regime ────────────────────────────────────────────────────────────

@router.get(
    "/regime/{ticker:path}",
    response_model=MarketRegime,
    summary="Composite Market Regime Score (0–100)",
)
async def get_regime(
    ticker: str,
    svc: MarketDataDep,
    engine: AnalysisEngineDep,
    timeframe: Timeframe = Query(default=Timeframe.M15),
) -> MarketRegime:
    ticker = _validated_ticker(ticker)
    indicators = await _load_indicators(ticker, timeframe, svc, engine)

    # Mock sentiment — replace with real NLP pipeline
    sentiment = SentimentSnapshot(
        score=_mock_sentiment(ticker),
        source="mock_nlp",
        confidence=0.6,
    )

    regime = await engine.compute_regime(indicators, sentiment)
    return regime


# ─── Prediction ───────────────────────────────────────────────────────────────

@router.get(
    "/prediction/{ticker:path}",
    response_model=PriceProbabilityForecast,
    summary="AI price probability forecast",
)
async def get_prediction(
    ticker: str,
    svc: MarketDataDep,
    engine: AnalysisEngineDep,
    model: PredictiveModelDep,
    timeframe: Timeframe = Query(default=Timeframe.M15),
    horizon: int = Query(default=10, ge=1, le=50, description="Forward bars to project"),
) -> PriceProbabilityForecast:
    ticker = _validated_ticker(ticker)
    cache_key = f"prediction:{ticker}:{timeframe}:{horizon}"
    cached = await prediction_cache.get(cache_key)
    if cached is not None:
        return cached

    indicators = await _load_indicators(ticker, timeframe, svc, engine)
    forecast = await model.predict(indicators, timeframe, horizon_bars=horizon)

    await prediction_cache.set(cache_key, forecast)
    return forecast


# ─── Signals ─────────────────────────────────────────────────────────────────

@router.get(
    "/signals/{ticker:path}",
    response_model=list[AlphaSignal],
    summary="Latest AI-generated alpha signals",
)
async def get_signals(
    ticker: str,
    svc: MarketDataDep,
    engine: AnalysisEngineDep,
    model: PredictiveModelDep,
    timeframe: Timeframe = Query(default=Timeframe.M15),
    limit: int = Query(default=10, ge=1, le=50),
) -> list[AlphaSignal]:
    ticker = _validated_ticker(ticker)
    try:
        indicators = await _load_indicators(ticker, timeframe, svc, engine)
    except HTTPException:
        return []
    forecast = await model.predict(indicators, timeframe)
    regime = await engine.compute_regime(indicators)

    signals = _derive_signals(indicators, forecast, regime, ticker, timeframe)
    return signals[:limit]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _require_bars(bars: list, ticker: str, min_count: int = 20) -> None:
    """Raise 422 if bars list is too short for indicator computation."""
    if len(bars) < min_count:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Insufficient data: need ≥{min_count} bars, got {len(bars)} for {ticker}",
        )


async def _load_indicators(
    ticker: str,
    timeframe: Timeframe,
    svc: MarketDataDep,
    engine: AnalysisEngineDep,
) -> TechnicalIndicators:
    """Fetch bars, validate, build DataFrame, compute indicators."""
    bars = await svc.get_ohlcv(ticker, timeframe, limit=200)
    _require_bars(bars, ticker)
    return await engine.compute_indicators(_bars_to_df(bars), ticker, timeframe)


def _bars_to_df(bars: list) -> pd.DataFrame:
    """Convert list[Candle] → pandas DataFrame."""
    return pd.DataFrame(
        [
            {
                "time": b.time,
                "open": b.open,
                "high": b.high,
                "low": b.low,
                "close": b.close,
                "volume": b.volume,
            }
            for b in bars
        ]
    ).set_index("time")


def _mock_sentiment(ticker: str) -> float:
    """
    Placeholder sentiment score in [-1, 1].
    Replace with a real NLP service (FinBERT, news API, social scraper).
    """
    # Deterministic per ticker so it doesn't change between calls
    mapping = {
        "BTC/USD": 0.25, "BTC/USDT": 0.25,
        "ETH/USD": 0.18, "ETH/USDT": 0.18,
        "SOL/USD": 0.40, "AAPL": 0.10,
        "TSLA": -0.05, "NVDA": 0.35,
    }
    return mapping.get(ticker, 0.0)


_SIGNAL_TEMPLATES = [
    {
        "condition": lambda ind, fc: ind.rsi < 30 and fc.direction == SignalDirection.BULLISH,
        "title": "RSI Oversold Reversal",
        "description": "RSI({rsi:.1f}) is in oversold territory with bullish model conviction.",
        "direction": SignalDirection.BULLISH,
        "strength": SignalStrength.STRONG,
    },
    {
        "condition": lambda ind, fc: ind.rsi > 70 and fc.direction == SignalDirection.BEARISH,
        "title": "RSI Overbought — Fade Signal",
        "description": "RSI({rsi:.1f}) is overbought; model projects downside reversion.",
        "direction": SignalDirection.BEARISH,
        "strength": SignalStrength.STRONG,
    },
    {
        "condition": lambda ind, fc: ind.macd.histogram > 0 and ind.macd.macd > ind.macd.signal,
        "title": "MACD Golden Cross",
        "description": "MACD line crossed above signal; histogram expanding ({hist:+.2f}).",
        "direction": SignalDirection.BULLISH,
        "strength": SignalStrength.MODERATE,
    },
    {
        "condition": lambda ind, fc: ind.macd.histogram < 0 and ind.macd.macd < ind.macd.signal,
        "title": "MACD Death Cross",
        "description": "MACD below signal line; bearish momentum accelerating ({hist:+.2f}).",
        "direction": SignalDirection.BEARISH,
        "strength": SignalStrength.MODERATE,
    },
    {
        "condition": lambda ind, fc: ind.bollinger.percent_b > 0.95,
        "title": "Bollinger Band Squeeze — Upper Touch",
        "description": "Price at {pct_b:.0%} of Bollinger Band — potential mean reversion.",
        "direction": SignalDirection.BEARISH,
        "strength": SignalStrength.WEAK,
    },
    {
        "condition": lambda ind, fc: ind.bollinger.percent_b < 0.05,
        "title": "Bollinger Band — Lower Touch",
        "description": "Price at {pct_b:.0%} of Bollinger Band — potential bounce zone.",
        "direction": SignalDirection.BULLISH,
        "strength": SignalStrength.WEAK,
    },
    {
        "condition": lambda ind, fc: ind.volume_ratio > 2.0 and fc.direction == SignalDirection.BULLISH,
        "title": "Volume Surge — Bullish",
        "description": "Volume {vol_ratio:.1f}x above SMA with bullish model bias.",
        "direction": SignalDirection.BULLISH,
        "strength": SignalStrength.STRONG,
    },
    {
        "condition": lambda ind, fc: ind.trend_strength > 0.6,
        "title": "Strong Uptrend Confirmed",
        "description": "EMA-20 well above EMA-50; trend strength {trend:.2f}/1.0.",
        "direction": SignalDirection.BULLISH,
        "strength": SignalStrength.MODERATE,
    },
]


def _derive_signals(
    indicators: TechnicalIndicators,
    forecast: PriceProbabilityForecast,
    regime: MarketRegime,
    ticker: str,
    timeframe: Timeframe,
) -> list[AlphaSignal]:
    now = int(time.time())
    signals: list[AlphaSignal] = []

    for template in _SIGNAL_TEMPLATES:
        try:
            if not template["condition"](indicators, forecast):
                continue
        except Exception:
            continue

        desc = template["description"].format(
            rsi=indicators.rsi,
            hist=indicators.macd.histogram,
            pct_b=indicators.bollinger.percent_b,
            vol_ratio=indicators.volume_ratio,
            trend=indicators.trend_strength,
        )

        signals.append(
            AlphaSignal(
                id=str(uuid.uuid4()),
                timestamp=now,
                ticker=ticker,
                timeframe=timeframe,
                direction=template["direction"],
                strength=template["strength"],
                title=template["title"],
                description=desc,
                confidence=forecast.confidence,
                price=indicators.price,
                indicators_snapshot=indicators,
            )
        )

    return signals
