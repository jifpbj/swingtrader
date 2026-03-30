// ─── Signal Detection Since Activation Date ─────────────────────────────────
//
// Reuses the same indicator functions as the backtest engine in indicators.ts
// to detect trade signals that would have fired since a strategy was activated.

import type { Candle } from "@/types/market";
import type { SavedStrategy } from "@/types/strategy";
import type { SignalEvent } from "@/types/paperPortfolio";
import type { CrossoverSignal } from "@/types/market";
import {
  computeEMA,
  computeRSI,
  computeMACDValues,
  detectCrossovers,
  detectRSICrossovers,
  detectMACDCrossovers,
  detectBollingerCrossovers,
  detectTDSequentialSetupSignals,
} from "@/lib/indicators";

/**
 * Given a full candle array and a saved strategy, detect all signals
 * that would have fired since `sinceMs` (Unix milliseconds).
 *
 * We include warmup bars before `sinceMs` so the indicator has enough
 * lookback to produce valid values.
 */
export function detectSignalsSince(
  allCandles: Candle[],
  strategy: SavedStrategy,
  sinceMs: number,
): SignalEvent[] {
  if (allCandles.length < 2) return [];

  const sinceSeconds = sinceMs / 1000;
  const { params, indicator } = strategy;

  // Determine warmup period (in bars) for the indicator
  const warmup = getWarmupBars(indicator, params);

  // Find the first candle at or after `sinceSeconds`
  const activationIdx = allCandles.findIndex((c) => c.time >= sinceSeconds);
  if (activationIdx === -1) return [];

  // Include warmup bars before the activation point
  const startIdx = Math.max(0, activationIdx - warmup);
  const candles = allCandles.slice(startIdx);

  // Compute raw signals using the full slice (including warmup)
  const rawSignals = computeRawSignals(candles, indicator, params);

  // Filter to only signals at or after the activation time
  const filtered = rawSignals.filter((s) => s.time >= sinceSeconds);

  // Convert to SignalEvent format
  return filtered.map((s) => ({
    strategyId: strategy.id,
    ticker: strategy.ticker,
    time: s.time,
    direction: s.direction,
    price: s.price,
    indicator: strategy.indicator,
  }));
}

function getWarmupBars(
  indicator: string,
  params: SavedStrategy["params"],
): number {
  switch (indicator) {
    case "EMA":
      return params.emaPeriod * 3;
    case "RSI":
      return params.rsiPeriod * 3;
    case "MACD":
      return (params.macdSlow + params.macdSignal) * 2;
    case "BB":
      return params.bbPeriod * 3;
    case "TD9":
      return 50; // TD Sequential needs ~40+ bars for reliable counts
    default:
      return 60;
  }
}

function computeRawSignals(
  candles: Candle[],
  indicator: string,
  params: SavedStrategy["params"],
): CrossoverSignal[] {
  const closes = candles.map((c) => c.close);

  switch (indicator) {
    case "EMA": {
      const emas = computeEMA(closes, params.emaPeriod);
      return detectCrossovers(candles, emas);
    }
    case "RSI": {
      const rsi = computeRSI(closes, params.rsiPeriod);
      return detectRSICrossovers(
        candles,
        rsi,
        params.rsiOverbought,
        params.rsiOversold,
      );
    }
    case "MACD": {
      const macd = computeMACDValues(
        closes,
        params.macdFast,
        params.macdSlow,
        params.macdSignal,
      );
      return detectMACDCrossovers(candles, macd);
    }
    case "BB": {
      return detectBollingerCrossovers(
        candles,
        params.bbPeriod,
        params.bbStdDev,
      );
    }
    case "TD9": {
      return detectTDSequentialSetupSignals(candles);
    }
    default:
      return [];
  }
}
