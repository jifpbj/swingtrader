// ─── OHLCV / Candle ──────────────────────────────────────────────────────────
export interface Candle {
  time: number; // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── Predictive Overlay ───────────────────────────────────────────────────────
export interface PredictiveBand {
  time: number;
  upperBound: number;
  lowerBound: number;
  midpoint: number;
  confidence: number; // 0–1
}

// ─── Technical Indicators ────────────────────────────────────────────────────
export interface Indicators {
  rsi: number;          // 0–100
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  regimeScore: number;  // -1 to 1 (bear/bull regime)
  atr: number;
  volume24h: number;
}

// ─── Alpha Signal ─────────────────────────────────────────────────────────────
export type SignalDirection = "bullish" | "bearish" | "neutral";
export type SignalStrength = "strong" | "moderate" | "weak";
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface AlphaSignal {
  id: string;
  timestamp: number;
  ticker: string;
  timeframe: Timeframe;
  direction: SignalDirection;
  strength: SignalStrength;
  title: string;
  description: string;
  confidence: number; // 0–100
  price: number;
}

// ─── Prediction ───────────────────────────────────────────────────────────────
export interface Prediction {
  ticker: string;
  timeframe: Timeframe;
  confidence: number;       // 0–100
  direction: SignalDirection;
  targetPrice: number;
  targetTime: number;
  probabilityUp: number;    // 0–1
  probabilityDown: number;  // 0–1
  bands: PredictiveBand[];
}

// ─── Asset / Ticker ───────────────────────────────────────────────────────────
export interface Asset {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  marketCap?: number;
  type: "crypto" | "equity" | "forex";
}

// ─── WebSocket Messages ───────────────────────────────────────────────────────
export type WSMessageType = "candle" | "signal" | "prediction" | "indicator" | "ticker" | "subscribe_ack" | "error" | "tick";

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  data: T;
  timestamp: number;
}

// ─── EMA / Crossover ──────────────────────────────────────────────────────────
export type CrossoverDirection = "entry" | "sell";
export interface CrossoverSignal {
  time: number;        // Unix seconds, matches Candle.time
  direction: CrossoverDirection;
  price: number;       // close price at crossover bar
}

// ─── Backtest ─────────────────────────────────────────────────────────────────
export type BacktestPeriodKey = "1M" | "6M" | "YTD" | "1Y";
export interface BacktestPeriodResult {
  strategyReturn: number; // decimal (0.14 = +14%)
  holdReturn: number;
  tradeCount: number;     // completed round-trips
  winRate: number;        // decimal (0 if tradeCount=0)
  maxDrawdown: number;    // decimal, ≤ 0 (e.g. -0.12)
}
export interface BacktestResult {
  ticker: string;
  strategyLabel: string;
  periods: Record<BacktestPeriodKey, BacktestPeriodResult>;
}
