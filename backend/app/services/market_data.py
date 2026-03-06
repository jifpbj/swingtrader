"""
Market Data Service
───────────────────
Abstract base + concrete implementation:

  AlpacaMarketDataService — live Alpaca Markets REST feed + yfinance for history.

Inject via app/api/dependencies.py — callers never instantiate directly.
"""

from __future__ import annotations

import asyncio
import time
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator

import httpx
import yfinance as yf
from rapidfuzz import fuzz

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.schemas import AssetSearchResult, Candle, Timeframe, TIMEFRAME_SECONDS

logger = get_logger(__name__)

# ─── Timeframe → Alpaca bar size mapping ──────────────────────────────────────
_ALPACA_TIMEFRAME: dict[Timeframe, str] = {
    Timeframe.M1:  "1Min",
    Timeframe.M5:  "5Min",
    Timeframe.M15: "15Min",
    Timeframe.H1:  "1Hour",
    Timeframe.H4:  "4Hour",
    Timeframe.D1:  "1Day",
}

# ─── Yahoo Finance helpers ────────────────────────────────────────────────────
# Alpaca's free plan only streams today's data; yfinance gives multi-year history.

_YF_INTERVAL: dict[Timeframe, str] = {
    Timeframe.M1:  "1m",
    Timeframe.M5:  "5m",
    Timeframe.M15: "15m",
    Timeframe.H1:  "1h",
    Timeframe.H4:  "1h",   # fetch 1h and resample to 4h
    Timeframe.D1:  "1d",
}

# Max lookback yfinance supports per interval
_YF_MAX_LOOKBACK_DAYS: dict[Timeframe, int] = {
    Timeframe.M1:  7,
    Timeframe.M5:  60,
    Timeframe.M15: 60,
    Timeframe.H1:  730,
    Timeframe.H4:  730,
    Timeframe.D1:  10_000,
}


def _to_yf_symbol(ticker: str) -> str:
    """BTC/USD → BTC-USD, AAPL → AAPL"""
    return ticker.replace("/", "-")


def _yf_fetch(ticker: str, timeframe: Timeframe, limit: int, end_dt: datetime) -> list[Candle]:
    """Synchronous yfinance fetch — call via run_in_executor."""
    yf_sym   = _to_yf_symbol(ticker)
    interval = _YF_INTERVAL[timeframe]
    bar_secs = TIMEFRAME_SECONDS[timeframe]
    max_days = _YF_MAX_LOOKBACK_DAYS[timeframe]

    # Lookback = limit bars * bar size * 2× buffer for weekends/holidays, capped by plan limit
    lookback_secs = min(bar_secs * limit * 2, max_days * 86_400)
    start_dt = end_dt - timedelta(seconds=lookback_secs)

    try:
        hist = yf.Ticker(yf_sym).history(
            start=start_dt,
            end=end_dt,
            interval=interval,
            auto_adjust=True,
            raise_errors=False,
        )
    except Exception:
        return []

    if hist is None or hist.empty:
        return []

    # Resample 1h → 4h for the H4 timeframe
    if timeframe == Timeframe.H4:
        hist = (
            hist.resample("4h", origin="start_day")
            .agg({"Open": "first", "High": "max", "Low": "min",
                  "Close": "last", "Volume": "sum"})
            .dropna(subset=["Open"])
        )

    candles: list[Candle] = []
    for ts, row in hist.iterrows():
        # Normalise to UTC unix timestamp regardless of yfinance tz output
        if hasattr(ts, "tzinfo") and ts.tzinfo is not None:
            t = int(ts.tz_convert("UTC").timestamp())
        else:
            t = int(ts.timestamp())
        candles.append(Candle(
            time=t,
            open=round(float(row["Open"]),   4),
            high=round(float(row["High"]),   4),
            low=round(float(row["Low"]),     4),
            close=round(float(row["Close"]), 4),
            volume=round(float(row["Volume"]), 2),
        ))

    # Return the most recent `limit` bars, oldest first
    return candles[-limit:]


# ─── Curated seed catalog ──────────────────────────────────────────────────────
# Used for two purposes:
#   1. Popular list — returned instantly without any API call.
#   2. Search fallback — when Alpaca asset API is unavailable.
#
# Format: (symbol, name, asset_class, exchange)
# Covers the most-searched US equities, ETFs and crypto pairs.

_ASSET_SEED: list[tuple[str, str, str, str]] = [
    # ── Crypto ────────────────────────────────────────────────────────────────
    ("BTC/USD",  "Bitcoin",                       "crypto", "CRYPTO"),
    ("ETH/USD",  "Ethereum",                      "crypto", "CRYPTO"),
    ("SOL/USD",  "Solana",                        "crypto", "CRYPTO"),
    ("BNB/USD",  "BNB",                           "crypto", "CRYPTO"),
    ("XRP/USD",  "XRP",                           "crypto", "CRYPTO"),
    ("DOGE/USD", "Dogecoin",                      "crypto", "CRYPTO"),
    ("ADA/USD",  "Cardano",                       "crypto", "CRYPTO"),
    ("AVAX/USD", "Avalanche",                     "crypto", "CRYPTO"),
    ("LINK/USD", "Chainlink",                     "crypto", "CRYPTO"),
    ("DOT/USD",  "Polkadot",                      "crypto", "CRYPTO"),
    ("MATIC/USD","Polygon",                       "crypto", "CRYPTO"),
    ("UNI/USD",  "Uniswap",                       "crypto", "CRYPTO"),
    ("LTC/USD",  "Litecoin",                      "crypto", "CRYPTO"),
    ("BCH/USD",  "Bitcoin Cash",                  "crypto", "CRYPTO"),
    ("SHIB/USD", "Shiba Inu",                     "crypto", "CRYPTO"),
    # ── Mega-cap tech ─────────────────────────────────────────────────────────
    ("AAPL",  "Apple Inc.",                       "equity", "NASDAQ"),
    ("MSFT",  "Microsoft Corp.",                  "equity", "NASDAQ"),
    ("NVDA",  "NVIDIA Corp.",                     "equity", "NASDAQ"),
    ("AMZN",  "Amazon.com Inc.",                  "equity", "NASDAQ"),
    ("GOOGL", "Alphabet Inc. Class A",            "equity", "NASDAQ"),
    ("GOOG",  "Alphabet Inc. Class C",            "equity", "NASDAQ"),
    ("META",  "Meta Platforms Inc.",              "equity", "NASDAQ"),
    ("TSLA",  "Tesla Inc.",                       "equity", "NASDAQ"),
    ("AVGO",  "Broadcom Inc.",                    "equity", "NASDAQ"),
    ("ORCL",  "Oracle Corp.",                     "equity", "NYSE"),
    ("CRM",   "Salesforce Inc.",                  "equity", "NYSE"),
    ("ADBE",  "Adobe Inc.",                       "equity", "NASDAQ"),
    ("AMD",   "Advanced Micro Devices Inc.",      "equity", "NASDAQ"),
    ("INTC",  "Intel Corp.",                      "equity", "NASDAQ"),
    ("QCOM",  "Qualcomm Inc.",                    "equity", "NASDAQ"),
    ("TXN",   "Texas Instruments Inc.",           "equity", "NASDAQ"),
    ("MU",    "Micron Technology Inc.",           "equity", "NASDAQ"),
    ("AMAT",  "Applied Materials Inc.",           "equity", "NASDAQ"),
    ("LRCX",  "Lam Research Corp.",               "equity", "NASDAQ"),
    ("ASML",  "ASML Holding NV ADR",             "equity", "NASDAQ"),
    ("NOW",   "ServiceNow Inc.",                  "equity", "NYSE"),
    ("PANW",  "Palo Alto Networks Inc.",          "equity", "NASDAQ"),
    ("CRWD",  "CrowdStrike Holdings Inc.",        "equity", "NASDAQ"),
    ("SNOW",  "Snowflake Inc.",                   "equity", "NYSE"),
    ("NET",   "Cloudflare Inc.",                  "equity", "NYSE"),
    ("PLTR",  "Palantir Technologies Inc.",       "equity", "NYSE"),
    ("UBER",  "Uber Technologies Inc.",           "equity", "NYSE"),
    ("LYFT",  "Lyft Inc.",                        "equity", "NASDAQ"),
    ("ABNB",  "Airbnb Inc.",                      "equity", "NASDAQ"),
    ("SHOP",  "Shopify Inc.",                     "equity", "NYSE"),
    ("SQ",    "Block Inc.",                       "equity", "NYSE"),
    ("PYPL",  "PayPal Holdings Inc.",             "equity", "NASDAQ"),
    ("COIN",  "Coinbase Global Inc.",             "equity", "NASDAQ"),
    ("HOOD",  "Robinhood Markets Inc.",           "equity", "NASDAQ"),
    # ── Financials ────────────────────────────────────────────────────────────
    ("JPM",   "JPMorgan Chase & Co.",             "equity", "NYSE"),
    ("BAC",   "Bank of America Corp.",            "equity", "NYSE"),
    ("WFC",   "Wells Fargo & Co.",                "equity", "NYSE"),
    ("GS",    "Goldman Sachs Group Inc.",         "equity", "NYSE"),
    ("MS",    "Morgan Stanley",                   "equity", "NYSE"),
    ("C",     "Citigroup Inc.",                   "equity", "NYSE"),
    ("BLK",   "BlackRock Inc.",                   "equity", "NYSE"),
    ("SCHW",  "Charles Schwab Corp.",             "equity", "NYSE"),
    ("V",     "Visa Inc.",                        "equity", "NYSE"),
    ("MA",    "Mastercard Inc.",                  "equity", "NYSE"),
    ("AXP",   "American Express Co.",             "equity", "NYSE"),
    # ── Healthcare & Biotech ──────────────────────────────────────────────────
    ("LLY",   "Eli Lilly and Co.",                "equity", "NYSE"),
    ("JNJ",   "Johnson & Johnson",               "equity", "NYSE"),
    ("UNH",   "UnitedHealth Group Inc.",          "equity", "NYSE"),
    ("PFE",   "Pfizer Inc.",                      "equity", "NYSE"),
    ("ABBV",  "AbbVie Inc.",                      "equity", "NYSE"),
    ("MRK",   "Merck & Co. Inc.",                 "equity", "NYSE"),
    ("AMGN",  "Amgen Inc.",                       "equity", "NASDAQ"),
    ("GILD",  "Gilead Sciences Inc.",             "equity", "NASDAQ"),
    ("MRNA",  "Moderna Inc.",                     "equity", "NASDAQ"),
    ("BNTX",  "BioNTech SE ADR",                 "equity", "NASDAQ"),
    # ── Consumer / Retail ─────────────────────────────────────────────────────
    ("WMT",   "Walmart Inc.",                     "equity", "NYSE"),
    ("COST",  "Costco Wholesale Corp.",           "equity", "NASDAQ"),
    ("TGT",   "Target Corp.",                     "equity", "NYSE"),
    ("HD",    "Home Depot Inc.",                  "equity", "NYSE"),
    ("LOW",   "Lowe's Companies Inc.",            "equity", "NYSE"),
    ("MCD",   "McDonald's Corp.",                 "equity", "NYSE"),
    ("SBUX",  "Starbucks Corp.",                  "equity", "NASDAQ"),
    ("NKE",   "Nike Inc.",                        "equity", "NYSE"),
    ("NFLX",  "Netflix Inc.",                     "equity", "NASDAQ"),
    ("DIS",   "Walt Disney Co.",                  "equity", "NYSE"),
    ("CMCSA", "Comcast Corp.",                    "equity", "NASDAQ"),
    # ── Energy ────────────────────────────────────────────────────────────────
    ("XOM",   "Exxon Mobil Corp.",                "equity", "NYSE"),
    ("CVX",   "Chevron Corp.",                    "equity", "NYSE"),
    ("COP",   "ConocoPhillips",                   "equity", "NYSE"),
    ("OXY",   "Occidental Petroleum Corp.",       "equity", "NYSE"),
    ("SLB",   "SLB (Schlumberger)",               "equity", "NYSE"),
    # ── Industrials & Aerospace ───────────────────────────────────────────────
    ("BA",    "Boeing Co.",                       "equity", "NYSE"),
    ("CAT",   "Caterpillar Inc.",                 "equity", "NYSE"),
    ("GE",    "GE Aerospace",                     "equity", "NYSE"),
    ("HON",   "Honeywell International Inc.",     "equity", "NASDAQ"),
    ("LMT",   "Lockheed Martin Corp.",            "equity", "NYSE"),
    ("RTX",   "RTX Corp.",                        "equity", "NYSE"),
    ("UPS",   "United Parcel Service Inc.",       "equity", "NYSE"),
    ("FDX",   "FedEx Corp.",                      "equity", "NYSE"),
    # ── Broad Market & Sector ETFs ────────────────────────────────────────────
    ("SPY",   "SPDR S&P 500 ETF Trust",           "equity", "NYSE"),
    ("QQQ",   "Invesco QQQ Trust",                "equity", "NASDAQ"),
    ("IWM",   "iShares Russell 2000 ETF",         "equity", "NYSE"),
    ("VTI",   "Vanguard Total Stock Market ETF",  "equity", "NYSE"),
    ("VOO",   "Vanguard S&P 500 ETF",             "equity", "NYSE"),
    ("VEA",   "Vanguard FTSE Developed Mkts ETF", "equity", "NYSE"),
    ("VWO",   "Vanguard FTSE Emerging Mkts ETF",  "equity", "NYSE"),
    ("EFA",   "iShares MSCI EAFE ETF",            "equity", "NYSE"),
    ("EEM",   "iShares MSCI Emerging Mkts ETF",   "equity", "NYSE"),
    ("DIA",   "SPDR Dow Jones Industrial Avg ETF","equity", "NYSE"),
    # ── Sector ETFs ──────────────────────────────────────────────────────────
    ("XLK",   "Technology Select Sector SPDR",    "equity", "NYSE"),
    ("XLF",   "Financial Select Sector SPDR",     "equity", "NYSE"),
    ("XLV",   "Health Care Select Sector SPDR",   "equity", "NYSE"),
    ("XLE",   "Energy Select Sector SPDR",        "equity", "NYSE"),
    ("XLI",   "Industrial Select Sector SPDR",    "equity", "NYSE"),
    ("XLY",   "Consumer Discret Select Sector SPDR","equity","NYSE"),
    ("XLP",   "Consumer Staples Select Sector SPDR","equity","NYSE"),
    ("XLB",   "Materials Select Sector SPDR",     "equity", "NYSE"),
    ("XLU",   "Utilities Select Sector SPDR",     "equity", "NYSE"),
    ("XLRE",  "Real Estate Select Sector SPDR",   "equity", "NYSE"),
    ("XLC",   "Communication Svcs Select Sector SPDR","equity","NYSE"),
    # ── Thematic & Leveraged ETFs ─────────────────────────────────────────────
    ("ARKK",  "ARK Innovation ETF",               "equity", "NYSE"),
    ("SOXX",  "iShares Semiconductor ETF",        "equity", "NASDAQ"),
    ("SMH",   "VanEck Semiconductor ETF",         "equity", "NASDAQ"),
    ("GLD",   "SPDR Gold Shares",                 "equity", "NYSE"),
    ("SLV",   "iShares Silver Trust",             "equity", "NYSE"),
    ("TLT",   "iShares 20+ Yr Treasury Bond ETF", "equity", "NASDAQ"),
    ("HYG",   "iShares iBoxx $ High Yield Corp Bond ETF","equity","NYSE"),
    ("VXX",   "iPath Series B S&P 500 VIX Short-Term Futures ETN","equity","CBOE"),
    ("SQQQ",  "ProShares UltraPro Short QQQ",     "equity", "NASDAQ"),
    ("TQQQ",  "ProShares UltraPro QQQ",           "equity", "NASDAQ"),
    ("SPXU",  "ProShares UltraPro Short S&P 500", "equity", "NYSE"),
    ("UPRO",  "ProShares UltraPro S&P 500",       "equity", "NYSE"),
]

# Popular tickers shown by default (before the user types anything)
_POPULAR_SYMBOLS = [
    "BTC/USD", "ETH/USD", "SOL/USD",
    "AAPL", "NVDA", "TSLA", "MSFT", "AMZN",
    "SPY", "QQQ", "PLTR", "COIN",
]

def _seed_catalog() -> list[AssetSearchResult]:
    """Return the full seed catalog as AssetSearchResult objects."""
    return [
        AssetSearchResult(symbol=s, name=n, asset_class=ac, exchange=ex)  # type: ignore[arg-type]
        for s, n, ac, ex in _ASSET_SEED
    ]


# ─── Fuzzy search helpers ──────────────────────────────────────────────────────

_FUZZY_THRESHOLD = 45  # minimum score (0–100) to include a result

def _fuzzy_score(asset: AssetSearchResult, q: str) -> float:
    """
    Score an asset against a query string using multiple fuzzy strategies.
    Returns a float in [0, 100]; higher = better match.

    Priority order:
      1. Exact symbol prefix  (e.g. "BTC" → "BTC/USD")
      2. Fuzzy symbol match   (e.g. "APPL" → "AAPL")
      3. Partial name match   (e.g. "apple" → "Apple Inc.")
      4. Token set name match (e.g. "nvidia corp" → "NVIDIA Corp.")
    """
    sym  = asset.symbol.lower()
    name = asset.name.lower()

    # Symbol: exact prefix gives a guaranteed high score
    if sym.startswith(q) or sym.replace("/", "").startswith(q):
        sym_prefix = 95 - len(sym) * 0.3  # shorter symbol → higher rank
    else:
        sym_prefix = 0.0

    sym_score = max(
        sym_prefix,
        fuzz.ratio(q, sym),
        fuzz.partial_ratio(q, sym),
        fuzz.ratio(q, sym.replace("/", "")),  # "btcusd" vs "btcusd"
    )

    name_score = max(
        fuzz.partial_ratio(q, name),
        fuzz.token_set_ratio(q, name),
    ) * 0.82  # weight name lower than symbol

    return max(sym_score, name_score)


def _fuzzy_search(
    assets: list[AssetSearchResult],
    query: str,
    limit: int,
) -> list[AssetSearchResult]:
    """Filter and rank assets by fuzzy relevance."""
    q = query.lower().strip()
    if not q:
        return assets[:limit]

    scored = [
        (asset, _fuzzy_score(asset, q))
        for asset in assets
    ]
    scored = [(a, s) for a, s in scored if s >= _FUZZY_THRESHOLD]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [a for a, _ in scored[:limit]]


# ─── Abstract base ─────────────────────────────────────────────────────────────

class MarketDataService(ABC):
    """All market data sources must implement this interface."""

    @abstractmethod
    async def get_ohlcv(
        self,
        ticker: str,
        timeframe: Timeframe,
        limit: int = 200,
        end: str | None = None,
    ) -> list[Candle]:
        """Return up to `limit` bars ending at `end` (ISO-8601), newest last."""

    @abstractmethod
    async def get_latest_price(self, ticker: str) -> float:
        """Return the most recent trade price."""

    @abstractmethod
    async def stream_ticks(
        self,
        ticker: str,
        timeframe: Timeframe,
        interval_seconds: float,
    ) -> AsyncIterator[Candle]:
        """
        Async generator that yields a simulated or live tick candle
        every `interval_seconds`.  Caller must `aclose()` the generator.
        """

    @abstractmethod
    async def search_assets(
        self,
        query: str,
        limit: int = 10,
    ) -> list[AssetSearchResult]:
        """Return assets whose symbol or name matches the query string."""

    @abstractmethod
    async def get_popular(self) -> list[AssetSearchResult]:
        """Return the curated popular asset list shown before a search is typed."""


# ─── Alpaca implementation ────────────────────────────────────────────────────

class AlpacaMarketDataService(MarketDataService):
    """
    Fetches OHLCV data from Alpaca Markets REST API v2.
    Uses httpx for async HTTP.

    For live tick streaming, Alpaca provides a WebSocket feed at:
      wss://stream.data.alpaca.markets/v2/{feed}/{symbol}
    The `stream_ticks` method here polls the REST API instead for simplicity;
    use the Alpaca SDK's WebSocket client for production-grade streaming.
    """

    _ASSET_CACHE_TTL = 3_600  # seconds

    def __init__(self) -> None:
        self._settings = get_settings()
        self._headers = {
            "APCA-API-KEY-ID": self._settings.alpaca_api_key,
            "APCA-API-SECRET-KEY": self._settings.alpaca_secret_key,
        }
        self._http: httpx.AsyncClient | None = None
        self._broker_http: httpx.AsyncClient | None = None
        self._assets_cache: list[AssetSearchResult] = []
        self._assets_cache_ts: float = 0.0

    async def _client(self) -> httpx.AsyncClient:
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(
                base_url=self._settings.alpaca_data_url,
                headers=self._headers,
                timeout=10.0,
            )
        return self._http

    async def _broker_client(self) -> httpx.AsyncClient:
        if self._broker_http is None or self._broker_http.is_closed:
            self._broker_http = httpx.AsyncClient(
                base_url=self._settings.alpaca_base_url,
                headers=self._headers,
                timeout=15.0,
            )
        return self._broker_http

    async def close(self) -> None:
        if self._http and not self._http.is_closed:
            await self._http.aclose()
        if self._broker_http and not self._broker_http.is_closed:
            await self._broker_http.aclose()

    async def get_ohlcv(
        self,
        ticker: str,
        timeframe: Timeframe,
        limit: int = 200,
        end: str | None = None,
    ) -> list[Candle]:
        """
        Fetches historical OHLCV via Yahoo Finance (free, multi-year history).
        Alpaca's free plan only provides today's streaming data, so yfinance
        is used for all historical chart data.  Alpaca is still used for
        real-time price polling (get_latest_price / stream_ticks).
        """
        end_dt = (
            datetime.fromisoformat(end.replace("Z", "+00:00")).astimezone(timezone.utc)
            if end else datetime.now(timezone.utc)
        )
        bars = await asyncio.get_event_loop().run_in_executor(
            None, _yf_fetch, ticker, timeframe, limit, end_dt
        )
        logger.info("yf_bars_fetched", ticker=ticker, timeframe=timeframe, count=len(bars))
        return bars

    async def get_latest_price(self, ticker: str) -> float:
        is_crypto = "/" in ticker
        if is_crypto:
            base = "/v1beta3/crypto/us/latest/trades"
            symbol = ticker  # keep slash: "BTC/USD"
        else:
            base = "/v2/stocks/trades/latest"
            symbol = ticker

        client = await self._client()
        try:
            resp = await client.get(base, params={"symbols": symbol})
            resp.raise_for_status()
            data = resp.json()
            trade = data.get("trades", {}).get(symbol, {})
            return float(trade.get("p", 0))
        except Exception as exc:
            logger.warning("alpaca_price_error", ticker=ticker, error=str(exc))
            return 0.0

    async def get_popular(self) -> list[AssetSearchResult]:
        """Return curated popular assets from the seed catalog — no API call."""
        seed = {a.symbol: a for a in _seed_catalog()}
        return [seed[sym] for sym in _POPULAR_SYMBOLS if sym in seed]

    async def search_assets(
        self,
        query: str,
        limit: int = 10,
    ) -> list[AssetSearchResult]:
        """
        Search assets by symbol/name using fuzzy matching.
        Uses the full Alpaca asset list (fetched once and cached 1 hour).
        Falls back to the seed catalog when the Alpaca API is unavailable.
        """
        now = time.time()
        if not self._assets_cache or (now - self._assets_cache_ts) > self._ASSET_CACHE_TTL:
            self._assets_cache = await self._fetch_all_assets()
            self._assets_cache_ts = now

        return _fuzzy_search(self._assets_cache, query, limit)

    async def _fetch_all_assets(self) -> list[AssetSearchResult]:
        client = await self._broker_client()
        results: list[AssetSearchResult] = []
        try:
            for asset_class, class_label in [("us_equity", "equity"), ("crypto", "crypto")]:
                resp = await client.get(
                    "/v2/assets",
                    params={"status": "active", "asset_class": asset_class},
                )
                resp.raise_for_status()
                for a in resp.json():
                    if not a.get("tradable", False):
                        continue
                    results.append(AssetSearchResult(
                        symbol=a.get("symbol", ""),
                        name=a.get("name", a.get("symbol", "")),
                        asset_class=class_label,  # type: ignore[arg-type]
                        exchange=a.get("exchange", ""),
                    ))
        except Exception as exc:
            logger.warning("alpaca_assets_fetch_error", error=str(exc))
            results = _seed_catalog()
        logger.info("alpaca_assets_cached", count=len(results))
        return results

    async def stream_ticks(
        self,
        ticker: str,
        timeframe: Timeframe,
        interval_seconds: float = 1.0,
    ) -> AsyncIterator[Candle]:
        """
        Polls the latest bar on each interval.
        For true streaming, integrate alpaca-py's DataStream client here.
        """
        last_sig: tuple[int, float, float, float, float] | None = None
        while True:
            await asyncio.sleep(interval_seconds)
            try:
                bars = await self.get_ohlcv(ticker, timeframe, limit=1)
                if bars:
                    latest = bars[-1]
                    sig = (
                        latest.time,
                        latest.open,
                        latest.high,
                        latest.low,
                        latest.close,
                    )
                    if sig != last_sig:
                        last_sig = sig
                        yield latest
            except Exception as exc:
                logger.warning("alpaca_stream_error", ticker=ticker, error=str(exc))
