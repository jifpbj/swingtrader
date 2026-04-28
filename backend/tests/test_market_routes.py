"""
Integration tests for market API routes.

Uses an AsyncClient backed by ASGITransport — no real server, no network.
All external services (Alpaca, Firebase) replaced with fixtures from conftest.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


# ─── Health ───────────────────────────────────────────────────────────────────

class TestHealth:
    async def test_health_returns_200(self, client: AsyncClient):
        resp = await client.get("/health")
        assert resp.status_code == 200

    async def test_health_response_schema(self, client: AsyncClient):
        body = (await client.get("/health")).json()
        assert body["status"] == "ok"
        assert "version" in body


# ─── OHLCV ───────────────────────────────────────────────────────────────────

class TestOHLCV:
    async def test_ohlcv_returns_200(self, client: AsyncClient):
        resp = await client.get("/api/v1/market/ohlcv/AAPL")
        assert resp.status_code == 200

    async def test_ohlcv_response_has_bars(self, client: AsyncClient):
        body = (await client.get("/api/v1/market/ohlcv/AAPL")).json()
        assert body["ticker"] == "AAPL"
        assert body["count"] > 0
        assert len(body["bars"]) == body["count"]

    async def test_ohlcv_bar_shape(self, client: AsyncClient):
        body = (await client.get("/api/v1/market/ohlcv/AAPL")).json()
        bar = body["bars"][0]
        for field in ("time", "open", "high", "low", "close", "volume"):
            assert field in bar

    @pytest.mark.parametrize("timeframe", ["1Min", "5Min", "15Min", "1Hour", "1Day"])
    async def test_ohlcv_all_timeframes(self, client: AsyncClient, timeframe: str):
        resp = await client.get(f"/api/v1/market/ohlcv/AAPL?timeframe={timeframe}")
        assert resp.status_code == 200

    async def test_invalid_ticker_returns_422(self, client: AsyncClient):
        resp = await client.get("/api/v1/market/ohlcv/INVALID!!TICKER")
        assert resp.status_code == 422

    async def test_crypto_pair_ticker(self, client: AsyncClient):
        resp = await client.get("/api/v1/market/ohlcv/BTC/USD")
        assert resp.status_code == 200


# ─── Indicators ───────────────────────────────────────────────────────────────

class TestIndicators:
    async def test_indicators_returns_200(self, client: AsyncClient):
        resp = await client.get("/api/v1/market/indicators/AAPL")
        assert resp.status_code == 200

    async def test_indicators_schema(self, client: AsyncClient):
        body = (await client.get("/api/v1/market/indicators/AAPL")).json()
        assert 0 <= body["rsi"] <= 100
        assert "macd" in body
        assert "bollinger" in body
        assert body["bollinger"]["upper"] > body["bollinger"]["lower"]
        assert -1 <= body["trend_strength"] <= 1

    async def test_macd_histogram_equals_macd_minus_signal(self, client: AsyncClient):
        body = (await client.get("/api/v1/market/indicators/AAPL")).json()
        m = body["macd"]
        assert m["histogram"] == pytest.approx(m["macd"] - m["signal"], abs=1e-6)


# ─── Regime ───────────────────────────────────────────────────────────────────

class TestRegime:
    async def test_regime_returns_200(self, client: AsyncClient):
        resp = await client.get("/api/v1/market/regime/AAPL")
        assert resp.status_code == 200

    async def test_regime_score_in_bounds(self, client: AsyncClient):
        body = (await client.get("/api/v1/market/regime/AAPL")).json()
        assert 0 <= body["regime_score"] <= 100

    async def test_regime_weights_sum_to_one(self, client: AsyncClient):
        body = (await client.get("/api/v1/market/regime/AAPL")).json()
        assert sum(body["weights"].values()) == pytest.approx(1.0, abs=1e-6)

    async def test_regime_label_is_valid(self, client: AsyncClient):
        body = (await client.get("/api/v1/market/regime/AAPL")).json()
        valid_labels = {"strong_bull", "bull", "neutral", "bear", "strong_bear"}
        assert body["label"] in valid_labels


# ─── Popular / Search ─────────────────────────────────────────────────────────

class TestSearch:
    async def test_popular_returns_list(self, client: AsyncClient):
        resp = await client.get("/api/v1/market/popular")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_search_returns_list(self, client: AsyncClient):
        resp = await client.get("/api/v1/market/search?q=AAPL")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_search_empty_query_rejected(self, client: AsyncClient):
        resp = await client.get("/api/v1/market/search?q=")
        assert resp.status_code == 422
