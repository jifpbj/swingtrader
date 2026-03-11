"use client";

import { cn } from "@/lib/utils";
import type { AlpacaPosition } from "@/types/market";

const currFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

interface Props {
  positions: AlpacaPosition[];
}

export function PositionsTable({ positions }: Props) {
  if (positions.length === 0) {
    return (
      <p className="text-sm text-zinc-600 text-center py-8">
        No open positions. Enable auto-trade on a strategy to start trading.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/5">
      <table className="w-full text-[11px] min-w-[480px]">
        <thead>
          <tr className="border-b border-white/5 text-zinc-500 font-medium">
            <th className="text-left px-3 py-2">Symbol</th>
            <th className="text-right px-3 py-2">Qty</th>
            <th className="text-right px-3 py-2">Avg Entry</th>
            <th className="text-right px-3 py-2">Current</th>
            <th className="text-right px-3 py-2">Mkt Value</th>
            <th className="text-right px-3 py-2">Unreal. P/L</th>
            <th className="text-right px-3 py-2">%</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const plColor = p.unrealized_pl >= 0 ? "text-emerald-400" : "text-red-400";
            const plPct = p.unrealized_plpc * 100;
            return (
              <tr key={p.symbol} className="border-b border-white/3 hover:bg-white/2 transition-colors">
                <td className="px-3 py-2 font-mono font-semibold text-zinc-100">{p.symbol}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">{p.qty}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">
                  {currFmt.format(p.avg_entry_price)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">
                  {p.current_price !== null ? currFmt.format(p.current_price) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">
                  {p.market_value !== null ? currFmt.format(p.market_value) : "—"}
                </td>
                <td className={cn("px-3 py-2 text-right font-mono tabular-nums font-semibold", plColor)}>
                  {p.unrealized_pl >= 0 ? "+" : ""}{currFmt.format(p.unrealized_pl)}
                </td>
                <td className={cn("px-3 py-2 text-right font-mono tabular-nums font-semibold", plColor)}>
                  {plPct >= 0 ? "+" : ""}{plPct.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
