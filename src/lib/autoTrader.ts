/**
 * Auto-Trading Engine — Modular TradeExecutor abstraction.
 *
 * The TradeExecutor interface decouples signal detection from order placement.
 * PaperTradeExecutor routes to the paper Alpaca API.
 * LiveTradeExecutor routes to the live Alpaca API.
 * Swapping modes is a single factory call — no other code changes needed.
 */

import type { PlaceOrderRequest, AlpacaOrder } from "@/types/market";
import type { TradingMode } from "@/types/strategy";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const ALPACA_URLS: Record<TradingMode, string> = {
  paper: "https://paper-api.alpaca.markets",
  live:  "https://api.alpaca.markets",
};

// ─── Interface ────────────────────────────────────────────────────────────────

export interface TradeExecutor {
  mode: TradingMode;
  placeOrder(req: PlaceOrderRequest): Promise<AlpacaOrder>;
}

// ─── Base implementation ──────────────────────────────────────────────────────

class AlpacaTradeExecutor implements TradeExecutor {
  constructor(
    public readonly mode: TradingMode,
    private readonly apiKey: string,
    private readonly secretKey: string,
  ) {}

  async placeOrder(req: PlaceOrderRequest): Promise<AlpacaOrder> {
    const resp = await fetch(`${API_BASE}/api/v1/trading/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Alpaca-Key": this.apiKey,
        "X-Alpaca-Secret": this.secretKey,
        "X-Alpaca-Base-Url": ALPACA_URLS[this.mode],
      },
      body: JSON.stringify(req),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ detail: "Order failed" }));
      throw new Error(body.detail ?? `HTTP ${resp.status}`);
    }
    return resp.json() as Promise<AlpacaOrder>;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Returns a TradeExecutor for the given mode and credentials.
 * Both paper and live use the same backend proxy — only the base URL differs.
 */
export function getExecutor(
  mode: TradingMode,
  apiKey: string,
  secretKey: string,
): TradeExecutor {
  return new AlpacaTradeExecutor(mode, apiKey, secretKey);
}
