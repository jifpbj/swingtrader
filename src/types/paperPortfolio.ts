// ─── Virtual Paper Trading Types ─────────────────────────────────────────────

export interface VirtualAccount {
  equity: number;
  cash: number;
  buyingPower: number;
  createdAt: number; // Unix ms
}

export interface VirtualPosition {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  strategyId: string;
  entryTime: number; // Unix ms
}

export interface VirtualTrade {
  id: string;
  strategyId: string;
  strategyName: string;
  ticker: string;
  direction: "buy" | "sell";
  entryPrice: number;
  exitPrice: number;
  qty: number;
  pnlDollars: number;
  pnlPercent: number;
  entryTime: number; // Unix ms
  exitTime: number;  // Unix ms
  exitReason?: "signal" | "trailing_stop";
}

export interface TrialInfo {
  visitorId: string;
  startedAt: number;  // Unix ms
  expiresAt: number;  // Unix ms
}

export interface SignalEvent {
  strategyId: string;
  ticker: string;
  time: number;            // Unix seconds (matches Candle.time)
  direction: "entry" | "sell";
  price: number;
  indicator: string;
}

export interface EquitySnapshot {
  time: number;  // Unix ms
  equity: number;
}
