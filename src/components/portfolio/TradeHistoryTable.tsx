"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TradeRecord } from "@/types/trade";
import type { TimePeriod } from "@/components/portfolio/TimePeriodSelector";

const currFmt  = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const currFmt0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dtFmt    = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

type SortKey = "exitTime" | "pnlDollars" | "pnlPercent" | "ticker" | "entryValue" | "exitValue";

interface Props {
  trades: TradeRecord[];
  period?: TimePeriod;
}

export function TradeHistoryTable({ trades, period }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("exitTime");
  const [sortAsc, setSortAsc] = useState(false);

  if (trades.length === 0) {
    return (
      <p className="text-sm text-muted-foreground/70 text-center py-8">
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
    if (sortKey === "ticker")      return mul * a.ticker.localeCompare(b.ticker);
    if (sortKey === "entryValue")  return mul * ((a.entryPrice * a.qty) - (b.entryPrice * b.qty));
    if (sortKey === "exitValue")   return mul * ((a.exitPrice  * a.qty) - (b.exitPrice  * b.qty));
    return mul * (a[sortKey] - b[sortKey]);
  });

  const totalPnl = trades.reduce((s, t) => s + t.pnlDollars, 0);

  function SortHeader({ col, label }: { col: SortKey; label: string }) {
    const active = sortKey === col;
    return (
      <th
        onClick={() => handleSort(col)}
        className={cn(
          "text-right px-3 py-2 font-medium cursor-pointer select-none transition-colors",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="inline-flex items-center gap-1 justify-end">
          {label}
          <ArrowUpDown className={cn("size-2.5", active ? "opacity-80" : "opacity-40")} />
        </span>
      </th>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Summary */}
      <div className="flex items-center justify-between text-[11px] px-1">
        <span className="text-muted-foreground">
          {trades.length} trade{trades.length !== 1 ? "s" : ""}
          {period ? <span className="text-muted-foreground/70"> · {period}</span> : null}
        </span>
        <span className={cn("font-mono font-bold tabular-nums", totalPnl >= 0 ? "dark:text-emerald-400 text-emerald-600" : "dark:text-red-400 text-red-600")}>
          Cumulative P/L: {totalPnl >= 0 ? "+" : ""}{currFmt.format(totalPnl)}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-[11px] min-w-[760px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 text-muted-foreground font-medium">Strategy</th>
              <SortHeader col="ticker" label="Ticker" />
              <th className="text-right px-3 py-2 text-muted-foreground font-medium">Entry Date</th>
              <th className="text-right px-3 py-2 text-muted-foreground font-medium">Exit Date</th>
              <th className="text-right px-3 py-2 text-muted-foreground font-medium">Qty</th>
              <SortHeader col="entryValue" label="Entry Val" />
              <SortHeader col="exitValue"  label="Exit Val" />
              <SortHeader col="pnlDollars" label="P/L $" />
              <SortHeader col="pnlPercent" label="P/L %" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const plColor    = t.pnlDollars >= 0 ? "dark:text-emerald-400 text-emerald-600" : "dark:text-red-400 text-red-600";
              const entryValue = t.entryPrice * t.qty;
              const exitValue  = t.exitPrice  * t.qty;
              return (
                <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="px-3 py-2 text-muted-foreground max-w-[100px] truncate" title={t.strategyName}>
                    {t.strategyName}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">{t.ticker}</td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground whitespace-nowrap">
                    {dtFmt.format(new Date(t.entryTime * 1000))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground whitespace-nowrap">
                    {dtFmt.format(new Date(t.exitTime * 1000))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground tabular-nums">{t.qty}</td>

                  {/* Entry market value = entryPrice × qty */}
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {currFmt0.format(entryValue)}
                  </td>
                  {/* Exit market value = exitPrice × qty */}
                  <td className={cn(
                    "px-3 py-2 text-right font-mono tabular-nums",
                    t.pnlDollars >= 0 ? "text-foreground/80" : "text-muted-foreground",
                  )}>
                    {currFmt0.format(exitValue)}
                  </td>

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
          <tfoot>
            <tr className="border-t border-border bg-muted/30">
              <td colSpan={5} className="px-3 py-2 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                Period total{period ? ` · ${period}` : ""}
              </td>
              {/* Entry value total */}
              <td className="px-3 py-2 text-right font-mono text-muted-foreground tabular-nums text-[11px]">
                {currFmt0.format(trades.reduce((s, t) => s + t.entryPrice * t.qty, 0))}
              </td>
              {/* Exit value total */}
              <td className="px-3 py-2 text-right font-mono text-muted-foreground tabular-nums text-[11px]">
                {currFmt0.format(trades.reduce((s, t) => s + t.exitPrice * t.qty, 0))}
              </td>
              {/* P/L $ total */}
              <td className={cn(
                "px-3 py-2 text-right font-mono font-bold tabular-nums",
                totalPnl >= 0 ? "dark:text-emerald-400 text-emerald-600" : "dark:text-red-400 text-red-600",
              )}>
                {totalPnl >= 0 ? "+" : ""}{currFmt.format(totalPnl)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
