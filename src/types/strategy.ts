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
  trailingStopEnabled: boolean;  // whether trailing stop is active
  trailingStopPercent: number;   // e.g. 5 = 5% trailing stop
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
  highWaterMark: number; // highest price since entry, used for trailing stop
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
  trailingStopEnabled: boolean;     // whether trailing stop loss is active
  trailingStopPercent: number;      // e.g. 5 = sell if price drops 5% from high water mark
  openEntry: OpenEntry | null;      // set on buy, cleared on sell (used for P/L tracking)
  lastExecutedSignalTime: number | null; // Unix seconds — dedup guard
  activatedAt: number;              // Unix ms — when signal tracking starts
  createdAt: number;                // Unix ms
  updatedAt: number;
}

/** Ephemeral result of AI Optimize — not stored directly */
export interface AlgoAnalysisResult {
  /** "active" = a tradeable strategy was found; "hold" = no alpha but trend is positive; "avoid" = trend is negative */
  recommendation: "active" | "hold" | "avoid";
  /** Overall buy-and-hold return for this ticker over the analysed period */
  holdReturn: number;
  /** Present only when recommendation === "active" */
  strategy?: Omit<SavedStrategy, "id" | "createdAt" | "updatedAt">;
  deltaVsHold: number;              // bestStrategyReturn - bestHoldReturn
  /** Point-by-point equity curve for the best period (strategy + hold, normalised to 100) */
  equityCurve: Array<{ time: number; strategy: number; hold: number }>;
  /** Present when recommendation is "hold" or "avoid" — other timeframes where active alpha was found */
  alternativeTimeframes?: Array<{
    timeframe: string;
    recommendation: "active";
    strategy: Omit<SavedStrategy, "id" | "createdAt" | "updatedAt">;
    deltaVsHold: number;
    holdReturn: number;
  }>;
}
