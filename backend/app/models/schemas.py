"""
Pydantic v2 domain models.

All timestamps are Unix seconds (int) for lightweight-charts compatibility.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


# ─── Enums ───────────────────────────────────────────────────────────────────

class Timeframe(str, Enum):
    M1 = "1Min"
    M5 = "5Min"
    M15 = "15Min"
    H1 = "1Hour"
    H4 = "4Hour"
    D1 = "1Day"


class SignalDirection(str, Enum):
    BULLISH = "bullish"
    BEARISH = "bearish"
    NEUTRAL = "neutral"


class SignalStrength(str, Enum):
    STRONG = "strong"
    MODERATE = "moderate"
    WEAK = "weak"


class RegimeLabel(str, Enum):
    STRONG_BULL = "strong_bull"
    BULL = "bull"
    NEUTRAL = "neutral"
    BEAR = "bear"
    STRONG_BEAR = "strong_bear"


# ─── OHLCV ───────────────────────────────────────────────────────────────────

class Candle(BaseModel):
    """Single OHLCV bar."""
    time: int = Field(..., description="Unix timestamp in seconds")
    open: float
    high: float
    low: float
    close: float
    volume: float

    @field_validator("high")
    @classmethod
    def high_gte_open_close(cls, v: float, info: Any) -> float:
        data = info.data
        if "open" in data and v < data["open"]:
            raise ValueError("high must be >= open")
        return v

    @field_validator("low")
    @classmethod
    def low_lte_open_close(cls, v: float, info: Any) -> float:
        data = info.data
        if "open" in data and v > data["open"]:
            raise ValueError("low must be <= open")
        return v

    @property
    def body_pct(self) -> float:
        """Candle body size as a percentage of open price."""
        return abs(self.close - self.open) / self.open * 100

    @property
    def is_bullish(self) -> bool:
        return self.close >= self.open


class OHLCVResponse(BaseModel):
    ticker: str
    timeframe: Timeframe
    bars: list[Candle]
    count: int = Field(default=0)

    @model_validator(mode="after")
    def set_count(self) -> "OHLCVResponse":
        self.count = len(self.bars)
        return self


# ─── Technical Indicators ────────────────────────────────────────────────────

class MACDResult(BaseModel):
    macd: float
    signal: float
    histogram: float


class BollingerResult(BaseModel):
    upper: float
    middle: float
    lower: float
    bandwidth: float = Field(..., description="(upper - lower) / middle")
    percent_b: float = Field(..., description="Position of price within bands (0-1)")


class TechnicalIndicators(BaseModel):
    ticker: str
    timeframe: Timeframe
    timestamp: int

    # Core indicators
    rsi: Annotated[float, Field(ge=0, le=100)]
    macd: MACDResult
    bollinger: BollingerResult
    atr: float = Field(..., description="Average True Range")
    volume_sma: float = Field(..., description="20-period volume SMA")
    volume_ratio: float = Field(..., description="Current volume / volume_sma")

    # Derived
    price: float
    ema_20: float
    ema_50: float
    trend_strength: float = Field(
        ..., ge=-1, le=1,
        description="EMA slope normalised: +1 strong up, -1 strong down"
    )


# ─── Market Regime ───────────────────────────────────────────────────────────

class SentimentSnapshot(BaseModel):
    """Mocked sentiment — replace with real NLP/news feed."""
    score: Annotated[float, Field(ge=-1, le=1)] = 0.0
    source: str = "mock"
    confidence: Annotated[float, Field(ge=0, le=1)] = 0.5


class MarketRegime(BaseModel):
    ticker: str
    timestamp: int

    # Composite 0-100 score (50 = neutral, >50 bullish, <50 bearish)
    regime_score: Annotated[float, Field(ge=0, le=100)]
    label: RegimeLabel

    # Component breakdown (each 0-100)
    rsi_component: float
    macd_component: float
    bollinger_component: float
    trend_component: float
    sentiment_component: float

    # Weights used (must sum to 1.0)
    weights: dict[str, float]


# ─── Predictive Forecast ─────────────────────────────────────────────────────

class PredictiveBand(BaseModel):
    """One point in the forward-projected price envelope."""
    time: int
    upper_bound: float
    lower_bound: float
    midpoint: float
    confidence: Annotated[float, Field(ge=0, le=1)]


class PriceProbabilityForecast(BaseModel):
    ticker: str
    timeframe: Timeframe
    generated_at: int = Field(..., description="Unix timestamp of forecast creation")

    confidence: Annotated[float, Field(ge=0, le=100)]
    direction: SignalDirection
    target_price: float
    target_time: int

    probability_up: Annotated[float, Field(ge=0, le=1)]
    probability_down: Annotated[float, Field(ge=0, le=1)]
    probability_neutral: Annotated[float, Field(ge=0, le=1)]

    bands: list[PredictiveBand]

    model_type: Literal["tft", "lstm", "statistical"] = "statistical"
    model_version: str = "0.1.0-placeholder"

    @model_validator(mode="after")
    def probabilities_sum_to_one(self) -> "PriceProbabilityForecast":
        total = self.probability_up + self.probability_down + self.probability_neutral
        if not (0.99 <= total <= 1.01):
            raise ValueError(f"Probabilities must sum to 1.0, got {total:.4f}")
        return self


# ─── Alpha Signal ─────────────────────────────────────────────────────────────

class AlphaSignal(BaseModel):
    id: str
    timestamp: int
    ticker: str
    timeframe: Timeframe
    direction: SignalDirection
    strength: SignalStrength
    title: str
    description: str
    confidence: Annotated[float, Field(ge=0, le=100)]
    price: float
    indicators_snapshot: TechnicalIndicators | None = None


# ─── WebSocket Message Envelope ───────────────────────────────────────────────

class WSMessageType(str, Enum):
    CANDLE = "candle"
    TICK = "tick"
    SIGNAL = "signal"
    PREDICTION = "prediction"
    INDICATOR = "indicator"
    ERROR = "error"
    SUBSCRIBE_ACK = "subscribe_ack"


class WSMessage(BaseModel):
    type: WSMessageType
    data: Any
    timestamp: int

    model_config = {"arbitrary_types_allowed": True}


# ─── REST request/response helpers ───────────────────────────────────────────

class TickerRequest(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=20, pattern=r"^[A-Z0-9/\-\.]+$")
    timeframe: Timeframe = Timeframe.M15
    limit: int = Field(default=200, ge=1, le=1000)


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"] = "ok"
    version: str = "1.0.0"
    use_mock: bool
