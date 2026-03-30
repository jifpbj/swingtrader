"use client";

import { useEffect, useRef } from "react";
import type { Candle } from "@/types/market";
import type { SavedStrategy } from "@/types/strategy";
import { useVirtualPortfolioStore } from "@/store/useVirtualPortfolioStore";
import { detectSignalsSince } from "@/lib/signalDetector";
import { generateMockCandles } from "@/hooks/useMockData";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Map UI timeframe to backend query format */
function toBackendTf(tf: string): string {
  const map: Record<string, string> = {
    "1m": "1Min", "5m": "5Min", "15m": "15Min",
    "1h": "1Hour", "4h": "4Hour", "1d": "1Day",
  };
  return map[tf] ?? "1Day";
}

/** Seed hash for mock data (matches useBacktestData) */
function tickerToSeed(t: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * For each saved strategy with an `activatedAt` timestamp, fetch historical
 * candles and detect signals that would have fired since activation.
 * Backfills trades into the virtual portfolio store.
 *
 * Runs once per strategy on mount, then re-checks every 5 minutes.
 */
export function useSignalBackfill(strategies: SavedStrategy[]) {
  const backfillSignals = useVirtualPortfolioStore((s) => s.backfillSignals);
  const processedRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!strategies.length) return;

    async function processStrategy(strategy: SavedStrategy) {
      const since = strategy.activatedAt;
      if (!since) return;

      // Skip if already processed in this session
      const key = `${strategy.id}-${since}`;
      if (processedRef.current.has(key)) return;
      processedRef.current.add(key);

      try {
        const candles = await fetchCandles(strategy);
        if (candles.length < 10) return;

        const signals = detectSignalsSince(candles, strategy, since);
        if (signals.length === 0) return;

        backfillSignals(
          strategy.id,
          strategy.name,
          strategy.lotSizeDollars,
          signals,
        );
      } catch {
        // Silently fail — will retry on next interval
        processedRef.current.delete(key);
      }
    }

    // Process all strategies
    for (const s of strategies) {
      void processStrategy(s);
    }

    // Re-check every 5 minutes for new signals
    intervalRef.current = setInterval(() => {
      // Clear processed so we re-check
      processedRef.current.clear();
      for (const s of strategies) {
        void processStrategy(s);
      }
    }, 5 * 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [strategies, backfillSignals]);
}

async function fetchCandles(strategy: SavedStrategy): Promise<Candle[]> {
  const { ticker, timeframe } = strategy;
  const barSecs = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 }[timeframe] ?? 86400;

  // Calculate how many bars we need since activatedAt
  const sinceMs = strategy.activatedAt;
  const elapsedSecs = (Date.now() - sinceMs) / 1000;
  const barsNeeded = Math.ceil(elapsedSecs / barSecs) + 100; // +100 for warmup

  try {
    const resp = await fetch(
      `${API_URL}/api/v1/market/backtest-history/${encodeURIComponent(ticker)}` +
      `?timeframe=${toBackendTf(timeframe)}&bars=${barsNeeded}`,
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json() as { bars: Candle[] };
    if (json.bars?.length >= 10) return json.bars;
  } catch {
    // Fall through to mock
  }

  // Fallback to mock data
  return generateMockCandles(barSecs, Math.min(barsNeeded, 2000), tickerToSeed(ticker));
}
