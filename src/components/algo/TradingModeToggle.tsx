"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import type { TradingMode } from "@/types/strategy";

export function TradingModeToggle() {
  const tradingMode    = useAlpacaStore((s) => s.tradingMode);
  const setTradingMode = useAlpacaStore((s) => s.setTradingMode);
  const account        = useAlpacaStore((s) => s.account);

  const [showWarning, setShowWarning] = useState(false);

  function handleToggle(mode: TradingMode) {
    if (mode === tradingMode) return;
    if (mode === "live") {
      setShowWarning(true);  // ask for confirmation before switching to live
    } else {
      setTradingMode("paper");
    }
  }

  function confirmLive() {
    setTradingMode("live");
    setShowWarning(false);
  }

  return (
    <>
      {/* ── Toggle pill ──────────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-center gap-0.5 rounded-lg px-0.5 py-0.5 glass text-xs",
          !account && "opacity-50 pointer-events-none",
        )}
        title={!account ? "Connect Alpaca to switch trading mode" : undefined}
      >
        <button
          onClick={() => handleToggle("paper")}
          className={cn(
            "px-2.5 py-1 rounded-md font-semibold transition-all",
            tradingMode === "paper"
              ? "bg-yellow-500/20 text-yellow-400"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Paper
        </button>
        <button
          onClick={() => handleToggle("live")}
          className={cn(
            "px-2.5 py-1 rounded-md font-semibold transition-all",
            tradingMode === "live"
              ? "bg-emerald-500/20 text-emerald-400"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Live
        </button>
      </div>

      {/* ── Live mode warning modal ───────────────────────────────── */}
      {showWarning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowWarning(false); }}
        >
          <div className="glass rounded-2xl w-full max-w-sm shadow-2xl border border-amber-500/20 flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <AlertTriangle className="size-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">Switch to Live Trading?</p>
                  <p className="text-[11px] text-amber-400/80">Real money will be used</p>
                </div>
              </div>
              <button
                onClick={() => setShowWarning(false)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 pb-4 space-y-2 text-xs text-zinc-400 leading-relaxed">
              <p>
                You are switching to <span className="text-amber-400 font-semibold">Live Trading</span> mode.
                Any auto-trading strategies that execute will place <span className="font-semibold text-zinc-200">real orders</span> using
                your live Alpaca account.
              </p>
              <p className="text-zinc-500">
                Make sure your Alpaca credentials are for a <strong className="text-zinc-300">live</strong> account,
                not a paper account. Paper account keys will not work with live trading.
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-5 pb-5">
              <button
                onClick={() => setShowWarning(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={confirmLive}
                className="flex-[2] px-4 py-2.5 rounded-xl text-sm font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition-all"
              >
                Yes, switch to Live
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
