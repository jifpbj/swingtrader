/**
 * Strategy Optimizer — sweeps indicator parameter ranges and finds the
 * best-performing backtest for the given ticker + timeframe.
 *
 * Uses existing computeStrategyBacktests() so no new math is introduced.
 * Returns an AlgoAnalysisResult with the winning config.
 */

import { computeStrategyBacktests, type BacktestStrategy } from "@/lib/indicators";
import type { Candle, BacktestPeriodResult } from "@/types/market";
import type { AlgoAnalysisResult, IndicatorType, IndicatorParams, SavedStrategy, TradingMode } from "@/types/strategy";

// ─── Parameter sweep ranges ───────────────────────────────────────────────────

const EMA_PERIODS   = [9, 12, 20, 50, 100];
const BB_PERIODS    = [10, 20, 30];
const BB_STD_DEVS   = [1.5, 2.0, 2.5];
const RSI_PERIODS   = [9, 14, 21];
const RSI_OB_LEVELS = [65, 70, 75];
const RSI_OS_LEVELS = [25, 30, 35];
const MACD_COMBOS   = [
  { fast: 8,  slow: 17, signal: 9 },
  { fast: 12, slow: 26, signal: 9 },
  { fast: 5,  slow: 13, signal: 6 },
];

// ─── Trailing stop sweep values (phase 2) ──────────────────────────────────
const TRAILING_STOP_PCTS = [0, 2, 3, 5, 8, 10]; // 0 = disabled

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Score a period result: reward return, penalise drawdown.
 * Returns -Infinity for insufficient data.
 */
function score(p: BacktestPeriodResult): number {
  if (!p.sufficientData) return -Infinity;
  return p.strategyReturn - Math.abs(p.maxDrawdown) * 0.5;
}

/**
 * Extract the best period result from a backtest (longest key with data).
 */
function bestPeriod(
  periods: Partial<Record<string, BacktestPeriodResult>>,
  keys: string[],
): { key: string; result: BacktestPeriodResult } | null {
  for (let i = keys.length - 1; i >= 0; i--) {
    const r = periods[keys[i]];
    if (r?.sufficientData) return { key: keys[i], result: r };
  }
  return null;
}

// ─── Candidate type ───────────────────────────────────────────────────────────

interface Candidate {
  indicator: IndicatorType;
  params: IndicatorParams;
  strategyLabel: string;
  score: number;
  bestPeriodKey: string;
  bestStrategyReturn: number;
  bestHoldReturn: number;
  bestMaxDrawdown: number;
  backtestResult: {
    ticker: string;
    strategyLabel: string;
    periods: Record<string, BacktestPeriodResult>;
    periodKeys: string[];
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run AI Optimize for the given bars.
 * Sweeps EMA, BB, RSI, MACD parameter combos and returns the best AlgoAnalysisResult.
 *
 * @param ticker     - e.g. "BTC/USD"
 * @param timeframe  - e.g. "1h"
 * @param candles    - Historical OHLCV data (ideally 1Y+)
 * @param currentParams - Current store params (used as defaults for unswept indicators)
 * @param initialInvestment - Starting capital for dollar-value stats
 * @param tradingMode - "paper" | "live" for the saved strategy
 */
/** Compute the simple buy-and-hold return from the first to last candle close. */
function computeHoldReturn(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const first = candles[0].close;
  const last  = candles[candles.length - 1].close;
  return first > 0 ? (last - first) / first : 0;
}

export function runAIOptimize(
  ticker: string,
  timeframe: string,
  candles: Candle[],
  currentParams: IndicatorParams,
  initialInvestment: number = 100_000,
  tradingMode: TradingMode = "paper",
): AlgoAnalysisResult {
  const holdReturn = computeHoldReturn(candles);

  if (candles.length < 50) {
    return {
      recommendation: holdReturn >= 0 ? "hold" : "avoid",
      holdReturn,
      deltaVsHold: 0,
      equityCurve: [],
    };
  }

  const candidates: Candidate[] = [];

  // Helper: evaluate one combo
  function evaluate(
    indicator: IndicatorType,
    params: IndicatorParams,
  ) {
    const strategy = indicator as BacktestStrategy;
    const result = computeStrategyBacktests(candles, strategy, ticker, params, timeframe);
    const best = bestPeriod(result.periods, result.periodKeys);
    if (!best) return;

    const s = score(best.result);
    candidates.push({
      indicator,
      params,
      strategyLabel: result.strategyLabel,
      score: s,
      bestPeriodKey: best.key,
      bestStrategyReturn: best.result.strategyReturn,
      bestHoldReturn: best.result.holdReturn,
      bestMaxDrawdown: best.result.maxDrawdown,
      backtestResult: {
        ticker: result.ticker,
        strategyLabel: result.strategyLabel,
        periods: result.periods as Record<string, BacktestPeriodResult>,
        periodKeys: result.periodKeys,
      },
    });
  }

  // Phase 1: sweep indicator params WITHOUT trailing stop
  const baseParams = { ...currentParams, trailingStopEnabled: false, trailingStopPercent: 0 };

  // ─── EMA sweep ────────────────────────────────────────────────────────────
  for (const emaPeriod of EMA_PERIODS) {
    evaluate("EMA", { ...baseParams, emaPeriod });
  }

  // ─── BB sweep ─────────────────────────────────────────────────────────────
  for (const bbPeriod of BB_PERIODS) {
    for (const bbStdDev of BB_STD_DEVS) {
      evaluate("BB", { ...baseParams, bbPeriod, bbStdDev });
    }
  }

  // ─── RSI sweep ────────────────────────────────────────────────────────────
  for (const rsiPeriod of RSI_PERIODS) {
    for (const rsiOverbought of RSI_OB_LEVELS) {
      for (const rsiOversold of RSI_OS_LEVELS) {
        if (rsiOversold >= rsiOverbought) continue;
        evaluate("RSI", { ...baseParams, rsiPeriod, rsiOverbought, rsiOversold });
      }
    }
  }

  // ─── MACD sweep ───────────────────────────────────────────────────────────
  for (const { fast, slow, signal } of MACD_COMBOS) {
    evaluate("MACD", { ...baseParams, macdFast: fast, macdSlow: slow, macdSignal: signal });
  }

  if (candidates.length === 0) {
    return {
      recommendation: holdReturn >= 0 ? "hold" : "avoid",
      holdReturn,
      deltaVsHold: 0,
      equityCurve: [],
    };
  }

  // ─── Phase 2: trailing stop sweep on top candidates ──────────────────────
  // Take top 5 candidates from Phase 1 and re-evaluate each with different
  // trailing stop percentages to find the optimal risk management setting.
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const topN = sorted.slice(0, 5);

  for (const candidate of topN) {
    for (const tsPct of TRAILING_STOP_PCTS) {
      if (tsPct === 0) continue; // already evaluated without stop
      const tsParams: IndicatorParams = {
        ...candidate.params,
        trailingStopEnabled: true,
        trailingStopPercent: tsPct,
      };
      evaluate(candidate.indicator, tsParams);
    }
  }

  // Pick the best candidate (including trailing stop variants)
  const winner = candidates.reduce((a, b) => (b.score > a.score ? b : a));

  // Build the display label for the winning indicator
  const indicatorDisplayLabel = buildIndicatorLabel(winner.indicator, winner.params);

  const strategyData: Omit<SavedStrategy, "id" | "createdAt" | "updatedAt"> = {
    name: `${indicatorDisplayLabel} · ${ticker} · ${timeframe.toUpperCase()}`,
    ticker,
    timeframe,
    indicator: winner.indicator,
    params: winner.params,
    backtestResult: winner.backtestResult,
    bestPeriodKey: winner.bestPeriodKey,
    bestStrategyReturn: winner.bestStrategyReturn,
    bestHoldReturn: winner.bestHoldReturn,
    bestMaxDrawdown: winner.bestMaxDrawdown,
    initialInvestment,
    autoTrade: false,
    tradingMode,
    trailingStopEnabled: winner.params.trailingStopEnabled ?? false,
    trailingStopPercent: winner.params.trailingStopPercent ?? 5,
    orderQty: 1,
    lotSizeMode: "dollars" as const,
    lotSizeDollars: 1_000,
    openEntry: null,
    lastExecutedSignalTime: null,
    activatedAt: Date.now(),
  };

  const deltaVsHold = winner.bestStrategyReturn - winner.bestHoldReturn;
  // Only recommend active trading if the strategy meaningfully beats hold (>= 0 delta)
  const recommendation =
    deltaVsHold >= 0
      ? "active"
      : winner.bestHoldReturn >= 0
        ? "hold"
        : "avoid";

  return {
    recommendation,
    holdReturn,
    strategy: recommendation === "active" ? strategyData : undefined,
    deltaVsHold,
    equityCurve: [],   // populated by BacktestPanel after runAIOptimize returns
  };
}

function buildIndicatorLabel(indicator: IndicatorType, params: IndicatorParams): string {
  switch (indicator) {
    case "EMA":  return `EMA(${params.emaPeriod})`;
    case "BB":   return `BB(${params.bbPeriod}, ${params.bbStdDev})`;
    case "RSI":  return `RSI(${params.rsiPeriod})`;
    case "MACD": return `MACD(${params.macdFast},${params.macdSlow},${params.macdSignal})`;
    case "TD9":  return "TD Sequential 9";
  }
}
