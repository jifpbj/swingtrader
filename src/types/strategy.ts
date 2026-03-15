// ─── Algo Trading — Strategy Types ───────────────────────────────────────────

export type TradingMode = "paper" | "live";
export type IndicatorType = "EMA" | "BB" | "RSI" | "MACD" | "TD9";

export interface IndicatorParams {
  emaPeriod: number;
  bbPeriod: number;
  bbStdDev: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
}

/** Serialization-safe backtest period result (stored in Firestore) */
export interface SerializedBacktestPeriod {
  strategyReturn: number;
  holdReturn: number;
  tradeCount: number;
  winRate: number;
  maxDrawdown: number;
  sufficientData: boolean;
}

/** Serialization-safe backtest result (stored in Firestore) */
export interface SerializedBacktestResult {
  ticker: string;
  strategyLabel: string;
  periods: Record<string, SerializedBacktestPeriod>;
  periodKeys: string[];
}

export interface OpenEntry {
  time: number;    // Unix seconds of the buy signal
  price: number;   // price at which the buy was executed
  qty: number;     // units bought
}

export interface SavedStrategy {
  id: string;                       // Firestore doc id
  name: string;                     // e.g. "BTC EMA Swing"
  ticker: string;
  timeframe: string;
  indicator: IndicatorType;
  params: IndicatorParams;
  backtestResult: SerializedBacktestResult;
  bestPeriodKey: string;
  bestStrategyReturn: number;       // decimal e.g. 0.42 = +42%
  bestHoldReturn: number;
  bestMaxDrawdown: number;          // decimal ≤ 0 e.g. -0.12
  initialInvestment: number;
  autoTrade: boolean;
  tradingMode: TradingMode;
  orderQty: number;                 // units to trade per signal (computed from lotSizeDollars)
  lotSizeMode: "dollars" | "units"; // how the user specified lot size
  lotSizeDollars: number;           // capital to deploy per trade in USD
  openEntry: OpenEntry | null;      // set on buy, cleared on sell (used for P/L tracking)
  lastExecutedSignalTime: number | null; // Unix seconds — dedup guard
  createdAt: number;                // Unix ms
  updatedAt: number;
}

/** Ephemeral result of AI Optimize — not stored directly */
export interface AlgoAnalysisResult {
  strategy: Omit<SavedStrategy, "id" | "createdAt" | "updatedAt">;
  deltaVsHold: number;              // bestStrategyReturn - bestHoldReturn
  /** Point-by-point equity curve for the best period (strategy + hold, normalised to 100) */
  equityCurve: Array<{ time: number; strategy: number; hold: number }>;
}
