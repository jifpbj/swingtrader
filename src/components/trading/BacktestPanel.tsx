"use client";

import { useEffect, useState, useCallback } from "react";
import { useUIStore } from "@/store/useUIStore";
import { useStrategyStore } from "@/store/useStrategyStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { computeStrategyBacktests } from "@/lib/indicators";
import { runAIOptimize } from "@/lib/strategyOptimizer";
import type { Candle, BacktestResult, BacktestPeriodKey } from "@/types/market";
import type { AlgoAnalysisResult } from "@/types/strategy";
import { formatPercent } from "@/lib/utils";
import { BarChart2, Percent, DollarSign, BrainCircuit, Loader2, TrendingUp, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { toBackendTf, TIMEFRAME_SECONDS } from "@/lib/timeframeConvert";
import { generateMockCandles } from "@/hooks/useMockData";
import { StrategyResultModal } from "@/components/algo/StrategyResultModal";

// Period keys are determined dynamically by the result; this is just a fallback
const LONG_TF_PERIOD_KEYS: BacktestPeriodKey[] = ["1M", "6M", "YTD", "1Y"];

export function BacktestPanel() {
  const ticker             = useUIStore((s) => s.ticker);
  const timeframe          = useUIStore((s) => s.timeframe);
  const emaPeriod          = useUIStore((s) => s.emaPeriod);
  const activeIndicatorTab = useUIStore((s) => s.activeIndicatorTab);
  const rsiPeriod          = useUIStore((s) => s.rsiPeriod);
  const rsiOverbought      = useUIStore((s) => s.rsiOverbought);
  const rsiOversold        = useUIStore((s) => s.rsiOversold);
  const bbPeriod           = useUIStore((s) => s.bbPeriod);
  const bbStdDev           = useUIStore((s) => s.bbStdDev);
  const macdFastPeriod     = useUIStore((s) => s.macdFastPeriod);
  const macdSlowPeriod     = useUIStore((s) => s.macdSlowPeriod);
  const macdSignalPeriod   = useUIStore((s) => s.macdSignalPeriod);

  const demoMode           = useUIStore((s) => s.demoMode);
  const tradingMode        = useAlpacaStore((s) => s.tradingMode);
  const user               = useAuthStore((s) => s.user);
  const {
    saveStrategy, setActiveStrategy,
    analysisResult, setAnalysisResult,
    analyzing, setAnalyzing,
    analysisRequested, clearAnalysisRequest,
  } = useStrategyStore();

  const [candles, setCandles]               = useState<Candle[]>([]);
  const [result, setResult]                 = useState<BacktestResult | null>(null);
  const [viewMode, setViewMode]             = useState<"pct" | "val">("pct");
  const [initialInvestment, setInitialInvestment] = useState<number>(100_000);
  const [showModal, setShowModal]           = useState(false);
  const [manualSaving, setManualSaving]     = useState(false);

  const currencyFmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  // ─── Fetch historical bars (or generate mock in demo/offline) ─────────────
  useEffect(() => {
    const BPD: Record<string, number> = {
      "1m": 1440, "5m": 288, "15m": 96, "1h": 24, "4h": 6, "1d": 1,
    };
    const count = Math.min(Math.ceil(252 * (BPD[timeframe] ?? 96)) + 50, 25000);
    const barSecs = TIMEFRAME_SECONDS[timeframe] ?? 900;

    // Derive a deterministic seed from ticker chars (same algo as useMockData)
    function tickerToSeed(t: string): number {
      let h = 0x811c9dc5;
      for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return h;
    }

    if (demoMode) {
      setCandles(generateMockCandles(barSecs, count, tickerToSeed(ticker)));
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const ctrl = new AbortController();

    fetch(
      `${apiUrl}/api/v1/market/ohlcv/${encodeURIComponent(ticker)}?timeframe=${toBackendTf(timeframe)}&limit=${count}`,
      { signal: ctrl.signal },
    )
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json() as Promise<{ bars: Candle[] }>;
      })
      .then((json) => {
        const bars = json.bars ?? [];
        if (bars.length >= 10) setCandles(bars);
        else setCandles(generateMockCandles(barSecs, count, tickerToSeed(ticker)));
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        // Backend unreachable — fall back to mock so backtest still works
        setCandles(generateMockCandles(barSecs, count, tickerToSeed(ticker)));
      });

    return () => ctrl.abort();
  }, [demoMode, ticker, timeframe]);

  // ─── Recompute backtest on indicator/candle changes ────────────────────────
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
        },
        timeframe,
      ),
    );
  }, [
    candles, ticker, activeIndicatorTab,
    emaPeriod, bbPeriod, bbStdDev,
    rsiPeriod, rsiOverbought, rsiOversold,
    macdFastPeriod, macdSlowPeriod, macdSignalPeriod,
  ]);

  // ─── AI Analyze ────────────────────────────────────────────────────────────
  const handleAIAnalyze = useCallback(async () => {
    if (!candles.length || analyzing) return;
    setAnalyzing(true);
    // Run optimizer off the main thread tick so the spinner renders
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    try {
      const optimResult = runAIOptimize(
        ticker,
        timeframe,
        candles,
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
        },
        initialInvestment,
        tradingMode,
      );
      if (optimResult) {
        setAnalysisResult(optimResult);
        setShowModal(true);
      }
    } finally {
      setAnalyzing(false);
    }
  }, [
    candles, ticker, timeframe, analyzing, initialInvestment, tradingMode,
    emaPeriod, bbPeriod, bbStdDev, rsiPeriod, rsiOverbought, rsiOversold,
    macdFastPeriod, macdSlowPeriod, macdSignalPeriod,
    setAnalyzing, setAnalysisResult,
  ]);

  // ─── Respond to external analysis requests (e.g. from TradeStrategyWidget) ──
  useEffect(() => {
    if (analysisRequested && !analyzing && candles.length) {
      clearAnalysisRequest();
      void handleAIAnalyze();
    }
  }, [analysisRequested, analyzing, candles.length, clearAnalysisRequest, handleAIAnalyze]);

  // ─── Manual "Trade this Strategy" (current indicator config) ───────────────
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
          },
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
    saveStrategy, setActiveStrategy,
  ]);

  const periodKeys = result?.periodKeys ?? LONG_TF_PERIOD_KEYS;
  const lastPeriodKey = periodKeys[periodKeys.length - 1];
  const lastPeriodResult = result?.periods[lastPeriodKey];

  return (
    <>
      <div className="glass rounded-2xl px-4 py-3 flex flex-col gap-3 shrink-0">
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart2 className="size-4 text-amber-400" />
            <span className="text-xs font-semibold text-zinc-200">Backtest</span>
            <span className="text-[10px] text-zinc-500 font-mono">
              {result?.strategyLabel ?? `EMA(${emaPeriod})`}·{timeframe.toUpperCase()}
            </span>
          </div>

          {/* % / $ toggle */}
          <div className="flex items-center gap-0.5 glass rounded-lg px-0.5 py-0.5">
            <button
              onClick={() => setViewMode("pct")}
              title="Percent change"
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all",
                viewMode === "pct"
                  ? "bg-amber-500/20 text-amber-400"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Percent className="size-3" />
              <span>%</span>
            </button>
            <button
              onClick={() => setViewMode("val")}
              title="Dollar value"
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all",
                viewMode === "val"
                  ? "bg-amber-500/20 text-amber-400"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <DollarSign className="size-3" />
              <span>$</span>
            </button>
          </div>
        </div>

        {/* ── Initial investment (value mode) ─────────────────────── */}
        {viewMode === "val" && (
          <div className="flex items-center justify-between gap-3 text-[10px]">
            <label htmlFor="initial-investment" className="text-zinc-500 font-medium">
              Initial investment
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-mono">$</span>
              <input
                id="initial-investment"
                type="number"
                min={0}
                step={1000}
                inputMode="decimal"
                value={Number.isFinite(initialInvestment) ? initialInvestment : 100_000}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  setInitialInvestment(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
                }}
                className="w-28 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-right font-mono tabular-nums text-zinc-200 outline-none focus:border-amber-500/40"
              />
            </div>
          </div>
        )}

        {/* ── Results table ────────────────────────────────────────── */}
        {result ? (
          <>
            <div className="overflow-x-auto rounded-lg border border-white/5">
              <table className={cn("w-full text-[11px]", viewMode === "pct" ? "min-w-[240px]" : "min-w-[360px]")}>
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="sticky left-0 z-10 bg-card text-left px-2 py-1 text-zinc-500 font-medium border-r border-white/5">
                      Period
                    </th>
                    <th className="text-right px-2 py-1 text-zinc-500 font-medium">Strategy</th>
                    <th className="text-right px-2 py-1 text-zinc-500 font-medium">Hold</th>
                    <th className="text-right px-2 py-1 text-zinc-500 font-medium">Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {periodKeys.map((key) => {
                    const p = result.periods[key];
                    const insufficient = !p || !p.sufficientData;
                    const strategyDollar = initialInvestment * (p?.strategyReturn ?? 0);
                    const holdDollar = initialInvestment * (p?.holdReturn ?? 0);
                    const beatsBenchmark = (p?.strategyReturn ?? 0) > (p?.holdReturn ?? 0);
                    return (
                      <tr key={key} className="border-b border-white/3 hover:bg-white/2">
                        <td className="sticky left-0 z-10 bg-card px-2 py-1.5 font-mono text-zinc-400 border-r border-white/5">
                          {key}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 text-right font-mono tabular-nums font-semibold",
                            insufficient ? "text-zinc-600" : beatsBenchmark ? "text-emerald-400" : "text-red-400",
                          )}
                        >
                          {insufficient ? "—" : viewMode === "pct"
                            ? formatPercent((p?.strategyReturn ?? 0) * 100)
                            : currencyFmt.format(strategyDollar)}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 text-right font-mono tabular-nums",
                            insufficient ? "text-zinc-600" : viewMode === "val"
                              ? holdDollar >= 0 ? "text-emerald-300" : "text-red-300"
                              : (p?.holdReturn ?? 0) >= 0 ? "text-foreground/70" : "text-muted-foreground",
                          )}
                        >
                          {insufficient ? "—" : viewMode === "pct"
                            ? formatPercent((p?.holdReturn ?? 0) * 100)
                            : currencyFmt.format(holdDollar)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                          {insufficient ? "—" : p!.tradeCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer stats */}
            {lastPeriodResult && lastPeriodResult.sufficientData && (
              <div className="flex items-center justify-between text-[10px] text-zinc-500 px-0.5">
                <span>
                  Win rate ({lastPeriodKey}):{" "}
                  <span className="text-zinc-300 font-mono">
                    {lastPeriodResult.tradeCount === 0
                      ? "—"
                      : `${(lastPeriodResult.winRate * 100).toFixed(0)}%`}
                  </span>
                </span>
                <span>
                  Max DD:{" "}
                  <span
                    className={cn(
                      "font-mono",
                      lastPeriodResult.maxDrawdown < -0.05 ? "text-red-400" : "text-zinc-300",
                    )}
                  >
                    {lastPeriodResult.maxDrawdown === 0
                      ? "—"
                      : viewMode === "val"
                        ? currencyFmt.format(initialInvestment * lastPeriodResult.maxDrawdown)
                        : formatPercent(lastPeriodResult.maxDrawdown * 100)}
                  </span>
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="text-[11px] text-zinc-600 text-center py-4">Computing…</div>
        )}

        {/* ── Algo Trading action row ──────────────────────────────── */}
        <div className="flex items-center gap-2 pt-1 border-t border-white/5">
          {/* AI Analyze */}
          <button
            onClick={handleAIAnalyze}
            disabled={analyzing || !candles.length}
            title="AI Optimize — find the best indicator config for this ticker & timeframe"
            className={cn(
              "flex flex-1 items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all",
              "bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/20",
              (analyzing || !candles.length) && "opacity-60 cursor-not-allowed",
            )}
          >
            {analyzing ? (
              <><Loader2 className="size-3.5 animate-spin" /> Analyzing…</>
            ) : (
              <><BrainCircuit className="size-3.5" /> AI Analyze</>
            )}
          </button>

          {/* Trade this Strategy — visible once an analysis result exists */}
          {(analysisResult || result) && user && (
            <button
              onClick={analysisResult ? () => setShowModal(true) : handleManualTrade}
              disabled={manualSaving}
              title={analysisResult ? "View AI result and trade" : "Save current strategy"}
              className={cn(
                "flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all",
                analysisResult
                  ? "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/25"
                  : "bg-white/5 hover:bg-white/10 text-zinc-400 border border-white/10",
                manualSaving && "opacity-60 cursor-not-allowed",
              )}
            >
              {manualSaving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : analysisResult ? (
                <><TrendingUp className="size-3.5" /> Trade this Strategy</>
              ) : (
                <><Save className="size-3.5" /> Save Strategy</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── AI Result Modal ──────────────────────────────────────────── */}
      {showModal && analysisResult && (
        <StrategyResultModal
          result={analysisResult}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            setAnalysisResult(null);
          }}
        />
      )}
    </>
  );
}
