"""
Dependency Injection providers.

FastAPI's `Depends()` calls these functions to resolve service instances.
All heavy objects (HTTP clients, ML models) are created once in the
app lifespan and stored on `app.state`, then retrieved here.

Usage in a route:
    from app.api.dependencies import get_market_data, get_analysis_engine

    @router.get("/ohlcv/{ticker}")
    async def ohlcv(
        ticker: str,
        svc: MarketDataService = Depends(get_market_data),
        engine: AnalysisEngine = Depends(get_analysis_engine),
    ):
        ...
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.engine.analysis import AnalysisEngine
from app.engine.predictive import PredictiveModel
from app.services.market_data import MarketDataService


# ─── Service accessors ────────────────────────────────────────────────────────

def get_market_data(request: HTTPConnection) -> MarketDataService:
    """Return the market data service stored on app.state at startup."""
    return request.app.state.market_data  # type: ignore[no-any-return]


def get_analysis_engine(request: HTTPConnection) -> AnalysisEngine:
    """Return the shared AnalysisEngine (stateless — safe to share)."""
    return request.app.state.analysis_engine  # type: ignore[no-any-return]


def get_predictive_model(request: HTTPConnection) -> PredictiveModel:
    """Return the warmed-up predictive model."""
    return request.app.state.predictive_model  # type: ignore[no-any-return]


# ─── Type aliases for cleaner route signatures ────────────────────────────────

MarketDataDep = Annotated[MarketDataService, Depends(get_market_data)]
AnalysisEngineDep = Annotated[AnalysisEngine, Depends(get_analysis_engine)]
PredictiveModelDep = Annotated[PredictiveModel, Depends(get_predictive_model)]
