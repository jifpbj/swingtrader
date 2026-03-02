"""
Technical Analysis Engine
─────────────────────────
Computes RSI, MACD, Bollinger Bands, ATR, EMA, and derives a composite
Market Regime Score (0–100) from indicator signals + mock sentiment.

All public methods are async to stay non-blocking when called from FastAPI
request handlers or WebSocket loops.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.schemas import (
    BollingerResult,
    MACDResult,
    MarketRegime,
    RegimeLabel,
    SentimentSnapshot,
    TechnicalIndicators,
    Timeframe,
)

logger = get_logger(__name__)


# ─── Regime Score Weights ─────────────────────────────────────────────────────
# Must sum to 1.0
REGIME_WEIGHTS: dict[str, float] = {
    "rsi":       0.25,
    "macd":      0.25,
    "bollinger": 0.20,
    "trend":     0.20,
    "sentiment": 0.10,
}


@dataclass
class _RawIndicators:
    """Intermediate holder — avoids multiple DataFrame passes."""
    rsi: float
    macd: float
    macd_signal: float
    macd_hist: float
    bb_upper: float
    bb_middle: float
    bb_lower: float
    atr: float
    ema_20: float
    ema_50: float
    volume_sma: float
    price: float
    volume: float


class AnalysisEngine:
    """
    Stateless analysis engine.  Instantiate once and reuse.

    All heavy pandas work runs in an executor so async callers are
    never blocked on the event loop.
    """

    def __init__(self) -> None:
        self._settings = get_settings()

    # ─── Public API ───────────────────────────────────────────────────────────

    async def compute_indicators(
        self,
        df: pd.DataFrame,
        ticker: str,
        timeframe: Timeframe,
    ) -> TechnicalIndicators:
        """
        Compute all technical indicators for the given OHLCV DataFrame.

        Expected columns: time, open, high, low, close, volume
        """
        raw = await asyncio.get_event_loop().run_in_executor(
            None, self._compute_sync, df
        )

        bb_bw = (raw.bb_upper - raw.bb_lower) / raw.bb_middle if raw.bb_middle else 0.0
        bb_pct = (
            (raw.price - raw.bb_lower) / (raw.bb_upper - raw.bb_lower)
            if (raw.bb_upper - raw.bb_lower) > 0
            else 0.5
        )

        trend_strength = self._normalise_trend(raw.ema_20, raw.ema_50, df)

        return TechnicalIndicators(
            ticker=ticker,
            timeframe=timeframe,
            timestamp=int(time.time()),
            rsi=raw.rsi,
            macd=MACDResult(
                macd=raw.macd,
                signal=raw.macd_signal,
                histogram=raw.macd_hist,
            ),
            bollinger=BollingerResult(
                upper=raw.bb_upper,
                middle=raw.bb_middle,
                lower=raw.bb_lower,
                bandwidth=bb_bw,
                percent_b=bb_pct,
            ),
            atr=raw.atr,
            volume_sma=raw.volume_sma,
            volume_ratio=raw.volume / raw.volume_sma if raw.volume_sma else 1.0,
            price=raw.price,
            ema_20=raw.ema_20,
            ema_50=raw.ema_50,
            trend_strength=trend_strength,
        )

    async def compute_regime(
        self,
        indicators: TechnicalIndicators,
        sentiment: SentimentSnapshot | None = None,
    ) -> MarketRegime:
        """
        Derive the 0–100 Market Regime Score from indicator components.

        Component scoring (each normalised to 0–100):
          RSI        — raw value; 50 = neutral
          MACD       — histogram sign/magnitude
          Bollinger  — %B position (0 = at lower, 100 = at upper)
          Trend      — EMA slope direction
          Sentiment  — news/social score mapped 0–100
        """
        sent = sentiment or SentimentSnapshot()

        rsi_c = self._rsi_component(indicators.rsi)
        macd_c = self._macd_component(indicators.macd.histogram)
        bb_c = indicators.bollinger.percent_b * 100
        trend_c = (indicators.trend_strength + 1) / 2 * 100
        sent_c = (sent.score + 1) / 2 * 100

        w = REGIME_WEIGHTS
        score = (
            rsi_c   * w["rsi"]
            + macd_c  * w["macd"]
            + bb_c    * w["bollinger"]
            + trend_c * w["trend"]
            + sent_c  * w["sentiment"]
        )
        score = float(np.clip(score, 0, 100))

        logger.debug(
            "regime_computed",
            ticker=indicators.ticker,
            score=round(score, 2),
            rsi_c=round(rsi_c, 1),
            macd_c=round(macd_c, 1),
            bb_c=round(bb_c, 1),
            trend_c=round(trend_c, 1),
            sent_c=round(sent_c, 1),
        )

        return MarketRegime(
            ticker=indicators.ticker,
            timestamp=int(time.time()),
            regime_score=score,
            label=self._score_to_label(score),
            rsi_component=rsi_c,
            macd_component=macd_c,
            bollinger_component=bb_c,
            trend_component=trend_c,
            sentiment_component=sent_c,
            weights=REGIME_WEIGHTS,
        )

    # ─── Synchronous computation (runs in executor) ────────────────────────────

    def _compute_sync(self, df: pd.DataFrame) -> _RawIndicators:
        """
        Pure synchronous pandas/numpy TA computation.
        Runs in a thread pool — must not touch the event loop.
        """
        cfg = self._settings
        close = df["close"]
        high = df["high"]
        low = df["low"]
        volume = df["volume"]

        rsi = self._rsi(close, cfg.rsi_period)
        macd_line, signal_line, histogram = self._macd(
            close, cfg.macd_fast, cfg.macd_slow, cfg.macd_signal
        )
        bb_upper, bb_mid, bb_lower = self._bollinger(close, cfg.bollinger_period, cfg.bollinger_std)
        atr = self._atr(high, low, close, 14)
        ema_20 = self._ema(close, 20)
        ema_50 = self._ema(close, 50)
        vol_sma = volume.rolling(20).mean().iloc[-1]

        return _RawIndicators(
            rsi=float(rsi),
            macd=float(macd_line),
            macd_signal=float(signal_line),
            macd_hist=float(histogram),
            bb_upper=float(bb_upper),
            bb_middle=float(bb_mid),
            bb_lower=float(bb_lower),
            atr=float(atr),
            ema_20=float(ema_20),
            ema_50=float(ema_50),
            volume_sma=float(vol_sma) if not np.isnan(vol_sma) else 0.0,
            price=float(close.iloc[-1]),
            volume=float(volume.iloc[-1]),
        )

    # ─── Individual indicator implementations ─────────────────────────────────

    @staticmethod
    def _rsi(close: pd.Series, period: int = 14) -> float:
        delta = close.diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)

        avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
        avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()

        rs = avg_gain / avg_loss.replace(0, np.nan)
        rsi = 100 - (100 / (1 + rs))
        val = rsi.iloc[-1]
        return float(np.clip(val, 0, 100)) if not np.isnan(val) else 50.0

    @staticmethod
    def _macd(
        close: pd.Series, fast: int, slow: int, signal: int
    ) -> tuple[float, float, float]:
        ema_fast = close.ewm(span=fast, adjust=False).mean()
        ema_slow = close.ewm(span=slow, adjust=False).mean()
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()
        histogram = macd_line - signal_line

        def _last(s: pd.Series) -> float:
            v = s.iloc[-1]
            return float(v) if not np.isnan(v) else 0.0

        return _last(macd_line), _last(signal_line), _last(histogram)

    @staticmethod
    def _bollinger(
        close: pd.Series, period: int, std_dev: float
    ) -> tuple[float, float, float]:
        sma = close.rolling(period).mean()
        std = close.rolling(period).std(ddof=0)
        upper = sma + std_dev * std
        lower = sma - std_dev * std

        def _last(s: pd.Series) -> float:
            v = s.iloc[-1]
            return float(v) if not np.isnan(v) else float(close.iloc[-1])

        return _last(upper), _last(sma), _last(lower)

    @staticmethod
    def _atr(
        high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14
    ) -> float:
        prev_close = close.shift(1)
        tr = pd.concat(
            [
                high - low,
                (high - prev_close).abs(),
                (low - prev_close).abs(),
            ],
            axis=1,
        ).max(axis=1)
        atr = tr.ewm(com=period - 1, min_periods=period).mean()
        val = atr.iloc[-1]
        return float(val) if not np.isnan(val) else 0.0

    @staticmethod
    def _ema(close: pd.Series, period: int) -> float:
        val = close.ewm(span=period, adjust=False).mean().iloc[-1]
        return float(val) if not np.isnan(val) else float(close.iloc[-1])

    # ─── Component scoring helpers ────────────────────────────────────────────

    @staticmethod
    def _rsi_component(rsi: float) -> float:
        """
        Map RSI to 0–100 regime component.
        RSI 30 → 20 (oversold, not max bear to avoid false signals)
        RSI 50 → 50 (neutral)
        RSI 70 → 80 (overbought, leaning bull)
        Uses a sigmoid-style smoothing around 50.
        """
        # Simple linear mapping with clamping
        return float(np.clip(rsi, 0, 100))

    @staticmethod
    def _macd_component(histogram: float) -> float:
        """
        Map MACD histogram to 0–100 using a sigmoid so extreme values
        don't dominate the regime score.
        """
        # sigmoid(h * scaling) maps to (0,1), then * 100
        scaled = histogram / 50.0  # tune divisor per asset
        component = 100 / (1 + np.exp(-scaled))
        return float(np.clip(component, 0, 100))

    @staticmethod
    def _normalise_trend(ema_fast: float, ema_slow: float, df: pd.DataFrame) -> float:
        """
        Return trend strength in [-1, +1].
        Sign: ema_fast > ema_slow → positive (uptrend).
        Magnitude: relative gap normalised by recent ATR.
        """
        if ema_slow == 0:
            return 0.0
        gap_pct = (ema_fast - ema_slow) / ema_slow
        # Normalise by capping at ±2% gap (typical for trending market)
        return float(np.clip(gap_pct / 0.02, -1, 1))

    @staticmethod
    def _score_to_label(score: float) -> RegimeLabel:
        if score >= 75:
            return RegimeLabel.STRONG_BULL
        if score >= 57:
            return RegimeLabel.BULL
        if score >= 43:
            return RegimeLabel.NEUTRAL
        if score >= 25:
            return RegimeLabel.BEAR
        return RegimeLabel.STRONG_BEAR
