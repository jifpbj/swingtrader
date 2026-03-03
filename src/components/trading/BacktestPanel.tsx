"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import { generateMockDailyCandles } from "@/hooks/useMockData";
import { computeAllBacktests } from "@/lib/indicators";
import type { Candle, BacktestResult, BacktestPeriodKey } from "@/types/market";
import { formatPercent } from "@/lib/utils";
import { BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PERIOD_KEYS: BacktestPeriodKey[] = ["1M", "6M", "YTD", "1Y"];

export function BacktestPanel() {
  const ticker = useUIStore((s) => s.ticker);
  const emaPeriod = useUIStore((s) => s.emaPeriod);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [result, setResult] = useState<BacktestResult | null>(null);

  // Fetch daily bars; fallback to mock on error
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const encodedTicker = encodeURIComponent(ticker);

    fetch(`${apiUrl}/api/v1/market/ohlcv/${encodedTicker}?timeframe=1Day&limit=365`)
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json() as Promise<{ bars: Candle[] }>;
      })
      .then((json) => {
        const bars = json.bars ?? [];
        setCandles(bars.length >= 10 ? bars : generateMockDailyCandles(252));
      })
      .catch(() => {
        setCandles(generateMockDailyCandles(252));
      });
  }, [ticker]);

  // Recompute backtest whenever candles or period changes
  useEffect(() => {
    if (!candles.length) return;
    setResult(computeAllBacktests(candles, emaPeriod, ticker));
  }, [candles, emaPeriod, ticker]);

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
          EMA({emaPeriod})·Daily
        </span>
      </div>

      {/* Table */}
      {result ? (
        <>
          <div className="overflow-hidden rounded-lg border border-white/5">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-2 py-1.5 text-zinc-500 font-medium">Period</th>
                  <th className="text-right px-2 py-1.5 text-zinc-500 font-medium">Strategy</th>
                  <th className="text-right px-2 py-1.5 text-zinc-500 font-medium">Hold</th>
                  <th className="text-right px-2 py-1.5 text-zinc-500 font-medium">Trades</th>
                </tr>
              </thead>
              <tbody>
                {PERIOD_KEYS.map((key) => {
                  const p = result.periods[key];
                  return (
                    <tr key={key} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="px-2 py-1.5 font-mono text-zinc-400">{key}</td>
                      <td className={cn(
                        "px-2 py-1.5 text-right font-mono tabular-nums font-semibold",
                        p.strategyReturn >= 0 ? "text-emerald-400" : "text-red-400"
                      )}>
                        {formatPercent(p.strategyReturn * 100)}
                      </td>
                      <td className={cn(
                        "px-2 py-1.5 text-right font-mono tabular-nums",
                        p.holdReturn >= 0 ? "text-zinc-300" : "text-zinc-500"
                      )}>
                        {formatPercent(p.holdReturn * 100)}
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
                <span className={cn(
                  "font-mono",
                  oneYearResult.maxDrawdown < -0.05 ? "text-red-400" : "text-zinc-300"
                )}>
                  {oneYearResult.maxDrawdown === 0
                    ? "—"
                    : formatPercent(oneYearResult.maxDrawdown * 100)}
                </span>
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="text-[11px] text-zinc-600 text-center py-4">Computing…</div>
      )}
    </div>
  );
}
