"""
Shared test fixtures.

Uses FastAPI's dependency_override mechanism to swap in lightweight mock
services so tests run without Alpaca API keys, Firebase credentials, or
any network access.
"""

from __future__ import annotations

import time
from typing import AsyncIterator
from unittest.mock import AsyncMock

import pandas as pd
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api.dependencies import get_analysis_engine, get_market_data, get_predictive_model
from app.engine.analysis import AnalysisEngine
from app.models.schemas import (
    AlphaSignal,
    BollingerResult,
    Candle,
    MACDResult,
    MarketRegime,
    PredictiveBand,
    PriceProbabilityForecast,
    RegimeLabel,
    SignalDirection,
    SignalStrength,
    TechnicalIndicators,
    Timeframe,
)
from app.services.market_data import MarketDataService


# ─── Deterministic OHLCV data ─────────────────────────────────────────────────

def make_candles(n: int = 100, base_price: float = 150.0) -> list[Candle]:
    """Return a list of n simple uptrending candles."""
    now = int(time.time())
    candles = []
    price = base_price
    for i in range(n):
        ts = now - (n - i) * 900  # 15-min bars
        o = price
        c = price + 0.5
        h = c + 0.2
        lo = o - 0.1
        candles.append(Candle(time=ts, open=o, high=h, low=lo, close=c, volume=10_000.0))
        price = c
    return candles


def make_ohlcv_df(n: int = 100) -> pd.DataFrame:
    """Return an OHLCV DataFrame suitable for AnalysisEngine."""
    candles = make_candles(n)
    return pd.DataFrame(
        [{"time": c.time, "open": c.open, "high": c.high,
          "low": c.low, "close": c.close, "volume": c.volume}
         for c in candles]
    ).set_index("time")


# ─── Mock services ────────────────────────────────────────────────────────────

class MockMarketDataService(MarketDataService):
    async def get_ohlcv(
        self, ticker: str, timeframe: Timeframe, limit: int = 200, end: str | None = None
    ) -> list[Candle]:
        return make_candles(max(limit, 60))

    async def get_latest_price(self, ticker: str) -> float:
        return 150.75

    async def stream_ticks(self, ticker: str, timeframe: Timeframe, interval_seconds: float):
        # Yields nothing — tests don't exercise WebSocket streaming
        return
        yield  # make it an async generator

    async def search_assets(self, query: str, limit: int = 10):
        from app.models.schemas import AssetSearchResult
        return [AssetSearchResult(symbol="AAPL", name="Apple Inc.", asset_class="equity")]

    async def get_popular(self):
        from app.models.schemas import AssetSearchResult
        return [AssetSearchResult(symbol="AAPL", name="Apple Inc.", asset_class="equity")]


def make_mock_indicators(
    ticker: str = "AAPL",
    timeframe: Timeframe = Timeframe.M15,
    rsi: float = 55.0,
    macd_hist: float = 0.5,
) -> TechnicalIndicators:
    return TechnicalIndicators(
        ticker=ticker,
        timeframe=timeframe,
        timestamp=int(time.time()),
        rsi=rsi,
        macd=MACDResult(macd=1.2, signal=0.7, histogram=macd_hist),
        bollinger=BollingerResult(
            upper=155.0, middle=150.0, lower=145.0,
            bandwidth=0.067, percent_b=0.5,
        ),
        atr=1.5,
        volume_sma=10_000.0,
        volume_ratio=1.1,
        price=150.75,
        ema_20=150.5,
        ema_50=148.0,
        trend_strength=0.3,
    )


def make_mock_forecast(direction: SignalDirection = SignalDirection.BULLISH) -> PriceProbabilityForecast:
    now = int(time.time())
    return PriceProbabilityForecast(
        ticker="AAPL",
        timeframe=Timeframe.M15,
        generated_at=now,
        confidence=72.0,
        direction=direction,
        target_price=153.0,
        target_time=now + 9000,
        probability_up=0.55,
        probability_down=0.30,
        probability_neutral=0.15,
        bands=[
            PredictiveBand(time=now + i * 900, upper_bound=152.0 + i * 0.1,
                           lower_bound=149.0 + i * 0.1, midpoint=150.5 + i * 0.1,
                           confidence=0.7)
            for i in range(5)
        ],
    )


class MockPredictiveModel:
    async def predict(self, indicators, timeframe, horizon_bars=10):
        return make_mock_forecast()

    async def warm_up(self):
        pass


# ─── App fixture ──────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def mock_market_svc() -> MockMarketDataService:
    return MockMarketDataService()


@pytest.fixture(scope="session")
def analysis_engine() -> AnalysisEngine:
    return AnalysisEngine()


@pytest.fixture(scope="session")
def mock_pred_model() -> MockPredictiveModel:
    return MockPredictiveModel()


@pytest.fixture()
def test_app(mock_market_svc, analysis_engine, mock_pred_model):
    """FastAPI app with all external deps overridden."""
    from app.main import create_app

    application = create_app()
    application.dependency_overrides[get_market_data] = lambda: mock_market_svc
    application.dependency_overrides[get_analysis_engine] = lambda: analysis_engine
    application.dependency_overrides[get_predictive_model] = lambda: mock_pred_model
    return application


@pytest_asyncio.fixture()
async def client(test_app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=test_app), base_url="http://test"
    ) as ac:
        yield ac
