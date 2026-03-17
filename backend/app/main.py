"""
Predictive Alpha — FastAPI Entry Point
──────────────────────────────────────
Run with:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

Or via the helper script:
    python -m app.main
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import market, trading, websocket
from app.api.routes.broker import router as broker_router
from app.api.routes.payments import router as payments_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.engine.analysis import AnalysisEngine
from app.engine.predictive import StatisticalModel
from app.models.schemas import HealthResponse
from app.scheduler import auto_trade_loop
from app.services.broker_client import get_broker_client
from app.services.firestore_service import init_firebase
from app.services.market_data import AlpacaMarketDataService

logger = get_logger(__name__)


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Startup / shutdown lifecycle.

    All long-lived objects (HTTP clients, ML models) are created here and
    attached to app.state so DI providers can retrieve them without globals.
    """
    configure_logging()
    settings = get_settings()

    logger.info(
        "app_starting",
        env=settings.app_env,
        host=settings.app_host,
        port=settings.app_port,
    )

    # ── Broker API client (singleton warm-up) ─────────────────────────────────
    broker = get_broker_client()
    logger.info("broker_client_ready", url=broker._base_url)

    # ── Market data service ───────────────────────────────────────────────────
    logger.info("market_data_service", backend="alpaca")
    svc = AlpacaMarketDataService()

    app.state.market_data = svc

    # ── Analysis engine (stateless — one instance is enough) ──────────────────
    app.state.analysis_engine = AnalysisEngine()

    # ── Predictive model (warm up weights / JIT compile) ──────────────────────
    pred_model = StatisticalModel()
    await pred_model.warm_up()
    app.state.predictive_model = pred_model

    # ── Firebase Admin SDK (required for auto-trading scheduler) ──────────────
    firebase_ok = init_firebase()
    if firebase_ok:
        logger.info("firebase_admin_ready")
    else:
        logger.warning(
            "firebase_admin_unavailable",
            hint=(
                "Auto-trading scheduler will not run. "
                "Set GOOGLE_APPLICATION_CREDENTIALS in backend/.env to enable it."
            ),
        )

    # ── Auto-trade scheduler ──────────────────────────────────────────────────
    scheduler_task: asyncio.Task | None = None
    if firebase_ok:
        scheduler_task = asyncio.create_task(auto_trade_loop(svc))
        logger.info("auto_trade_scheduler_task_created")

    logger.info("app_ready")
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    if scheduler_task is not None:
        scheduler_task.cancel()
        await asyncio.gather(scheduler_task, return_exceptions=True)
        logger.info("auto_trade_scheduler_stopped")

    if hasattr(svc, "close"):
        await svc.close()  # type: ignore[attr-defined]

    await broker.close()

    logger.info("app_shutdown")


# ─── App factory ──────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Predictive Alpha API",
        description=(
            "Real-time OHLCV streaming, technical analysis, and AI-generated "
            "price probability forecasts for equity and crypto markets."
        ),
        version="1.0.0",
        docs_url="/docs" if settings.is_development else None,
        redoc_url="/redoc" if settings.is_development else None,
        openapi_url="/openapi.json" if settings.is_development else None,
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    # allow_credentials=True is incompatible with allow_origins=["*"] per spec;
    # only enable it when specific origins are configured.
    cors_origins = settings.cors_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=cors_origins != ["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(market.router, prefix="/api/v1")
    app.include_router(trading.router, prefix="/api/v1")
    app.include_router(broker_router, prefix="/api/v1")
    app.include_router(payments_router)          # POST /webhook/stripe (no /api/v1 prefix)
    app.include_router(websocket.router)

    # ── Health check ──────────────────────────────────────────────────────────
    @app.get("/health", response_model=HealthResponse, tags=["meta"])
    async def health() -> HealthResponse:
        return HealthResponse()

    # ── Global exception handler ──────────────────────────────────────────────
    @app.exception_handler(Exception)
    async def unhandled_exception(request, exc: Exception) -> JSONResponse:
        logger.error(
            "unhandled_exception",
            path=str(request.url),
            error=str(exc),
            exc_info=True,
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    return app


app = create_app()


# ─── Direct run ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.is_development,
        log_level=settings.log_level.lower(),
    )
