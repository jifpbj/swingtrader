"""
Unit tests for Pydantic v2 domain models.

Tests boundary validation, model_validator logic, and enum parsing — the
contracts that every other layer relies on at runtime.
"""

import time

import pytest
from pydantic import ValidationError

from app.models.schemas import (
    Candle,
    OHLCVResponse,
    PriceProbabilityForecast,
    PredictiveBand,
    Timeframe,
    TechnicalIndicators,
    MACDResult,
    BollingerResult,
    SignalDirection,
)


# ─── Candle ───────────────────────────────────────────────────────────────────

class TestCandle:
    def test_valid_bullish_candle(self):
        c = Candle(time=1000, open=100.0, high=105.0, low=99.0, close=103.0, volume=5000.0)
        assert c.is_bullish
        assert c.body_pct == pytest.approx(3.0)

    def test_high_must_be_gte_open(self):
        with pytest.raises(ValidationError, match="high must be >= open"):
            Candle(time=1000, open=105.0, high=100.0, low=99.0, close=103.0, volume=1.0)

    def test_low_must_be_lte_open(self):
        with pytest.raises(ValidationError, match="low must be <= open"):
            Candle(time=1000, open=100.0, high=105.0, low=102.0, close=103.0, volume=1.0)

    def test_bearish_candle(self):
        c = Candle(time=1000, open=105.0, high=106.0, low=99.0, close=100.0, volume=1.0)
        assert not c.is_bullish


# ─── OHLCVResponse ────────────────────────────────────────────────────────────

class TestOHLCVResponse:
    def test_count_auto_populated(self):
        bars = [Candle(time=i, open=100.0, high=101.0, low=99.0, close=100.5, volume=1.0) for i in range(5)]
        resp = OHLCVResponse(ticker="AAPL", timeframe=Timeframe.M15, bars=bars)
        assert resp.count == 5

    def test_empty_bars(self):
        resp = OHLCVResponse(ticker="AAPL", timeframe=Timeframe.M15, bars=[])
        assert resp.count == 0


# ─── Timeframe ────────────────────────────────────────────────────────────────

class TestTimeframe:
    @pytest.mark.parametrize("value,expected", [
        ("1Min", Timeframe.M1),
        ("15Min", Timeframe.M15),
        ("1Day", Timeframe.D1),
    ])
    def test_parse_from_string(self, value, expected):
        assert Timeframe(value) == expected

    def test_invalid_timeframe(self):
        with pytest.raises(ValueError):
            Timeframe("30Min")


# ─── TechnicalIndicators ──────────────────────────────────────────────────────

class TestTechnicalIndicators:
    def test_rsi_bounds_enforced(self):
        with pytest.raises(ValidationError):
            TechnicalIndicators(
                ticker="AAPL", timeframe=Timeframe.M15, timestamp=1000,
                rsi=101.0,  # > 100
                macd=MACDResult(macd=0, signal=0, histogram=0),
                bollinger=BollingerResult(upper=105, middle=100, lower=95, bandwidth=0.1, percent_b=0.5),
                atr=1.0, volume_sma=1000.0, volume_ratio=1.0,
                price=100.0, ema_20=100.0, ema_50=99.0, trend_strength=0.1,
            )

    def test_trend_strength_bounds_enforced(self):
        with pytest.raises(ValidationError):
            TechnicalIndicators(
                ticker="AAPL", timeframe=Timeframe.M15, timestamp=1000,
                rsi=50.0,
                macd=MACDResult(macd=0, signal=0, histogram=0),
                bollinger=BollingerResult(upper=105, middle=100, lower=95, bandwidth=0.1, percent_b=0.5),
                atr=1.0, volume_sma=1000.0, volume_ratio=1.0,
                price=100.0, ema_20=100.0, ema_50=99.0,
                trend_strength=1.5,  # > 1
            )


# ─── PriceProbabilityForecast ─────────────────────────────────────────────────

class TestPriceProbabilityForecast:
    def _base_forecast(self, **overrides):
        now = int(time.time())
        defaults = dict(
            ticker="AAPL", timeframe=Timeframe.M15, generated_at=now,
            confidence=70.0, direction=SignalDirection.BULLISH,
            target_price=155.0, target_time=now + 9000,
            probability_up=0.6, probability_down=0.3, probability_neutral=0.1,
            bands=[],
        )
        defaults.update(overrides)
        return PriceProbabilityForecast(**defaults)

    def test_valid_forecast(self):
        fc = self._base_forecast()
        assert fc.model_type == "statistical"

    def test_probabilities_must_sum_to_one(self):
        with pytest.raises(ValidationError, match="Probabilities must sum to 1.0"):
            self._base_forecast(probability_up=0.5, probability_down=0.5, probability_neutral=0.5)

    def test_near_one_allowed(self):
        # 0.999 is within the 0.99–1.01 tolerance
        fc = self._base_forecast(probability_up=0.6, probability_down=0.3, probability_neutral=0.099)
        assert fc.probability_up == pytest.approx(0.6)
