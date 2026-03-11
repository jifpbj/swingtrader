// ─── Trade Record — persisted to Firestore for each completed round-trip ──────

export interface TradeRecord {
  id: string;              // Firestore doc id
  strategyId: string;      // link back to SavedStrategy
  strategyName: string;    // denormalized for display
  ticker: string;
  entryTime: number;       // Unix seconds
  exitTime: number;        // Unix seconds
  entryPrice: number;
  exitPrice: number;
  qty: number;             // shares/units traded
  pnlDollars: number;      // (exitPrice - entryPrice) * qty
  pnlPercent: number;      // pnlDollars / (entryPrice * qty)
  lotSizeDollars: number;  // capital deployed (for context)
  createdAt: number;       // Unix ms — for sorting
}

/** Firestore path: users/{uid}/trades/{tradeId} */
