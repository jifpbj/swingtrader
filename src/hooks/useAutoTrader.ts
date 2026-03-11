"use client";

import { useEffect, useRef, useCallback } from "react";
import { useStrategyStore } from "@/store/useStrategyStore";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useTradeStore } from "@/store/useTradeStore";
import { getExecutor } from "@/lib/autoTrader";
import {
  computeEMA,
  detectCrossovers,
  computeRSI,
  detectRSICrossovers,
  computeMACDValues,
  detectMACDCrossovers,
  detectBollingerCrossovers,
  detectTDSequentialSetupSignals,
} from "@/lib/indicators";
import { toBackendTf } from "@/lib/timeframeConvert";
import type { Candle, CrossoverSignal, Timeframe } from "@/types/market";
import type { SavedStrategy } from "@/types/strategy";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const POLL_INTERVAL_MS = 30_000;  // 30 seconds per strategy check
const BARS_TO_FETCH = 150;

// ─── Signal detection by indicator type ──────────────────────────────────────

function detectSignals(candles: Candle[], strategy: SavedStrategy): CrossoverSignal[] {
  const closes = candles.map((c) => c.close);
  const { params, indicator } = strategy;
  switch (indicator) {
    case "EMA": {
      const emas = computeEMA(closes, params.emaPeriod);
      return detectCrossovers(candles, emas);
    }
    case "RSI": {
      const rsi = computeRSI(closes, params.rsiPeriod);
      return detectRSICrossovers(candles, rsi, params.rsiOverbought, params.rsiOversold);
    }
    case "MACD": {
      const macd = computeMACDValues(closes, params.macdFast, params.macdSlow, params.macdSignal);
      return detectMACDCrossovers(candles, macd);
    }
    case "BB":
      return detectBollingerCrossovers(candles, params.bbPeriod, params.bbStdDev);
    case "TD9":
      return detectTDSequentialSetupSignals(candles, 9, 4);
  }
}

// ─── Fetch fresh bars for a strategy ─────────────────────────────────────────

async function fetchBars(ticker: string, timeframe: string): Promise<Candle[]> {
  const backendTf = toBackendTf(timeframe as Timeframe);
  const encoded = encodeURIComponent(ticker);
  const resp = await fetch(
    `${API_BASE}/api/v1/market/ohlcv/${encoded}?timeframe=${backendTf}&limit=${BARS_TO_FETCH}`,
  );
  if (!resp.ok) throw new Error(`Bar fetch failed: ${resp.status}`);
  const json = await resp.json() as { bars: Candle[] };
  return json.bars ?? [];
}

// ─── Fetch current price for dollar-based sizing ──────────────────────────────

async function fetchCurrentPrice(ticker: string): Promise<number | null> {
  try {
    const encoded = encodeURIComponent(ticker);
    const resp = await fetch(`${API_BASE}/api/v1/market/price/${encoded}`);
    if (!resp.ok) return null;
    const json = await resp.json() as { price?: number; last?: number };
    return json.price ?? json.last ?? null;
  } catch {
    return null;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useAutoTrader — mount once in the root page component.
 *
 * Maintains one setInterval per active auto-trade strategy.
 * Each tick:
 *   1. Fetches fresh OHLCV bars for the strategy's ticker+timeframe.
 *   2. Runs signal detection using the strategy's indicator config.
 *   3. Checks the most recent signal against lastExecutedSignalTime (dedup).
 *   4. On BUY: computes lot qty from lotSizeDollars if in dollars mode.
 *   5. Places an order via the TradeExecutor.
 *   6. On BUY success: writes openEntry to Firestore.
 *   7. On SELL success: writes TradeRecord to Firestore, clears openEntry.
 */
export function useAutoTrader() {
  const strategies     = useStrategyStore((s) => s.strategies);
  const updateStrategy = useStrategyStore((s) => s.updateStrategy);
  const user           = useAuthStore((s) => s.user);
  const apiKey         = useAlpacaStore((s) => s.apiKey);
  const secretKey      = useAlpacaStore((s) => s.secretKey);
  const account        = useAlpacaStore((s) => s.account);
  const positions      = useAlpacaStore((s) => s.positions);
  const fetchPositions = useAlpacaStore((s) => s.fetchPositions);
  const fetchOrders    = useAlpacaStore((s) => s.fetchOrders);
  const addTrade       = useTradeStore((s) => s.addTrade);

  // Track interval IDs keyed by strategy id
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  // In-session dedup set: `${strategyId}:${signalTime}`
  const firedRef = useRef<Set<string>>(new Set());

  const runCheck = useCallback(async (strategy: SavedStrategy) => {
    if (!user || !account || !apiKey || !secretKey) return;

    let bars: Candle[];
    try {
      bars = await fetchBars(strategy.ticker, strategy.timeframe);
    } catch {
      return; // Network error — skip this tick silently
    }

    if (bars.length < 10) return;

    const signals = detectSignals(bars, strategy);
    if (signals.length === 0) return;

    const latest = signals[signals.length - 1];
    const dedupKey = `${strategy.id}:${latest.time}`;

    // Already fired this signal this session
    if (firedRef.current.has(dedupKey)) return;
    // Already recorded in Firestore (survived a reload)
    if (strategy.lastExecutedSignalTime && latest.time <= strategy.lastExecutedSignalTime) return;

    // Check position state
    const normalizedTicker = strategy.ticker.replace("/", "");
    const hasPosition = positions.some(
      (p) => p.symbol.toUpperCase() === normalizedTicker.toUpperCase() && p.qty > 0,
    );

    const side =
      latest.direction === "entry" && !hasPosition ? "buy" :
      latest.direction === "sell"  && hasPosition  ? "sell" :
      null;

    if (!side) return; // Signal doesn't match position state

    // ── Compute order quantity ────────────────────────────────────────────────
    let qty = strategy.orderQty;

    if (side === "buy" && strategy.lotSizeMode === "dollars" && strategy.lotSizeDollars > 0) {
      const price = await fetchCurrentPrice(normalizedTicker);
      if (price && price > 0) {
        qty = Math.max(1, Math.floor(strategy.lotSizeDollars / price));
      }
    }

    const executor = getExecutor(strategy.tradingMode, apiKey, secretKey);
    try {
      await executor.placeOrder({
        symbol: normalizedTicker,
        qty,
        side,
        type: "market",
        time_in_force: "gtc",
      });

      firedRef.current.add(dedupKey);

      if (side === "buy") {
        // Record the open entry so we can compute P/L on the eventual sell
        const entryPrice = latest.price;
        await updateStrategy(
          strategy.id,
          {
            lastExecutedSignalTime: latest.time,
            openEntry: { time: latest.time, price: entryPrice, qty },
            orderQty: qty, // persist the computed qty
          },
          user.uid,
        );
      } else {
        // SELL — compute P/L and write trade record
        if (strategy.openEntry) {
          const { price: entryPrice, qty: entryQty, time: entryTime } = strategy.openEntry;
          const exitPrice = latest.price;
          const tradeQty = entryQty;
          const pnlDollars = (exitPrice - entryPrice) * tradeQty;
          const pnlPercent = entryPrice > 0 ? pnlDollars / (entryPrice * tradeQty) : 0;

          await addTrade(user.uid, {
            strategyId: strategy.id,
            strategyName: strategy.name,
            ticker: normalizedTicker,
            entryTime,
            exitTime: latest.time,
            entryPrice,
            exitPrice,
            qty: tradeQty,
            pnlDollars,
            pnlPercent,
            lotSizeDollars: strategy.lotSizeDollars,
            createdAt: Date.now(),
          });
        }

        await updateStrategy(
          strategy.id,
          {
            lastExecutedSignalTime: latest.time,
            openEntry: null,
          },
          user.uid,
        );
      }

      // Refresh positions and orders
      void fetchPositions();
      void fetchOrders();

      console.info(
        `[AutoTrader] ${side.toUpperCase()} ${qty} ${normalizedTicker}`,
        `via ${strategy.tradingMode} — signal@${new Date(latest.time * 1000).toISOString()}`,
      );
    } catch (err) {
      console.warn(`[AutoTrader] Order failed for ${strategy.id}:`, (err as Error).message);
    }
  }, [user, account, apiKey, secretKey, positions, updateStrategy, fetchPositions, fetchOrders, addTrade]);

  // Sync intervals when strategy list or autoTrade flags change
  useEffect(() => {
    const intervals = intervalsRef.current;
    const activeIds = new Set(strategies.filter((s) => s.autoTrade).map((s) => s.id));

    // Remove intervals for strategies that are no longer active
    for (const [id, interval] of intervals.entries()) {
      if (!activeIds.has(id)) {
        clearInterval(interval);
        intervals.delete(id);
      }
    }

    // Add intervals for newly active strategies
    for (const strategy of strategies) {
      if (!strategy.autoTrade) continue;
      if (intervals.has(strategy.id)) continue;

      // Run immediately then on interval
      void runCheck(strategy);
      const id = setInterval(() => void runCheck(strategy), POLL_INTERVAL_MS);
      intervals.set(strategy.id, id);
    }

    return () => {
      // Cleanup on unmount — not on every re-render to avoid flapping
    };
  }, [strategies, runCheck]);

  // Final cleanup on unmount
  useEffect(() => {
    return () => {
      for (const interval of intervalsRef.current.values()) {
        clearInterval(interval);
      }
      intervalsRef.current.clear();
    };
  }, []);
}
