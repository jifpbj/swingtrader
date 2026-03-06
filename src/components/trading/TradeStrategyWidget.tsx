"use client";

import { useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { Zap, CheckCircle2, LogOut, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toAlpacaSymbol, isCrypto } from "@/lib/alpaca";
import type { PlaceOrderRequest } from "@/types/market";

export function TradeStrategyWidget() {
  const ticker             = useUIStore(s => s.ticker);
  const activeIndicatorTab = useUIStore(s => s.activeIndicatorTab);
  const emaPeriod          = useUIStore(s => s.emaPeriod);
  const bbPeriod           = useUIStore(s => s.bbPeriod);
  const bbStdDev           = useUIStore(s => s.bbStdDev);
  const rsiPeriod          = useUIStore(s => s.rsiPeriod);
  const macdFastPeriod     = useUIStore(s => s.macdFastPeriod);
  const macdSlowPeriod     = useUIStore(s => s.macdSlowPeriod);
  const macdSignalPeriod   = useUIStore(s => s.macdSignalPeriod);
  const timeframe          = useUIStore(s => s.timeframe);

  const user          = useAuthStore(s => s.user);
  const openAuthModal = useAuthStore(s => s.openAuthModal);
  const signOut       = useAuthStore(s => s.signOut);

  const alpacaConnected = useAlpacaStore(s => s.account !== null);
  const placeOrder      = useAlpacaStore(s => s.placeOrder);

  const [qty, setQty] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [fired, setFired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strategyLabel =
    activeIndicatorTab === "EMA"  ? `EMA(${emaPeriod})` :
    activeIndicatorTab === "BB"   ? `BB(${bbPeriod}, ${bbStdDev})` :
    activeIndicatorTab === "RSI"  ? `RSI(${rsiPeriod})` :
    activeIndicatorTab === "MACD" ? `MACD(${macdFastPeriod},${macdSlowPeriod},${macdSignalPeriod})` :
    "TD Sequential";

  async function handleTrade() {
    setError(null);

    if (!alpacaConnected) {
      // Scroll to the Paper Trading panel below
      document
        .getElementById("paper-trading-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (!user) {
      openAuthModal();
      return;
    }

    setSubmitting(true);
    const req: PlaceOrderRequest = {
      symbol: toAlpacaSymbol(ticker),
      qty: parseFloat(qty) || 1,
      side: "buy",
      type: "market",
      time_in_force: isCrypto(ticker) ? "gtc" : "day",
    };

    try {
      await placeOrder(req);
      setFired(true);
      setTimeout(() => setFired(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="glass rounded-2xl px-4 py-4 flex flex-col gap-3 shrink-0">
      {/* Strategy summary */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Active strategy</span>
          <span className="text-sm font-mono font-semibold text-zinc-100">
            {ticker} · {strategyLabel}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono">{timeframe.toUpperCase()} timeframe</span>
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <div className="flex items-center gap-1.5 bg-zinc-800/60 rounded-lg px-2 py-1 border border-zinc-700/40">
              <span className="text-[10px] text-zinc-400 font-mono max-w-[96px] truncate">
                {user.email?.split("@")[0]}
              </span>
              <button
                onClick={() => signOut()}
                title="Sign out"
                className="text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                <LogOut className="size-3" />
              </button>
            </div>
          )}
          {/* Status dot */}
          <span className="relative flex size-2.5">
            <span className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-60",
              alpacaConnected ? "bg-emerald-400" : "bg-amber-400",
            )} />
            <span className={cn(
              "relative inline-flex rounded-full size-2.5",
              alpacaConnected ? "bg-emerald-400" : "bg-amber-400",
            )} />
          </span>
        </div>
      </div>

      {/* Qty input — only show when Alpaca is connected */}
      {alpacaConnected && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium whitespace-nowrap">
            Qty
          </label>
          <input
            type="number"
            value={qty}
            onChange={e => setQty(e.target.value)}
            min="0.0001"
            step="any"
            className="flex-1 bg-zinc-800/80 border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/20 transition-all"
          />
          <span className="text-[10px] text-zinc-500 font-mono">
            {ticker.includes("/") ? ticker.split("/")[0] : ticker}
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* CTA button */}
      <button
        onClick={handleTrade}
        disabled={submitting}
        className={cn(
          "relative w-full flex items-center justify-center gap-2.5 rounded-xl py-3.5 px-4",
          "text-sm font-bold tracking-wide transition-all duration-200 select-none",
          "shadow-lg active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed",
          fired
            ? "bg-emerald-500 text-white shadow-emerald-500/30 scale-[0.98]"
            : alpacaConnected
            ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/30"
            : "bg-amber-400 hover:bg-amber-300 text-zinc-900 shadow-amber-400/30 hover:shadow-amber-400/50"
        )}
      >
        {submitting ? (
          <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : fired ? (
          <>
            <CheckCircle2 className="size-4 shrink-0" />
            Order Placed!
          </>
        ) : alpacaConnected ? (
          <>
            <Zap className="size-4 shrink-0 fill-white" />
            Buy {toAlpacaSymbol(ticker)} · Paper
          </>
        ) : (
          <>
            <Zap className="size-4 shrink-0 fill-zinc-900" />
            Connect Alpaca to Trade
          </>
        )}
      </button>
    </div>
  );
}
