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

import asyncio
import re
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Path, status
from starlette.requests import HTTPConnection

from app.core.logging import get_logger
from app.engine.analysis import AnalysisEngine
from app.engine.predictive import PredictiveModel
from app.services.market_data import MarketDataService

logger = get_logger(__name__)

# ─── Ticker validation ───────────────────────────────────────────────────────

_TICKER_RE = re.compile(r"^[A-Za-z0-9]{1,10}(/[A-Za-z]{2,5})?$")


def validate_ticker(ticker: str = Path(...)) -> str:
    """Validate and normalise a ticker path parameter."""
    t = ticker.strip().upper()
    if not _TICKER_RE.match(t):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid ticker symbol.",
        )
    return t


ValidTicker = Annotated[str, Depends(validate_ticker)]


# ─── Firebase auth ───────────────────────────────────────────────────────────

async def verify_firebase_token(
    authorization: str = Header(..., alias="Authorization"),
) -> str:
    """
    Verify the Firebase ID token from the Authorization header and return
    the authenticated user's UID.

    Raises 401 if the token is missing, malformed, or invalid.
    """
    token = authorization.removeprefix("Bearer ").strip()
    if not token or token == authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Bearer token.",
        )
    try:
        from firebase_admin import auth as firebase_auth  # noqa: PLC0415

        decoded = await asyncio.to_thread(firebase_auth.verify_id_token, token)
        return decoded["uid"]
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )


AuthenticatedUID = Annotated[str, Depends(verify_firebase_token)]


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
