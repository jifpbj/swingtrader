"""
Structured JSON logging via structlog.

Usage:
    from app.core.logging import get_logger
    logger = get_logger(__name__)
    logger.info("candles_fetched", ticker="BTC/USD", count=200)
"""

import logging
import sys

import structlog
from structlog.types import EventDict, WrappedLogger

from app.core.config import get_settings


def _add_app_context(
    logger: WrappedLogger, method_name: str, event_dict: EventDict
) -> EventDict:
    """Inject app-level metadata into every log record."""
    settings = get_settings()
    event_dict.setdefault("env", settings.app_env)
    return event_dict


def configure_logging() -> None:
    settings = get_settings()
    log_level = getattr(logging, settings.log_level, logging.INFO)

    # stdlib root logger
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
    )
    # Silence noisy third-party loggers
    for name in ("uvicorn.access", "httpx", "alpaca"):
        logging.getLogger(name).setLevel(logging.WARNING)

    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        _add_app_context,
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.is_development:
        # Pretty console output in dev
        renderer = structlog.dev.ConsoleRenderer(colors=True)
    else:
        # Machine-readable JSON in production
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processor=renderer,
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(log_level)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
