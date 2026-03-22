from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── App ──────────────────────────────────────────────────────────────────
    app_env: Literal["development", "production", "testing"] = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "INFO"
    cors_origins_env: str = Field(default="", alias="CORS_ORIGINS")

    # ─── Alpaca Trading API (per-user paper/live keys) ────────────────────────
    alpaca_api_key: str = Field(default="", alias="ALPACA_API_KEY")
    alpaca_secret_key: str = Field(default="", alias="ALPACA_SECRET_KEY")
    alpaca_base_url: str = "https://paper-api.alpaca.markets"
    alpaca_data_url: str = "https://data.alpaca.markets"

    # ─── Alpaca Broker API (server-side, manages end-user accounts) ───────────
    alpaca_broker_key: str = Field(default="", alias="ALPACA_BROKER_KEY")
    alpaca_broker_secret: str = Field(default="", alias="ALPACA_BROKER_SECRET")
    alpaca_broker_url: str = "https://broker-api.sandbox.alpaca.markets"
    alpaca_broker_data_url: str = "https://data.alpaca.markets"
    use_broker_data: bool = Field(default=False, alias="USE_BROKER_DATA")

    # ─── Polygon ──────────────────────────────────────────────────────────────
    polygon_api_key: str = Field(default="", alias="POLYGON_API_KEY")

    # ─── Stripe ───────────────────────────────────────────────────────────────
    stripe_secret_key: str = Field(default="", alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str = Field(default="", alias="STRIPE_WEBHOOK_SECRET")

    # ─── Email Notifications (Resend) ────────────────────────────────────────
    resend_api_key: str = Field(default="", alias="RESEND_API_KEY")
    email_from: str = Field(
        default="Predictive Alpha <notifications@predictivealpha.com>",
        alias="EMAIL_FROM",
    )

    # ─── Firebase / Firestore ─────────────────────────────────────────────────
    google_application_credentials: str = Field(
        default="service-account.json",
        alias="GOOGLE_APPLICATION_CREDENTIALS",
    )

    # ─── Stream ───────────────────────────────────────────────────────────────
    tick_interval_ms: int = 5000  # WebSocket tick poll interval

    # ─── Analysis parameters ──────────────────────────────────────────────────
    default_timeframe: str = "15Min"
    default_lookback_bars: int = 200
    rsi_period: int = 14
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9
    bollinger_period: int = 20
    bollinger_std: float = 2.0

    @field_validator("log_level")
    @classmethod
    def normalise_log_level(cls, v: str) -> str:
        return v.upper()

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def cors_origins(self) -> list[str]:
        if self.cors_origins_env.strip():
            return [o.strip() for o in self.cors_origins_env.split(",") if o.strip()]
        # Default: allow all origins.
        # Lock down by setting CORS_ORIGINS=https://your-domain.com in your env.
        return ["*"]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached singleton — import and call this everywhere."""
    return Settings()
