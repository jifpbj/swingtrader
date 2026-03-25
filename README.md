# Predict Alpha

A high-performance, dark-mode trading dashboard with AI-powered predictive analysis. Built on a Next.js frontend and a FastAPI backend, connected via WebSocket for real-time OHLCV streaming and alpha signal delivery.

---

## Architecture

```
swingtrader/
├── src/                        # Next.js frontend (App Router)
│   ├── app/                    # Pages and global styles
│   ├── components/
│   │   ├── layout/             # TopBar, Sidebar, Providers
│   │   ├── trading/            # ChartContainer, IndicatorRibbon
│   │   ├── analysis/           # PredictiveGauge, AlphaFeed
│   │   └── ui/                 # TickerSearch (⌘K)
│   ├── hooks/                  # useMarketData (WebSocket), useMockData
│   ├── store/                  # Zustand global UI state
│   ├── types/                  # Shared TypeScript types
│   └── lib/                    # Utilities (cn, formatPrice, etc.)
└── backend/                    # FastAPI backend
    └── app/
        ├── main.py             # App factory and lifespan
        ├── core/               # Config (pydantic-settings), logging (structlog)
        ├── models/             # Pydantic v2 schemas
        ├── engine/             # Analysis engine, predictive model
        ├── services/           # Market data (Mock / Alpaca), TTL cache
        └── api/
            ├── dependencies.py # FastAPI DI providers
            └── routes/         # REST routes, WebSocket endpoint
```

---

## Frontend

### Stack

| Layer | Library |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| Styling | Tailwind CSS v4, glassmorphism utilities |
| Charts | lightweight-charts v5 (OHLCV), Recharts (indicators) |
| State | Zustand (`subscribeWithSelector`) |
| Data fetching | TanStack Query (REST), native WebSocket hook |
| Icons | lucide-react |

### Running

```bash
npm install
npm run dev
# → http://localhost:3000
```

### Key components

**`ChartContainer`** — Candlestick chart via lightweight-charts v5. Subscribes to `chart.subscribeCrosshairMove` to display a floating OHLCV popup on hover. Renders a shaded AI predictive band overlay (toggleable).

**`IndicatorRibbon`** — Bottom bar showing a live RSI arc gauge (SVG), MACD histogram (Recharts `BarChart`), and Market Regime Score slide bar.

**`PredictiveGauge`** — Radial bar chart (0–100 confidence score) with bull/bear label and probability split bars.

**`AlphaFeed`** — Scrollable real-time log of AI-generated signals. Each card shows direction, strength, timeframe badge, confidence %, and price at signal.

**`TickerSearch`** — Command-palette triggered by `⌘K`. Supports keyboard navigation (↑↓ arrows, Enter to select, Esc to close). Lists 10 assets across crypto, equity, and forex.

### Environment

```bash
# src/.env.local
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Backend

### Stack

| Layer | Library |
|---|---|
| Framework | FastAPI 0.115, uvicorn |
| Validation | Pydantic v2, pydantic-settings |
| Analysis | pandas 2.2, numpy 2.1 (all TA implemented natively) |
| HTTP client | httpx (async) |
| Logging | structlog (console in dev, JSON in prod) |
| Caching | In-process `AsyncTTLCache` (cachetools) |

### Running

```bash
cd backend
cp .env.example .env     # edit as needed
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# Docs → http://localhost:8000/docs
```

### REST endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/api/v1/market/ohlcv/{ticker}` | Historical OHLCV bars |
| `GET` | `/api/v1/market/indicators/{ticker}` | RSI, MACD, Bollinger, ATR, EMA |
| `GET` | `/api/v1/market/regime/{ticker}` | Market Regime Score 0–100 |
| `GET` | `/api/v1/market/prediction/{ticker}` | Price probability forecast + bands |
| `GET` | `/api/v1/market/signals/{ticker}` | AI alpha signals |

Query params available on all routes: `timeframe` (default `15Min`), `limit` (OHLCV only).

### WebSocket

```
ws://localhost:8000/ws/trades/{ticker}?timeframe=15Min&horizon=10
```

The server streams a mixed message feed. Each message is a JSON envelope:

```json
{ "type": "candle" | "indicator" | "prediction" | "signal" | "error" | "subscribe_ack",
  "data": { ... },
  "timestamp": 1718000000 }
```

| Message type | Cadence |
|---|---|
| `candle` | Every tick (default 1 s) |
| `indicator` | Every 5 ticks |
| `prediction` | Every 15 ticks |
| `signal` | Every 20 ticks (only when conditions are met) |

### Analysis engine

All technical indicators are implemented natively in `app/engine/analysis.py` using pandas/numpy — no C extension required.

**Market Regime Score** (0–100, 50 = neutral):

| Component | Weight | Scoring |
|---|---|---|
| RSI | 25% | Raw RSI value |
| MACD histogram | 25% | Sigmoid-mapped magnitude |
| Bollinger %B | 20% | Position within bands |
| EMA trend | 20% | Fast/slow EMA gap, normalised |
| Sentiment | 10% | Mocked; replace with FinBERT / news feed |

### Predictive engine

`app/engine/predictive.py` exposes a `PredictiveModel` abstract base class. The active implementation is `StatisticalModel` — a directional vote across RSI, MACD, Bollinger, and EMA trend that produces a confidence score, probability split (up/down/neutral), and a widening uncertainty cone (√n diffusion).

Stub classes `TFTModel` and `LSTMModel` are provided. To wire in a trained model:

1. Subclass `PredictiveModel` and implement `warm_up()` and `predict()`.
2. Swap the instantiation in `app/main.py` lifespan.

### Market data

`USE_MOCK_DATA=true` (default) uses `MockMarketDataService`, which generates deterministic GBM candles seeded per ticker — no API keys needed.

Set `USE_MOCK_DATA=false` to switch to `AlpacaMarketDataService`. Fill in `ALPACA_API_KEY` and `ALPACA_SECRET_KEY` in `.env`. The default endpoint is paper trading (`paper-api.alpaca.markets`).

### Caching

| Cache | TTL | Notes |
|---|---|---|
| OHLCV | 30 s | Short-lived; refreshes with each closed bar |
| Indicators | 60 s | One recompute per bar |
| Predictions | 120 s | Expensive; acceptable staleness |

---

## Development workflow

Both services must be running for the full live data path:

```bash
# Terminal 1 — backend
cd backend && uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
npm run dev
```

The frontend falls back to `MockMarketDataService` automatically when the WebSocket is unreachable (the `useMarketData` hook retries every 3 s), so the UI remains functional without a running backend.
