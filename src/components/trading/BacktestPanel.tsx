"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import { generateMockCandles, generateMockDailyCandles } from "@/hooks/useMockData";
import { computeStrategyBacktests } from "@/lib/indicators";
import type { Candle, BacktestResult, BacktestPeriodKey } from "@/types/market";
import { formatPercent } from "@/lib/utils";
import { BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toBackendTf } from "@/lib/timeframeConvert";

const PERIOD_KEYS: BacktestPeriodKey[] = ["1M", "6M", "YTD", "1Y"];

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
  const [initialInvestment, setInitialInvestment] = useState<number>(100_000);

  const currencyFmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  // Fetch timeframe bars; fallback to mock on error
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const encodedTicker = encodeURIComponent(ticker);
    const backendTimeframe = toBackendTf(timeframe);
    const limit = timeframe === "1d" ? 365 : 1000;

    fetch(
      `${apiUrl}/api/v1/market/ohlcv/${encodedTicker}?timeframe=${backendTimeframe}&limit=${limit}`,
    )
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json() as Promise<{ bars: Candle[] }>;
      })
      .then((json) => {
        const bars = json.bars ?? [];
        const fallback = timeframe === "1d" ? generateMockDailyCandles(252) : generateMockCandles(500);
        setCandles(bars.length >= 10 ? bars : fallback);
      })
      .catch(() => {
        setCandles(timeframe === "1d" ? generateMockDailyCandles(252) : generateMockCandles(500));
      });
  }, [ticker, timeframe]);

  // Recompute backtest whenever candles or period changes
  useEffect(() => {
    if (!candles.length) return;
    setResult(
      computeStrategyBacktests(
        candles,
        // Keep tab values aligned with computeStrategyBacktests's BacktestStrategy union
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

  const oneYearResult = result?.periods["1Y"];

  return (
    <div className="glass rounded-2xl px-4 py-3 flex flex-col gap-3 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="size-4 text-amber-400" />
          <span className="text-xs font-semibold text-zinc-200">Backtest</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">
          {result?.strategyLabel ?? `EMA(${emaPeriod})`}·{timeframe.toUpperCase()}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 text-[10px]">
        <label
          htmlFor="initial-investment"
          className="text-zinc-500 font-medium"
        >
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
            value={
              Number.isFinite(initialInvestment) ? initialInvestment : 100_000
            }
            onChange={(e) => {
              const parsed = Number(e.target.value);
              setInitialInvestment(
                Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
              );
            }}
            className="w-28 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-right font-mono tabular-nums text-zinc-200 outline-none focus:border-amber-500/40"
          />
        </div>
      </div>

      {/* Table */}
      {result ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-white/5">
            <table className="w-full min-w-[660px] text-[11px]">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-1 py-1 text-zinc-500 font-medium">
                    Period
                  </th>
                  <th className="text-right px-1 py-1 text-zinc-500 font-medium">
                    Strategy
                  </th>
                  <th className="text-right px-1 py-1 text-zinc-500 font-medium">
                    Hold
                  </th>
                  <th className="text-right px-1 py-1 text-zinc-500 font-medium min-w-[60px]">
                    P/L
                  </th>
                  <th className="text-right px-1 py-1 text-zinc-500 font-medium min-w-[70px]">
                    Value
                  </th>
                  <th className="text-right px-1 py-1 text-zinc-500 font-medium">
                    Trades
                  </th>
                </tr>
              </thead>
              <tbody>
                {PERIOD_KEYS.map((key) => {
                  const p = result.periods[key];
                  const strategyValue =
                    initialInvestment * (1 + p.strategyReturn);
                  const profitLoss = strategyValue - initialInvestment;
                  const strategyColor =
                    p.strategyReturn > p.holdReturn
                      ? "text-emerald-400"
                      : "text-red-400";
                  return (
                    <tr
                      key={key}
                      className="border-b border-white/3 hover:bg-white/2"
                    >
                      <td className="px-2 py-1.5 font-mono text-zinc-400">
                        {key}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right font-mono tabular-nums font-semibold",
                          strategyColor,
                        )}
                      >
                        {formatPercent(p.strategyReturn * 100)}
                      </td>
                      <td
                        className={cn(
                          "px-1 py-1.5 text-right font-mono tabular-nums",
                          p.holdReturn >= 0 ? "text-zinc-300" : "text-zinc-500",
                        )}
                      >
                        {formatPercent(p.holdReturn * 100)}
                      </td>
                      <td
                        className={cn(
                          "px-1 py-1.5 text-right font-mono tabular-nums",
                          profitLoss > 0
                            ? "text-emerald-300"
                            : profitLoss < 0
                              ? "text-red-300"
                              : "text-zinc-300",
                        )}
                      >
                        {currencyFmt.format(profitLoss)}
                      </td>
                      <td
                        className={cn(
                          "px-1 py-1.5 text-right font-mono tabular-nums",
                          strategyValue >= initialInvestment
                            ? "text-emerald-300"
                            : "text-red-300",
                        )}
                      >
                        {currencyFmt.format(strategyValue)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-zinc-400">
                        {p.tradeCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer stats */}
          {oneYearResult && (
            <div className="flex items-center justify-between text-[10px] text-zinc-500 px-0.5">
              <span>
                Win rate (1Y):{" "}
                <span className="text-zinc-300 font-mono">
                  {oneYearResult.tradeCount === 0
                    ? "—"
                    : `${(oneYearResult.winRate * 100).toFixed(0)}%`}
                </span>
              </span>
              <span>
                Max DD:{" "}
                <span
                  className={cn(
                    "font-mono",
                    oneYearResult.maxDrawdown < -0.05
                      ? "text-red-400"
                      : "text-zinc-300",
                  )}
                >
                  {oneYearResult.maxDrawdown === 0
                    ? "—"
                    : formatPercent(oneYearResult.maxDrawdown * 100)}
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
