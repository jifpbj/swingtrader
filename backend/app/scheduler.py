"""
Auto-Trade Scheduler
────────────────────
A single asyncio background task that runs forever while the FastAPI process
is alive.  Every 30 s it:

  1. Queries Firestore for all strategies with autoTrade == True (all users).
  2. Fires check_strategy() for each one concurrently via asyncio.gather().
  3. Sleeps until the next tick.

The task is started inside the FastAPI lifespan context manager so it shares
the same event loop as the HTTP server and the MarketDataService.

Errors inside individual strategy checks are caught by check_strategy()
itself; errors in gather() are caught here via return_exceptions=True.
"""

from __future__ import annotations

import asyncio

from app.core.logging import get_logger
from app.engine.auto_trader import check_strategy
from app.services.firestore_service import get_active_strategies
from app.services.market_data import MarketDataService

logger = get_logger(__name__)

POLL_INTERVAL_SECONDS = 30


async def auto_trade_loop(market_svc: MarketDataService) -> None:
    """
    Main perpetual loop.  Runs until cancelled (FastAPI shutdown).
    """
    logger.info("auto_trade_scheduler_started", interval_s=POLL_INTERVAL_SECONDS)

    while True:
        try:
            strategies = await get_active_strategies()
            if strategies:
                logger.info("auto_trade_checking", count=len(strategies))
                tasks = [
                    check_strategy(uid, strategy, market_svc)
                    for uid, strategy in strategies
                ]
                results = await asyncio.gather(*tasks, return_exceptions=True)

                # Log any unexpected exceptions from individual checks
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

        except asyncio.CancelledError:
            logger.info("auto_trade_scheduler_stopped")
            return
        except Exception as exc:
            # Top-level safety net — keep the loop alive even on unexpected errors
            logger.error("auto_trade_loop_error", error=str(exc), exc_info=True)

        await asyncio.sleep(POLL_INTERVAL_SECONDS)
