"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import { computeStrategyBacktests } from "@/lib/indicators";
import type { Candle, BacktestResult, BacktestPeriodKey } from "@/types/market";
import { formatPercent } from "@/lib/utils";
import { BarChart2, Percent, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { toBackendTf } from "@/lib/timeframeConvert";

// Period keys are determined dynamically by the result; this is just a fallback
const LONG_TF_PERIOD_KEYS: BacktestPeriodKey[] = ["1M", "6M", "YTD", "1Y"];

export function BacktestPanel() {
  const ticker = useUIStore((s) => s.ticker);
  const timeframe = useUIStore((s) => s.timeframe);
  const emaPeriod = useUIStore((s) => s.emaPeriod);
  const activeIndicatorTab = useUIStore((s) => s.activeIndicatorTab);
  const rsiPeriod = useUIStore((s) => s.rsiPeriod);
  const rsiOverbought = useUIStore((s) => s.rsiOverbought);
  const rsiOversold = useUIStore((s) => s.rsiOversold);
  const bbPeriod = useUIStore((s) => s.bbPeriod);
  const bbStdDev = useUIStore((s) => s.bbStdDev);
  const macdFastPeriod = useUIStore((s) => s.macdFastPeriod);
  const macdSlowPeriod = useUIStore((s) => s.macdSlowPeriod);
  const macdSignalPeriod = useUIStore((s) => s.macdSignalPeriod);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [viewMode, setViewMode] = useState<"pct" | "val">("pct");
  const [initialInvestment, setInitialInvestment] = useState<number>(100_000);

  const currencyFmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  // Fetch timeframe bars; fallback to mock on error.
  // Limit is sized to cover 1Y of bars for the current timeframe (capped at 5000).
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const encodedTicker = encodeURIComponent(ticker);
    const backendTimeframe = toBackendTf(timeframe);
    const BPD: Record<string, number> = {
      "1m": 1440, "5m": 288, "15m": 96, "1h": 24, "4h": 6, "1d": 1,
    };
    const limit = Math.min(Math.ceil(252 * (BPD[timeframe] ?? 96)) + 50, 25000);

    fetch(
      `${apiUrl}/api/v1/market/ohlcv/${encodedTicker}?timeframe=${backendTimeframe}&limit=${limit}`,
    )
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json() as Promise<{ bars: Candle[] }>;
      })
      .then((json) => {
        const bars = json.bars ?? [];
        if (bars.length >= 10) setCandles(bars);
      })
      .catch(() => {
        // leave candles empty — the table will show "Computing…" until data arrives
      });
  }, [ticker, timeframe]);

  // Recompute backtest whenever candles or period changes
  useEffect(() => {
    if (!candles.length) return;
    setResult(
      computeStrategyBacktests(
        candles,
        (activeIndicatorTab === "TD9" ? "TD9" : activeIndicatorTab) as
          | "EMA"
          | "BB"
          | "RSI"
          | "MACD"
          | "TD9",
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
    candles,
    ticker,
    activeIndicatorTab,
    emaPeriod,
    bbPeriod,
    bbStdDev,
    rsiPeriod,
    rsiOverbought,
    rsiOversold,
    macdFastPeriod,
    macdSlowPeriod,
    macdSignalPeriod,
  ]);

  const periodKeys = result?.periodKeys ?? LONG_TF_PERIOD_KEYS;
  // Footer stats use the longest available period (last key)
  const lastPeriodKey = periodKeys[periodKeys.length - 1];
  const lastPeriodResult = result?.periods[lastPeriodKey];

  return (
    <div className="glass rounded-2xl px-4 py-3 flex flex-col gap-3 shrink-0">
      {/* Header */}
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

      {/* Initial investment — only visible in value mode */}
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

      {/* Table */}
      {result ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-white/5">
            <table className={cn("w-full text-[11px]", viewMode === "pct" ? "min-w-[240px]" : "min-w-[360px]")}>
              <thead>
                <tr className="border-b border-white/5">
                  <th className="sticky left-0 z-10 bg-card text-left px-2 py-1 text-zinc-500 font-medium border-r border-white/5">
                    Period
                  </th>
                  <th className="text-right px-2 py-1 text-zinc-500 font-medium">
                    Strategy
                  </th>
                  <th className="text-right px-2 py-1 text-zinc-500 font-medium">
                    Hold
                  </th>
                  <th className="text-right px-2 py-1 text-zinc-500 font-medium">
                    Trades
                  </th>
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

          {/* Footer stats — keyed to the longest available period */}
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
                    lastPeriodResult.maxDrawdown < -0.05
                      ? "text-red-400"
                      : "text-zinc-300",
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
        <div className="text-[11px] text-zinc-600 text-center py-4">
          Computing…
        </div>
      )}
    </div>
  );
}
