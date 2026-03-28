"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useUIStore } from "@/store/useUIStore";
import { useStrategyStore } from "@/store/useStrategyStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { computeStrategyBacktests, computeStrategyEquityCurve } from "@/lib/indicators";
import type { EquityCurvePoint } from "@/lib/indicators";
import { runAIOptimize } from "@/lib/strategyOptimizer";
import type { Candle, BacktestResult, BacktestPeriodKey, Timeframe } from "@/types/market";
import type { AlgoAnalysisResult } from "@/types/strategy";
import { toBackendTf, TIMEFRAME_SECONDS } from "@/lib/timeframeConvert";
import { generateMockCandles } from "@/hooks/useMockData";

// ─── Period keys by timeframe ─────────────────────────────────────────────────
// Short timeframes (1m / 5m / 15m) use calendar windows.
// Long timeframes (1h / 4h / 1d) use trading-day windows.
const SHORT_TIMEFRAMES = new Set<string>(["1m", "5m", "15m"]);

// Long periods always use daily bars regardless of the active chart timeframe,
// so bar counts stay manageable and indicators have enough history.
const FORCE_DAILY_PERIODS = new Set<BacktestPeriodKey>(["6M", "YTD", "1Y", "5Y"]);

function periodKeysForTimeframe(tf: string): BacktestPeriodKey[] {
  return SHORT_TIMEFRAMES.has(tf)
    ? ["4H", "1D", "5D", "1W", "1M"]
    : ["1M", "6M", "YTD", "1Y", "5Y"];
}

// Calendar seconds per short-TF period (mirrors indicators.ts SHORT_TF_SECONDS)
const SHORT_TF_PERIOD_SECS: Record<string, number> = {
  "4H": 14_400, "1D": 86_400, "5D": 432_000, "1W": 604_800, "1M": 2_592_000,
};
// Trading days per long-TF period
const LONG_TF_PERIOD_DAYS: Record<string, number> = {
  "1M": 21, "6M": 126, "YTD": 180, "1Y": 252, "5Y": 1260,
};
const BARS_PER_TRADING_DAY: Record<string, number> = {
  "1h": 6.5, "4h": 1.625, "1d": 1,
};

/** Mock bar count for demo mode — enough to cover the period + indicator warmup. */
function mockBarCount(tf: string, period: BacktestPeriodKey): number {
  const WARMUP = 60;
  const BUFFER = 1.5;
  const barSecs = TIMEFRAME_SECONDS[tf as Timeframe] ?? 900;
  let raw: number;
  if (SHORT_TIMEFRAMES.has(tf)) {
    raw = (SHORT_TF_PERIOD_SECS[period] ?? 86_400) / barSecs;
  } else {
    const days = LONG_TF_PERIOD_DAYS[period] ?? 252;
    raw = days * (BARS_PER_TRADING_DAY[tf] ?? 1) * BUFFER;
  }
  return Math.min(Math.ceil(raw * BUFFER) + WARMUP, 10_000);
}

export { periodKeysForTimeframe };

export function useBacktestData() {
  // ─── UI Store: indicator params ──────────────────────────────────────────────
  const ticker               = useUIStore((s) => s.ticker);
  const timeframe            = useUIStore((s) => s.timeframe);
  const emaPeriod            = useUIStore((s) => s.emaPeriod);
  const activeIndicatorTab   = useUIStore((s) => s.activeIndicatorTab);
  const rsiPeriod            = useUIStore((s) => s.rsiPeriod);
  const rsiOverbought        = useUIStore((s) => s.rsiOverbought);
  const rsiOversold          = useUIStore((s) => s.rsiOversold);
  const bbPeriod             = useUIStore((s) => s.bbPeriod);
  const bbStdDev             = useUIStore((s) => s.bbStdDev);
  const macdFastPeriod       = useUIStore((s) => s.macdFastPeriod);
  const macdSlowPeriod       = useUIStore((s) => s.macdSlowPeriod);
  const macdSignalPeriod     = useUIStore((s) => s.macdSignalPeriod);
  const trailingStopEnabled  = useUIStore((s) => s.trailingStopEnabled);
  const trailingStopPercent  = useUIStore((s) => s.trailingStopPercent);
  const demoMode             = useUIStore((s) => s.demoMode);
  const performancePeriod    = useUIStore((s) => s.performancePeriod);

  // ─── UI Store: setter functions (used by AI optimize to apply params) ────────
  const setActiveIndicatorTab  = useUIStore((s) => s.setActiveIndicatorTab);
  const setEmaPeriod           = useUIStore((s) => s.setEmaPeriod);
  const setBbPeriod            = useUIStore((s) => s.setBbPeriod);
  const setBbStdDev            = useUIStore((s) => s.setBbStdDev);
  const setRsiPeriod           = useUIStore((s) => s.setRsiPeriod);
  const setRsiOverbought       = useUIStore((s) => s.setRsiOverbought);
  const setRsiOversold         = useUIStore((s) => s.setRsiOversold);
  const setMacdFastPeriod      = useUIStore((s) => s.setMacdFastPeriod);
  const setMacdSlowPeriod      = useUIStore((s) => s.setMacdSlowPeriod);
  const setMacdSignalPeriod    = useUIStore((s) => s.setMacdSignalPeriod);
  const setTrailingStopEnabled = useUIStore((s) => s.setTrailingStopEnabled);
  const setTrailingStopPercent = useUIStore((s) => s.setTrailingStopPercent);

  // ─── Strategy Store ──────────────────────────────────────────────────────────
  const {
    saveStrategy, setActiveStrategy,
    analysisResult, setAnalysisResult,
    analyzing, setAnalyzing,
    analysisRequested, clearAnalysisRequest,
  } = useStrategyStore();

  // ─── Alpaca + Auth ───────────────────────────────────────────────────────────
  const tradingMode = useAlpacaStore((s) => s.tradingMode);
  const user        = useAuthStore((s) => s.user);

  // ─── Local state ─────────────────────────────────────────────────────────────
  const [candles, setCandles]                       = useState<Candle[]>([]);
  const [result, setResult]                         = useState<BacktestResult | null>(null);
  const [viewMode, setViewMode]                     = useState<"pct" | "val">("pct");
  const [initialInvestment, setInitialInvestment]   = useState<number>(100_000);
  const [showModal, setShowModal]                   = useState(false);
  const [manualSaving, setManualSaving]             = useState(false);
  const [backtestLoading, setBacktestLoading]       = useState(false);
  const [hasAnalyzedOnce, setHasAnalyzedOnce]       = useState(false);

  // Reset when ticker changes (page refresh resets naturally via useState)
  useEffect(() => {
    setHasAnalyzedOnce(false);
    setAnalysisResult(null);
  }, [ticker]);

  // ─── Period selection ────────────────────────────────────────────────────────
  const periodKeys = useMemo(() => periodKeysForTimeframe(timeframe), [timeframe]);
  const defaultPeriod = periodKeys[periodKeys.length - 1];
  const [selectedPeriod, setSelectedPeriod] = useState<BacktestPeriodKey | null>(null);

  // Reset period when timeframe changes (new period list)
  useEffect(() => { setSelectedPeriod(null); }, [timeframe]);

  // performancePeriod from the store takes priority, then local selectedPeriod, then default
  const chartPeriod: BacktestPeriodKey = performancePeriod ?? selectedPeriod ?? defaultPeriod;

  // Long periods (6M, YTD, 1Y, 5Y) always use daily bars for manageable bar counts.
  // This is derived at hook level so both the fetch and backtest effects use the same value.
  const fetchTimeframe = useMemo<Timeframe>(
    () => FORCE_DAILY_PERIODS.has(chartPeriod) ? "1d" : timeframe as Timeframe,
    [chartPeriod, timeframe],
  );

  // ─── Fetch historical bars sized for the selected period ─────────────────────
  useEffect(() => {
    const barSecs = TIMEFRAME_SECONDS[fetchTimeframe] ?? 86_400;

    function tickerToSeed(t: string): number {
      let h = 0x811c9dc5;
      for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return h;
    }

    if (demoMode) {
      const count = mockBarCount(fetchTimeframe, chartPeriod);
      setCandles(generateMockCandles(barSecs, count, tickerToSeed(ticker)));
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const ctrl = new AbortController();
    setBacktestLoading(true);
    setCandles([]);   // clear stale candles immediately so chart doesn't show old data

    fetch(
      `${apiUrl}/api/v1/market/backtest-history/${encodeURIComponent(ticker)}` +
      `?timeframe=${toBackendTf(fetchTimeframe)}&period=${chartPeriod}`,
      { signal: ctrl.signal },
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ bars: Candle[] }>;
      })
      .then((json) => {
        const bars = json.bars ?? [];
        if (bars.length >= 10) {
          setCandles(bars);
        } else {
          // Fewer bars than expected — fall back to mock so the chart still works
          const count = mockBarCount(fetchTimeframe, chartPeriod);
          setCandles(generateMockCandles(barSecs, count, tickerToSeed(ticker)));
        }
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        const count = mockBarCount(fetchTimeframe, chartPeriod);
        setCandles(generateMockCandles(barSecs, count, tickerToSeed(ticker)));
      })
      .finally(() => setBacktestLoading(false));

    return () => ctrl.abort();
  }, [demoMode, ticker, fetchTimeframe, chartPeriod]);

  // ─── Recompute backtest on indicator/candle changes ──────────────────────────
  useEffect(() => {
    if (!candles.length) return;
    setResult(
      computeStrategyBacktests(
        candles,
        (activeIndicatorTab === "TD9" ? "TD9" : activeIndicatorTab) as
          | "EMA" | "BB" | "RSI" | "MACD" | "TD9",
        ticker,
        {
          emaPeriod,
          bbPeriod,
          bbStdDev,
          rsiPeriod,
          rsiOverbought,
          rsiOversold,
          macdFast: macdFastPeriod,
          macdSlow: macdSlowPeriod,
          macdSignal: macdSignalPeriod,
          trailingStopEnabled,
          trailingStopPercent,
        },
        fetchTimeframe,
      ),
    );
  }, [
    candles, ticker, activeIndicatorTab, fetchTimeframe,
    emaPeriod, bbPeriod, bbStdDev,
    rsiPeriod, rsiOverbought, rsiOversold,
    macdFastPeriod, macdSlowPeriod, macdSignalPeriod,
    trailingStopEnabled, trailingStopPercent,
  ]);

  // ─── AI Analyze ──────────────────────────────────────────────────────────────
  const MIN_ANIM_MS = 2500; // minimum time the animation plays before the modal appears

  const handleAIAnalyze = useCallback(async () => {
    if (!candles.length || analyzing) return;
    setAnalyzing(true);
    setHasAnalyzedOnce(true);
    const startMs = Date.now();
    // Yield two animation frames so the overlay actually renders before synchronous work starts
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    try {
      const currentParams = {
        emaPeriod,
        bbPeriod,
        bbStdDev,
        rsiPeriod,
        rsiOverbought,
        rsiOversold,
        macdFast: macdFastPeriod,
        macdSlow: macdSlowPeriod,
        macdSignal: macdSignalPeriod,
        trailingStopEnabled,
        trailingStopPercent,
      };
      const optimResult = runAIOptimize(
        ticker,
        timeframe,
        candles,
        currentParams,
        initialInvestment,
        tradingMode,
      );

      // Always show the modal — even for hold/avoid recommendations
      let curve: ReturnType<typeof computeStrategyEquityCurve> = [];
      if (optimResult.recommendation === "active" && optimResult.strategy) {
        // Compute equity curve for the best period
        curve = computeStrategyEquityCurve(
          candles,
          optimResult.strategy.indicator as "EMA" | "BB" | "RSI" | "MACD" | "TD9",
          optimResult.strategy.params,
          timeframe,
          optimResult.strategy.bestPeriodKey as BacktestPeriodKey,
        );

        // Apply the optimised indicator + params immediately
        const { indicator, params } = optimResult.strategy;
        setActiveIndicatorTab(indicator);
        setEmaPeriod(params.emaPeriod);
        setBbPeriod(params.bbPeriod);
        setBbStdDev(params.bbStdDev);
        setRsiPeriod(params.rsiPeriod);
        setRsiOverbought(params.rsiOverbought);
        setRsiOversold(params.rsiOversold);
        setMacdFastPeriod(params.macdFast);
        setMacdSlowPeriod(params.macdSlow);
        setMacdSignalPeriod(params.macdSignal);
        setTrailingStopEnabled(params.trailingStopEnabled ?? false);
        setTrailingStopPercent(params.trailingStopPercent ?? 5);

        setAnalysisResult({ ...optimResult, equityCurve: curve });
      } else {
        // No alpha in current TF — scan all other timeframes for alpha
        const ALL_TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
        const otherTFs = ALL_TIMEFRAMES.filter((tf) => tf !== timeframe);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

        const altCandlesResults = await Promise.all(
          otherTFs.map(async (tf) => {
            const period = periodKeysForTimeframe(tf).at(-1)!;
            if (demoMode) {
              const count = mockBarCount(tf, period as BacktestPeriodKey);
              const tfBarSecs = TIMEFRAME_SECONDS[tf as Timeframe] ?? 900;
              return { tf, bars: generateMockCandles(tfBarSecs, count, 0) };
            }
            try {
              const res = await fetch(
                `${apiUrl}/api/v1/market/backtest-history/${encodeURIComponent(ticker)}` +
                `?timeframe=${toBackendTf(tf)}&period=${period}`,
              );
              if (!res.ok) return { tf, bars: [] as Candle[] };
              const json = await res.json() as { bars: Candle[] };
              return { tf, bars: json.bars ?? [] };
            } catch {
              return { tf, bars: [] as Candle[] };
            }
          }),
        );

        // Run optimizer on each alternative TF (yield to event loop between each)
        const alternatives: NonNullable<AlgoAnalysisResult["alternativeTimeframes"]> = [];
        for (const { tf, bars } of altCandlesResults) {
          if (bars.length < 10) continue;
          await new Promise<void>((r) => setTimeout(r, 0));
          const altResult = runAIOptimize(ticker, tf, bars, currentParams, initialInvestment, tradingMode);
          if (altResult.recommendation === "active" && altResult.strategy) {
            alternatives.push({
              timeframe: tf,
              recommendation: "active",
              strategy: altResult.strategy,
              deltaVsHold: altResult.deltaVsHold,
              holdReturn: altResult.holdReturn,
            });
          }
        }

        // Sort by delta vs hold descending — best opportunities first
        alternatives.sort((a, b) => b.deltaVsHold - a.deltaVsHold);

        setAnalysisResult({
          ...optimResult,
          equityCurve: [],
          alternativeTimeframes: alternatives.length > 0 ? alternatives : undefined,
        });
      }

      // Wait until the minimum animation duration has elapsed, then reveal the modal
      const elapsed = Date.now() - startMs;
      if (elapsed < MIN_ANIM_MS) {
        await new Promise<void>(r => setTimeout(r, MIN_ANIM_MS - elapsed));
      }
      setAnalyzing(false);
      // Small gap so the animation fade-out is visible before the modal enters
      await new Promise<void>(r => setTimeout(r, 80));
      setShowModal(true);
    } catch {
      setAnalyzing(false);
    }
  }, [
    candles, ticker, timeframe, analyzing, initialInvestment, tradingMode, demoMode,
    emaPeriod, bbPeriod, bbStdDev, rsiPeriod, rsiOverbought, rsiOversold,
    macdFastPeriod, macdSlowPeriod, macdSignalPeriod,
    trailingStopEnabled, trailingStopPercent,
    setAnalyzing, setAnalysisResult,
    setActiveIndicatorTab, setEmaPeriod, setBbPeriod, setBbStdDev,
    setRsiPeriod, setRsiOverbought, setRsiOversold,
    setMacdFastPeriod, setMacdSlowPeriod, setMacdSignalPeriod,
    setTrailingStopEnabled, setTrailingStopPercent,
  ]);

  // ─── Respond to external analysis requests (e.g. from TradeStrategyWidget) ──
  useEffect(() => {
    if (analysisRequested && !analyzing && candles.length) {
      clearAnalysisRequest();
      void handleAIAnalyze();
    }
  }, [analysisRequested, analyzing, candles.length, clearAnalysisRequest, handleAIAnalyze]);

  // ─── Manual "Trade this Strategy" (current indicator config) ─────────────────
  const handleManualTrade = useCallback(async () => {
    if (!result || !user) return;
    setManualSaving(true);
    try {
      const lastKey = result.periodKeys[result.periodKeys.length - 1];
      const lastPeriod = result.periods[lastKey];
      const now = Date.now();
      const id = await saveStrategy(
        {
          name: `${result.strategyLabel} · ${ticker} · ${timeframe.toUpperCase()}`,
          ticker,
          timeframe,
          indicator: activeIndicatorTab === "TD9" ? "TD9" : activeIndicatorTab as "EMA" | "BB" | "RSI" | "MACD",
          params: {
            emaPeriod, bbPeriod, bbStdDev, rsiPeriod, rsiOverbought, rsiOversold,
            macdFast: macdFastPeriod, macdSlow: macdSlowPeriod, macdSignal: macdSignalPeriod,
            trailingStopEnabled, trailingStopPercent,
          },
          trailingStopEnabled,
          trailingStopPercent,
          backtestResult: {
            ticker: result.ticker,
            strategyLabel: result.strategyLabel,
            periods: result.periods as Record<string, typeof lastPeriod & {}>,
            periodKeys: result.periodKeys,
          },
          bestPeriodKey: lastKey ?? "",
          bestStrategyReturn: lastPeriod?.strategyReturn ?? 0,
          bestHoldReturn: lastPeriod?.holdReturn ?? 0,
          bestMaxDrawdown: lastPeriod?.maxDrawdown ?? 0,
          initialInvestment,
          autoTrade: false,
          tradingMode,
          orderQty: 1,
          lotSizeMode: "dollars" as const,
          lotSizeDollars: 1_000,
          openEntry: null,
          lastExecutedSignalTime: null,
          createdAt: now,
          updatedAt: now,
        },
        user.uid,
      );
      setActiveStrategy(id);
    } finally {
      setManualSaving(false);
    }
  }, [
    result, user, ticker, timeframe, activeIndicatorTab, initialInvestment, tradingMode,
    emaPeriod, bbPeriod, bbStdDev, rsiPeriod, rsiOverbought, rsiOversold,
    macdFastPeriod, macdSlowPeriod, macdSignalPeriod,
    trailingStopEnabled, trailingStopPercent,
    saveStrategy, setActiveStrategy,
  ]);

  // ─── Equity curve ────────────────────────────────────────────────────────────
  const equityCurve = useMemo<EquityCurvePoint[]>(() => {
    if (!candles.length || !result) return [];
    const p = result.periods[chartPeriod];
    if (!p?.sufficientData) return [];
    return computeStrategyEquityCurve(
      candles,
      (activeIndicatorTab === "TD9" ? "TD9" : activeIndicatorTab) as
        "EMA" | "BB" | "RSI" | "MACD" | "TD9",
      {
        emaPeriod,
        bbPeriod,
        bbStdDev,
        rsiPeriod,
        rsiOverbought,
        rsiOversold,
        macdFast: macdFastPeriod,
        macdSlow: macdSlowPeriod,
        macdSignal: macdSignalPeriod,
        trailingStopEnabled,
        trailingStopPercent,
      },
      fetchTimeframe,
      chartPeriod,
    );
  }, [
    candles, result, chartPeriod, activeIndicatorTab, fetchTimeframe,
    emaPeriod, bbPeriod, bbStdDev, rsiPeriod, rsiOverbought, rsiOversold,
    macdFastPeriod, macdSlowPeriod, macdSignalPeriod,
    trailingStopEnabled, trailingStopPercent,
  ]);

  // ─── Y-axis domain: +/-10% padding around the data range ────────────────────
  const yDomain = useMemo<[number, number]>(() => {
    if (!equityCurve.length) return [90, 110];
    let lo = Infinity, hi = -Infinity;
    for (const p of equityCurve) {
      lo = Math.min(lo, p.strategy, p.hold);
      hi = Math.max(hi, p.strategy, p.hold);
    }
    const pad = Math.max((hi - lo) * 0.1, 1);
    return [lo - pad, hi + pad];
  }, [equityCurve]);

  // ─── Stacked fill data: offset values relative to yMin ───────────────────────
  const chartData = useMemo(() => {
    const yMin = yDomain[0];
    return equityCurve.map((p) => {
      const s = p.strategy - yMin;
      const h = p.hold     - yMin;
      return {
        ...p,                              // keep original strategy/hold for tooltip
        adjStrategy: s,
        adjHold:     h,
        grayBand:    Math.min(s, h),
        redBand:     Math.max(0, h - s),  // hold above strategy -> red
        greenBand:   Math.max(0, s - h),  // strategy above hold -> green
      };
    });
  }, [equityCurve, yDomain]);

  // Reference line at 100 (start value) shifted to the adjusted domain
  const refY100 = 100 - yDomain[0];

  return {
    candles,
    result,
    viewMode,
    setViewMode,
    initialInvestment,
    setInitialInvestment,
    showModal,
    setShowModal,
    manualSaving,
    backtestLoading,
    selectedPeriod,
    setSelectedPeriod,
    periodKeys,
    chartPeriod,
    fetchTimeframe,
    equityCurve,
    yDomain,
    chartData,
    refY100,
    handleAIAnalyze,
    handleManualTrade,
    analysisResult,
    setAnalysisResult,
    analyzing,
    hasAnalyzedOnce,
  };
}
