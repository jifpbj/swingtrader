/**
 * Auto-Trading Engine — Modular TradeExecutor abstraction.
 *
 * The TradeExecutor interface decouples signal detection from order placement.
 * AlpacaTradeExecutor routes to the paper/live Alpaca Trading API (per-user keys).
 * BrokerTradeExecutor routes through the Alpaca Broker API (server-side credentials).
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

// ─── Per-user Trading API executor ───────────────────────────────────────────

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

// ─── Broker API executor (server-managed accounts) ───────────────────────────

/**
 * Routes orders through the backend Broker API proxy.
 * The backend uses its broker credentials — no per-user keys needed.
 */
class BrokerTradeExecutor implements TradeExecutor {
  readonly mode: TradingMode = "paper"; // broker sandbox acts as paper

  constructor(private readonly uid: string) {}

  async placeOrder(req: PlaceOrderRequest): Promise<AlpacaOrder> {
    const resp = await fetch(
      `${API_BASE}/api/v1/broker/accounts/${this.uid}/orders`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": this.uid,
        },
        body: JSON.stringify(req),
      },
    );
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ detail: "Order failed" }));
      throw new Error(body.detail ?? `HTTP ${resp.status}`);
    }
    return resp.json() as Promise<AlpacaOrder>;
  }
}

// ─── Factories ────────────────────────────────────────────────────────────────

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

/**
 * Returns a BrokerTradeExecutor that routes orders through the Broker API.
 * Use this when the user has an active Alpaca broker account.
 */
export function getBrokerExecutor(uid: string): TradeExecutor {
  return new BrokerTradeExecutor(uid);
}
