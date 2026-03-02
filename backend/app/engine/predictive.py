"""
Predictive Engine — Price Probability Forecast
───────────────────────────────────────────────
Placeholder class that mirrors the interface a real Temporal Fusion
Transformer or LSTM model would expose.

The `StatisticalModel` uses indicator-weighted Gaussian bands to produce
plausible confidence intervals without requiring a trained model.  Swap it
out by implementing the same `PredictiveModel` protocol and wiring it into
dependencies.py.

To integrate a real model:
  1. Subclass `PredictiveModel` (or implement the protocol).
  2. Load weights inside `__init__` / `warm_up()`.
  3. Override `_run_inference` to call your model.
  4. Update `app/api/dependencies.py` to inject the new class.
"""

from __future__ import annotations

import asyncio
import math
import time
import uuid
from abc import ABC, abstractmethod

import numpy as np

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.schemas import (
    PredictiveBand,
    PriceProbabilityForecast,
    SignalDirection,
    TechnicalIndicators,
    Timeframe,
    TIMEFRAME_SECONDS,
)

logger = get_logger(__name__)


# ─── Protocol / Abstract Base ─────────────────────────────────────────────────

class PredictiveModel(ABC):
    """
    Interface that all prediction backends must satisfy.

    `warm_up()` is called at app startup to load weights/compile graphs.
    `predict()` is the single async entry point for inference.
    """

    @abstractmethod
    async def warm_up(self) -> None:
        """Load model weights, compile JIT graphs, etc."""

    @abstractmethod
    async def predict(
        self,
        indicators: TechnicalIndicators,
        timeframe: Timeframe,
        horizon_bars: int = 10,
    ) -> PriceProbabilityForecast:
        """Return a forward-looking price probability forecast."""


# ─── Statistical placeholder ──────────────────────────────────────────────────

class StatisticalModel(PredictiveModel):
    """
    Lightweight stand-in used until a real ML model is available.

    Strategy:
    • Direction is determined by a weighted vote of RSI, MACD, and regime score.
    • Confidence is derived from the agreement level of those votes.
    • Price bands are projected as Gaussian intervals scaled by ATR,
      widening with horizon distance (uncertainty cone).
    • Probability mass is distributed using a Beta distribution shaped
      by indicator confluence.
    """

    MODEL_TYPE = "statistical"
    VERSION = "0.1.0-placeholder"

    def __init__(self) -> None:
        self._ready = False

    async def warm_up(self) -> None:
        # Nothing to load — but simulate a short init delay for realism
        await asyncio.sleep(0.05)
        self._ready = True
        logger.info("predictive_model_ready", model=self.MODEL_TYPE)

    async def predict(
        self,
        indicators: TechnicalIndicators,
        timeframe: Timeframe,
        horizon_bars: int = 10,
    ) -> PriceProbabilityForecast:
        if not self._ready:
            await self.warm_up()

        forecast = await asyncio.get_event_loop().run_in_executor(
            None, self._run_inference, indicators, timeframe, horizon_bars
        )

        logger.debug(
            "prediction_generated",
            ticker=indicators.ticker,
            direction=forecast.direction,
            confidence=round(forecast.confidence, 1),
            prob_up=round(forecast.probability_up, 3),
        )
        return forecast

    # ─── Inference (runs in executor — no event loop access) ──────────────────

    def _run_inference(
        self,
        ind: TechnicalIndicators,
        timeframe: Timeframe,
        horizon_bars: int,
    ) -> PriceProbabilityForecast:
        now = int(time.time())
        bar_seconds = TIMEFRAME_SECONDS.get(timeframe, 900)

        # ── Step 1: directional vote ──────────────────────────────────────────
        votes = self._directional_votes(ind)
        bull_votes = sum(1 for v in votes if v > 0)
        bear_votes = sum(1 for v in votes if v < 0)
        net = sum(votes)

        if net > 0.2:
            direction = SignalDirection.BULLISH
        elif net < -0.2:
            direction = SignalDirection.BEARISH
        else:
            direction = SignalDirection.NEUTRAL

        # ── Step 2: confidence (agreement ratio, 50–95 range) ─────────────────
        total_votes = len(votes)
        agree = max(bull_votes, bear_votes)
        agreement_ratio = agree / total_votes if total_votes else 0.5
        # Map [0.5, 1.0] → [50, 95]
        confidence = 50 + agreement_ratio * 45 * abs(net)
        confidence = float(np.clip(confidence, 30, 95))

        # ── Step 3: probability distribution ─────────────────────────────────
        prob_up, prob_down, prob_neutral = self._probability_split(net, confidence)

        # ── Step 4: target price projection ───────────────────────────────────
        atr_multiplier = 1.5 if direction != SignalDirection.NEUTRAL else 0.5
        direction_sign = 1 if direction == SignalDirection.BULLISH else (-1 if direction == SignalDirection.BEARISH else 0)
        target_price = ind.price + direction_sign * ind.atr * atr_multiplier * (horizon_bars / 5)
        target_time = now + bar_seconds * horizon_bars

        # ── Step 5: uncertainty bands (cone) ──────────────────────────────────
        bands = self._build_bands(
            current_price=ind.price,
            atr=ind.atr,
            direction_sign=direction_sign,
            horizon_bars=horizon_bars,
            bar_seconds=bar_seconds,
            now=now,
            confidence=confidence,
        )

        return PriceProbabilityForecast(
            ticker=ind.ticker,
            timeframe=timeframe,
            generated_at=now,
            confidence=confidence,
            direction=direction,
            target_price=target_price,
            target_time=target_time,
            probability_up=prob_up,
            probability_down=prob_down,
            probability_neutral=prob_neutral,
            bands=bands,
            model_type=self.MODEL_TYPE,
            model_version=self.VERSION,
        )

    # ─── Vote helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _directional_votes(ind: TechnicalIndicators) -> list[float]:
        """
        Return a list of signed floats in [-1, +1].
        Positive → bullish signal, negative → bearish.
        """
        votes: list[float] = []

        # RSI vote: >55 bull, <45 bear, else diminishing
        rsi_norm = (ind.rsi - 50) / 50  # [-1, +1]
        votes.append(np.clip(rsi_norm, -1, 1))

        # MACD vote: histogram sign, normalised by magnitude
        macd_h = ind.macd.histogram
        macd_vote = np.tanh(macd_h / (ind.atr * 0.1 + 1e-8))
        votes.append(float(macd_vote))

        # Bollinger %B: >0.6 bull, <0.4 bear
        bb_vote = (ind.bollinger.percent_b - 0.5) * 2  # [-1, +1]
        votes.append(float(np.clip(bb_vote, -1, 1)))

        # EMA trend vote
        votes.append(float(np.clip(ind.trend_strength, -1, 1)))

        return votes

    @staticmethod
    def _probability_split(net: float, confidence: float) -> tuple[float, float, float]:
        """
        Distribute probability mass among up / down / neutral.
        `net` is the signed vote total in roughly [-1, +1].
        """
        conf_frac = confidence / 100
        max_directional = 0.85  # never assign more than 85% to one direction

        if abs(net) < 0.15:
            # No conviction → mostly neutral
            p_neutral = 0.40 + (1 - conf_frac) * 0.30
            p_up = (1 - p_neutral) / 2
            p_down = (1 - p_neutral) / 2
        elif net > 0:
            p_up = float(np.clip(0.50 + net * conf_frac * 0.35, 0.5, max_directional))
            p_down = float(np.clip(1 - p_up - 0.05, 0.05, 0.45))
            p_neutral = max(0.0, 1 - p_up - p_down)
        else:
            p_down = float(np.clip(0.50 + abs(net) * conf_frac * 0.35, 0.5, max_directional))
            p_up = float(np.clip(1 - p_down - 0.05, 0.05, 0.45))
            p_neutral = max(0.0, 1 - p_up - p_down)

        # Normalise to exactly 1.0
        total = p_up + p_down + p_neutral
        return round(p_up / total, 4), round(p_down / total, 4), round(p_neutral / total, 4)

    @staticmethod
    def _build_bands(
        current_price: float,
        atr: float,
        direction_sign: int,
        horizon_bars: int,
        bar_seconds: int,
        now: int,
        confidence: float,
    ) -> list[PredictiveBand]:
        """
        Build a forward uncertainty cone.
        Width widens with √horizon (diffusion) and narrows with confidence.
        """
        bands: list[PredictiveBand] = []
        conf_squeeze = (confidence / 100) ** 0.5  # higher confidence → tighter bands
        drift_per_bar = direction_sign * atr * 0.15  # expected drift per bar

        for i in range(1, horizon_bars + 1):
            t = now + i * bar_seconds
            # Uncertainty widens as √i (random walk diffusion)
            half_width = atr * math.sqrt(i) * (1 - conf_squeeze * 0.4)
            midpoint = current_price + drift_per_bar * i
            upper = midpoint + half_width
            lower = midpoint - half_width
            bar_confidence = max(0.1, (confidence / 100) * math.exp(-0.07 * i))

            bands.append(
                PredictiveBand(
                    time=t,
                    upper_bound=round(upper, 4),
                    lower_bound=round(lower, 4),
                    midpoint=round(midpoint, 4),
                    confidence=round(bar_confidence, 4),
                )
            )

        return bands


# ─── Future model stubs (TFT / LSTM) ──────────────────────────────────────────

class TFTModel(PredictiveModel):
    """
    Temporal Fusion Transformer stub.

    Wire in a trained pytorch-forecasting or darts TFT here.

    Expected input shape: (batch=1, time_steps=lookback, features=N)
    Expected output: probability distribution over price bins.
    """

    async def warm_up(self) -> None:
        # TODO: load checkpoint, move to device, compile
        # Example:
        #   self._model = TemporalFusionTransformer.load_from_checkpoint(ckpt_path)
        #   self._model.eval()
        raise NotImplementedError("TFT model not yet trained — use StatisticalModel")

    async def predict(
        self,
        indicators: TechnicalIndicators,
        timeframe: Timeframe,
        horizon_bars: int = 10,
    ) -> PriceProbabilityForecast:
        raise NotImplementedError("TFT model not yet trained — use StatisticalModel")


class LSTMModel(PredictiveModel):
    """
    LSTM stub.

    Wire in a trained Keras/PyTorch LSTM here.
    Input: sliding window of OHLCV + indicator features.
    Output: (price_mean, price_std) for each horizon step.
    """

    async def warm_up(self) -> None:
        # TODO: load weights, compile
        raise NotImplementedError("LSTM model not yet trained — use StatisticalModel")

    async def predict(
        self,
        indicators: TechnicalIndicators,
        timeframe: Timeframe,
        horizon_bars: int = 10,
    ) -> PriceProbabilityForecast:
        raise NotImplementedError("LSTM model not yet trained — use StatisticalModel")
