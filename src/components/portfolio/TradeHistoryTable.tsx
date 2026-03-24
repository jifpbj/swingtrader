"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { matchOrderToStrategy } from "@/lib/utils";
import type { AlpacaOrder } from "@/types/market";
import type { TimePeriod } from "@/components/portfolio/TimePeriodSelector";

const currFmt  = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const dtFmt    = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

type SortKey = "created_at" | "symbol" | "side" | "filled_qty" | "totalValue";

interface Props {
  orders: AlpacaOrder[];
  strategies: { ticker: string; name: string }[];
  period?: TimePeriod;
}

const STATUS_COLORS: Record<string, string> = {
  filled:           "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  partially_filled: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  new:              "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  accepted:         "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  canceled:         "bg-zinc-500/15 text-zinc-500",
  expired:          "bg-zinc-500/15 text-zinc-500",
  rejected:         "bg-red-500/15 text-red-600 dark:text-red-400",
  pending_new:      "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

function totalValue(o: AlpacaOrder): number {
  if (o.filled_avg_price && o.filled_qty) return o.filled_avg_price * o.filled_qty;
  if (o.notional) return o.notional;
  return 0;
}

export function TradeHistoryTable({ orders, strategies, period }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  if (orders.length === 0) {
    return (
      <p className="text-sm text-muted-foreground/70 text-center py-8">
        No orders in this period.
      </p>
    );
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sorted = [...orders].sort((a, b) => {
    const mul = sortAsc ? 1 : -1;
    if (sortKey === "symbol")     return mul * a.symbol.localeCompare(b.symbol);
    if (sortKey === "side")       return mul * a.side.localeCompare(b.side);
    if (sortKey === "filled_qty") return mul * ((a.filled_qty ?? 0) - (b.filled_qty ?? 0));
    if (sortKey === "totalValue") return mul * (totalValue(a) - totalValue(b));
    // created_at (ISO string sorts lexicographically)
    return mul * a.created_at.localeCompare(b.created_at);
  });

  function SortHeader({ col, label, align = "right" }: { col: SortKey; label: string; align?: "left" | "right" }) {
    const active = sortKey === col;
    return (
      <th
        onClick={() => handleSort(col)}
        className={cn(
          `text-${align} px-3 py-2 font-medium cursor-pointer select-none transition-colors`,
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className={cn("inline-flex items-center gap-1", align === "right" ? "justify-end" : "justify-start")}>
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
          {orders.length} order{orders.length !== 1 ? "s" : ""}
          {period ? <span className="text-muted-foreground/70"> · {period}</span> : null}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-[11px] min-w-[760px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 text-muted-foreground font-medium">Strategy</th>
              <SortHeader col="symbol" label="Ticker" align="left" />
              <SortHeader col="side" label="Side" align="left" />
              <SortHeader col="created_at" label="Date" />
              <th className="text-center px-3 py-2 text-muted-foreground font-medium">Status</th>
              <SortHeader col="filled_qty" label="Qty" />
              <th className="text-right px-3 py-2 text-muted-foreground font-medium">Fill Price</th>
              <SortHeader col="totalValue" label="Total Value" />
              <th className="text-right px-3 py-2 text-muted-foreground font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((o) => {
              const strategyName = matchOrderToStrategy(o.symbol, strategies);
              const sideColor = o.side === "buy"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/15 text-red-600 dark:text-red-400";
              const statusColor = STATUS_COLORS[o.status] ?? "bg-zinc-500/15 text-zinc-500";
              const val = totalValue(o);

              return (
                <tr key={o.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="px-3 py-2 text-muted-foreground max-w-[100px] truncate" title={strategyName ?? "—"}>
                    {strategyName ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono font-semibold text-foreground">{o.symbol}</td>
                  <td className="px-3 py-2">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase", sideColor)}>
                      {o.side}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground whitespace-nowrap">
                    {dtFmt.format(new Date(o.created_at))}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", statusColor)}>
                      {o.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground tabular-nums">
                    {o.filled_qty || (o.qty ?? "—")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground tabular-nums">
                    {o.filled_avg_price ? currFmt.format(o.filled_avg_price) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {val > 0 ? currFmt.format(val) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground capitalize">
                    {o.order_type.replace(/_/g, " ")}
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
