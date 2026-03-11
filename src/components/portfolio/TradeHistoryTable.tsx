"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TradeRecord } from "@/types/trade";

const currFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const dtFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

type SortKey = "exitTime" | "pnlDollars" | "pnlPercent" | "ticker";

interface Props {
  trades: TradeRecord[];
}

export function TradeHistoryTable({ trades }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("exitTime");
  const [sortAsc, setSortAsc] = useState(false);

  if (trades.length === 0) {
    return (
      <p className="text-sm text-zinc-600 text-center py-8">
        No trade history in this period.
      </p>
    );
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sorted = [...trades].sort((a, b) => {
    const mul = sortAsc ? 1 : -1;
    if (sortKey === "ticker") return mul * a.ticker.localeCompare(b.ticker);
    return mul * (a[sortKey] - b[sortKey]);
  });

  const totalPnl = trades.reduce((s, t) => s + t.pnlDollars, 0);

  function SortHeader({ col, label }: { col: SortKey; label: string }) {
    return (
      <th
        onClick={() => handleSort(col)}
        className="text-right px-3 py-2 text-zinc-500 font-medium cursor-pointer hover:text-zinc-300 select-none transition-colors"
      >
        <span className="inline-flex items-center gap-1 justify-end">
          {label}
          <ArrowUpDown className="size-2.5 opacity-50" />
        </span>
      </th>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Summary */}
      <div className="flex items-center justify-between text-[11px] px-1">
        <span className="text-zinc-500">{trades.length} trades</span>
        <span className={cn("font-mono font-bold tabular-nums", totalPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
          Total: {totalPnl >= 0 ? "+" : ""}{currFmt.format(totalPnl)}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-[11px] min-w-[560px]">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-3 py-2 text-zinc-500 font-medium">Strategy</th>
              <SortHeader col="ticker" label="Ticker" />
              <th className="text-right px-3 py-2 text-zinc-500 font-medium">Entry</th>
              <th className="text-right px-3 py-2 text-zinc-500 font-medium">Exit</th>
              <th className="text-right px-3 py-2 text-zinc-500 font-medium">Qty</th>
              <SortHeader col="pnlDollars" label="P/L $" />
              <SortHeader col="pnlPercent" label="P/L %" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const plColor = t.pnlDollars >= 0 ? "text-emerald-400" : "text-red-400";
              return (
                <tr key={t.id} className="border-b border-white/3 hover:bg-white/2 transition-colors">
                  <td className="px-3 py-2 text-zinc-400 max-w-[120px] truncate" title={t.strategyName}>
                    {t.strategyName}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-zinc-200">{t.ticker}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-500">
                    {dtFmt.format(new Date(t.entryTime * 1000))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-500">
                    {dtFmt.format(new Date(t.exitTime * 1000))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400 tabular-nums">{t.qty}</td>
                  <td className={cn("px-3 py-2 text-right font-mono font-semibold tabular-nums", plColor)}>
                    {t.pnlDollars >= 0 ? "+" : ""}{currFmt.format(t.pnlDollars)}
                  </td>
                  <td className={cn("px-3 py-2 text-right font-mono font-semibold tabular-nums", plColor)}>
                    {t.pnlPercent >= 0 ? "+" : ""}{(t.pnlPercent * 100).toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
