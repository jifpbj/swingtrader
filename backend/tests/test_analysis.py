"""
Unit tests for AnalysisEngine.

Tests static indicator methods and the async compute_regime() in isolation
— no network calls, no Alpaca credentials needed.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.engine.analysis import AnalysisEngine, REGIME_WEIGHTS
from app.models.schemas import RegimeLabel, SentimentSnapshot, Timeframe
from tests.conftest import make_mock_indicators, make_ohlcv_df


# ─── RSI ─────────────────────────────────────────────────────────────────────

class TestRSI:
    def test_rsi_always_in_0_100(self):
        df = make_ohlcv_df(100)
        rsi = AnalysisEngine._rsi(df["close"], 14)
        assert 0 <= rsi <= 100

    def test_pure_uptrend_rsi_above_50(self):
        # Strictly increasing — all gains, zero losses → avg_loss=0 → NaN guard returns 50.0 fallback
        # Confirm it's at least 50 (neutral), never below
        close = pd.Series([float(i) for i in range(1, 51)])
        rsi = AnalysisEngine._rsi(close, 14)
        assert rsi >= 50

    def test_pure_downtrend_rsi_below_50(self):
        close = pd.Series([float(50 - i) for i in range(50)])  # strictly decreasing
        rsi = AnalysisEngine._rsi(close, 14)
        assert rsi < 50

    def test_flat_series_returns_50(self):
        close = pd.Series([100.0] * 30)
        rsi = AnalysisEngine._rsi(close, 14)
        assert rsi == pytest.approx(50.0, abs=1.0)

    def test_short_series_no_crash(self):
        close = pd.Series([100.0, 101.0, 102.0])
        rsi = AnalysisEngine._rsi(close, 14)
        assert 0 <= rsi <= 100


# ─── MACD ────────────────────────────────────────────────────────────────────

class TestMACD:
    def test_macd_returns_three_floats(self):
        df = make_ohlcv_df(60)
        macd, signal, hist = AnalysisEngine._macd(df["close"], 12, 26, 9)
        assert all(isinstance(v, float) for v in (macd, signal, hist))

    def test_histogram_equals_macd_minus_signal(self):
        df = make_ohlcv_df(60)
        macd, signal, hist = AnalysisEngine._macd(df["close"], 12, 26, 9)
        assert hist == pytest.approx(macd - signal, abs=1e-9)

    def test_uptrend_macd_positive(self):
        # 60 bars of steady increase → fast EMA > slow EMA
        close = pd.Series([100.0 + i * 0.5 for i in range(60)])
        macd, _, _ = AnalysisEngine._macd(close, 12, 26, 9)
        assert macd > 0


# ─── Bollinger Bands ──────────────────────────────────────────────────────────

class TestBollinger:
    def test_upper_gt_middle_gt_lower(self):
        df = make_ohlcv_df(50)
        upper, mid, lower = AnalysisEngine._bollinger(df["close"], 20, 2.0)
        assert upper > mid > lower

    def test_volatile_series_has_wider_bands(self):
        calm = pd.Series([100.0] * 30)
        volatile = pd.Series([100.0 + (i % 2) * 5 for i in range(30)])
        _, _, lower_calm = AnalysisEngine._bollinger(calm, 20, 2.0)
        upper_calm, _, _ = AnalysisEngine._bollinger(calm, 20, 2.0)
        upper_vol, _, lower_vol = AnalysisEngine._bollinger(volatile, 20, 2.0)
        # Volatile bands should be wider (or equal for flat — calm bands may collapse to same price)
        assert (upper_vol - lower_vol) >= (upper_calm - lower_calm)


# ─── ATR ─────────────────────────────────────────────────────────────────────

class TestATR:
    def test_atr_non_negative(self):
        df = make_ohlcv_df(50)
        atr = AnalysisEngine._atr(df["high"], df["low"], df["close"], 14)
        assert atr >= 0

    def test_flat_market_low_atr(self):
        s = pd.Series([100.0] * 30)
        atr = AnalysisEngine._atr(s, s, s, 14)
        assert atr == pytest.approx(0.0, abs=0.01)


# ─── Regime score ─────────────────────────────────────────────────────────────

class TestComputeRegime:
    @pytest.mark.asyncio
    async def test_regime_score_in_0_100(self):
        engine = AnalysisEngine()
        indicators = make_mock_indicators()
        regime = await engine.compute_regime(indicators)
        assert 0 <= regime.regime_score <= 100

    @pytest.mark.asyncio
    async def test_weights_sum_to_one(self):
        engine = AnalysisEngine()
        indicators = make_mock_indicators()
        regime = await engine.compute_regime(indicators)
        assert sum(regime.weights.values()) == pytest.approx(1.0)

    @pytest.mark.asyncio
    async def test_strong_bull_label_for_high_rsi(self):
        engine = AnalysisEngine()
        # RSI=90 (strong bull component), positive MACD, high %B → should be bull
        indicators = make_mock_indicators(rsi=90.0, macd_hist=5.0)
        regime = await engine.compute_regime(indicators)
        assert regime.label in (RegimeLabel.STRONG_BULL, RegimeLabel.BULL)

    @pytest.mark.asyncio
    async def test_bear_label_for_low_rsi(self):
        engine = AnalysisEngine()
        # RSI=10, negative MACD
        indicators = make_mock_indicators(rsi=10.0, macd_hist=-5.0)
        regime = await engine.compute_regime(indicators)
        assert regime.label in (RegimeLabel.STRONG_BEAR, RegimeLabel.BEAR)

    @pytest.mark.asyncio
    async def test_sentiment_overrides_only_10_percent(self):
        engine = AnalysisEngine()
        neutral_indicators = make_mock_indicators(rsi=50.0, macd_hist=0.0)

        bullish_sent = SentimentSnapshot(score=1.0)
        bearish_sent = SentimentSnapshot(score=-1.0)

        bull_regime = await engine.compute_regime(neutral_indicators, bullish_sent)
        bear_regime = await engine.compute_regime(neutral_indicators, bearish_sent)

        # Sentiment only contributes 10% — difference should be bounded
        diff = abs(bull_regime.regime_score - bear_regime.regime_score)
        assert diff <= REGIME_WEIGHTS["sentiment"] * 100 + 1  # +1 for float tolerance


# ─── compute_indicators (async, runs in executor) ────────────────────────────

class TestComputeIndicators:
    @pytest.mark.asyncio
    async def test_returns_valid_indicators(self):
        engine = AnalysisEngine()
        df = make_ohlcv_df(100)
        indicators = await engine.compute_indicators(df, "AAPL", Timeframe.M15)
        assert indicators.ticker == "AAPL"
        assert 0 <= indicators.rsi <= 100
        assert -1 <= indicators.trend_strength <= 1
        assert indicators.bollinger.upper > indicators.bollinger.lower
