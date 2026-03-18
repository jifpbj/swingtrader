"use client";

import { useState } from "react";
import { TrendingDown, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { toAlpacaSymbol, isCrypto } from "@/lib/alpaca";
import type { AlpacaPosition, PlaceOrderRequest } from "@/types/market";

type OrderType = "market" | "limit";

const currFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

interface Props {
  positions: AlpacaPosition[];
}

export function PositionsTable({ positions }: Props) {
  const { placeOrder } = useAlpacaStore();

  const totalMktValue   = positions.reduce((s, p) => s + (p.market_value  ?? 0), 0);
  const totalUnrealPnl  = positions.reduce((s, p) => s + (p.unrealized_pl ?? 0), 0);
  const totalCostBasis  = positions.reduce((s, p) => s + p.avg_entry_price * p.qty, 0);
  const totalUnrealPct  = totalCostBasis > 0 ? (totalUnrealPnl / totalCostBasis) * 100 : 0;

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [qty, setQty] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleSelect(p: AlpacaPosition) {
    if (selectedSymbol === p.symbol) {
      setSelectedSymbol(null);
      setResult(null);
    } else {
      setSelectedSymbol(p.symbol);
      setQty(p.qty.toString());
      setOrderType("market");
      setLimitPrice("");
      setResult(null);
    }
  }

  async function handleSell(e: React.FormEvent, p: AlpacaPosition) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    const crypto = isCrypto(p.symbol);
    const req: PlaceOrderRequest = {
      symbol: toAlpacaSymbol(p.symbol),
      qty: parseFloat(qty),
      side: "sell",
      type: orderType,
      time_in_force: crypto ? "gtc" : "day",
      ...(orderType === "limit" && limitPrice
        ? { limit_price: parseFloat(limitPrice) }
        : {}),
    };
    try {
      const order = await placeOrder(req);
      setResult({ ok: true, msg: `Sell order placed · ${order.id.slice(0, 8)}…` });
      setSelectedSymbol(null);
    } catch (err) {
      setResult({ ok: false, msg: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  if (positions.length === 0) {
    return (
      <p className="text-sm text-zinc-600 text-center py-8">
        No open positions. Enable auto-trade on a strategy to start trading.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 overflow-hidden">
      <table className="w-full text-[11px] min-w-[520px]">
        <thead>
          <tr className="border-b border-white/5 text-zinc-500 font-medium">
            <th className="text-left px-3 py-2">Symbol</th>
            <th className="text-right px-3 py-2">Qty</th>
            <th className="text-right px-3 py-2">Avg Entry</th>
            <th className="text-right px-3 py-2">Current</th>
            <th className="text-right px-3 py-2">Mkt Value</th>
            <th className="text-right px-3 py-2">Unreal. P/L</th>
            <th className="text-right px-3 py-2">%</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const plColor =
              p.unrealized_pl >= 0 ? "text-emerald-400" : "text-red-400";
            const plPct = p.unrealized_plpc * 100;
            const isSelected = selectedSymbol === p.symbol;

            return (
              <>
                <tr
                  key={p.symbol}
                  onClick={() => handleSelect(p)}
                  className={cn(
                    "border-b border-white/3 cursor-pointer transition-colors",
                    isSelected
                      ? "bg-zinc-700/40"
                      : "hover:bg-white/3",
                  )}
                >
                  <td className="px-3 py-2 font-mono font-semibold text-zinc-100">
                    <div className="flex items-center gap-1.5">
                      {p.symbol}
                      <span className="text-[9px] text-zinc-600">
                        {isSelected ? "▲" : "▼"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">
                    {p.qty}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">
                    {currFmt.format(p.avg_entry_price)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">
                    {p.current_price !== null
                      ? currFmt.format(p.current_price)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">
                    {p.market_value !== null
                      ? currFmt.format(p.market_value)
                      : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono tabular-nums font-semibold",
                      plColor,
                    )}
                  >
                    {p.unrealized_pl >= 0 ? "+" : ""}
                    {currFmt.format(p.unrealized_pl)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono tabular-nums font-semibold",
                      plColor,
                    )}
                  >
                    {plPct >= 0 ? "+" : ""}
                    {plPct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(p);
                      }}
                      className={cn(
                        "px-2 py-1 rounded-md text-[10px] font-bold transition-all border",
                        isSelected
                          ? "border-zinc-600 text-zinc-400 hover:text-zinc-200"
                          : "border-red-500/40 text-red-400 hover:bg-red-500/10",
                      )}
                    >
                      {isSelected ? "Hide" : "Sell"}
                    </button>
                  </td>
                </tr>

                {/* Inline sell form row */}
                {isSelected && (
                  <tr key={`${p.symbol}-sell`} className="bg-zinc-800/50">
                    <td colSpan={8} className="px-4 py-3">
                      <form
                        onSubmit={(e) => handleSell(e, p)}
                        className="flex flex-col gap-3 max-w-lg"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider">
                            Close Position — {p.symbol}
                          </span>
                          {p.current_price != null && (
                            <span className="text-[10px] text-zinc-500 font-mono">
                              Last: {currFmt.format(p.current_price)}
                            </span>
                          )}
                        </div>

                        <div className="flex gap-3 items-end flex-wrap">
                          {/* Order type */}
                          <div className="flex gap-1 bg-zinc-900/60 rounded-lg p-0.5 shrink-0">
                            {(["market", "limit"] as OrderType[]).map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setOrderType(t)}
                                className={cn(
                                  "px-3 py-1 rounded-md text-[11px] font-medium transition-all capitalize",
                                  orderType === t
                                    ? "bg-zinc-700 text-zinc-100 shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-400",
                                )}
                              >
                                {t}
                              </button>
                            ))}
                          </div>

                          {/* Qty */}
                          <div className="flex flex-col gap-1 w-28">
                            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">
                              Qty
                            </label>
                            <input
                              type="number"
                              value={qty}
                              onChange={(e) => setQty(e.target.value)}
                              min="0.0001"
                              step="any"
                              required
                              className="bg-zinc-900/60 border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-red-400/60 focus:ring-1 focus:ring-red-400/20 transition-all"
                            />
                          </div>

                          {/* Limit price */}
                          {orderType === "limit" && (
                            <div className="flex flex-col gap-1 w-32">
                              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">
                                Limit Price
                              </label>
                              <input
                                type="number"
                                value={limitPrice}
                                onChange={(e) => setLimitPrice(e.target.value)}
                                min="0"
                                step="any"
                                required
                                placeholder={
                                  p.current_price != null
                                    ? p.current_price.toFixed(2)
                                    : ""
                                }
                                className="bg-zinc-900/60 border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-red-400/60 focus:ring-1 focus:ring-red-400/20 transition-all"
                              />
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-2 ml-auto">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSymbol(null);
                                setResult(null);
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 border border-white/10 hover:bg-white/5 transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={submitting}
                              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-red-500 hover:bg-red-400 text-white shadow-md shadow-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {submitting ? (
                                <span className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : (
                                <TrendingDown className="size-3.5" />
                              )}
                              {submitting
                                ? "Placing…"
                                : `Sell ${orderType === "market" ? "at Market" : "Limit"}`}
                            </button>
                          </div>
                        </div>

                        {result && (
                          <div
                            className={cn(
                              "flex items-center gap-2 text-[11px] rounded-lg px-3 py-2 border",
                              result.ok
                                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                                : "text-red-400 bg-red-500/10 border-red-500/20",
                            )}
                          >
                            <AlertCircle className="size-3.5 shrink-0" />
                            {result.msg}
                          </div>
                        )}
                      </form>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/10 bg-zinc-900/30">
            <td
              colSpan={4}
              className="px-3 py-2 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider"
            >
              Total · {positions.length} position{positions.length !== 1 ? "s" : ""}
            </td>
            <td className="px-3 py-2 text-right font-mono font-bold text-zinc-100 tabular-nums">
              {currFmt.format(totalMktValue)}
            </td>
            <td
              className={cn(
                "px-3 py-2 text-right font-mono font-bold tabular-nums",
                totalUnrealPnl >= 0 ? "text-emerald-400" : "text-red-400",
              )}
            >
              {totalUnrealPnl >= 0 ? "+" : ""}
              {currFmt.format(totalUnrealPnl)}
            </td>
            <td
              className={cn(
                "px-3 py-2 text-right font-mono font-bold tabular-nums",
                totalUnrealPct >= 0 ? "text-emerald-400" : "text-red-400",
              )}
            >
              {totalUnrealPct >= 0 ? "+" : ""}
              {totalUnrealPct.toFixed(2)}%
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
