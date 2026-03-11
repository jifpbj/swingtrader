"use client";

import { useState } from "react";
import { X, TrendingUp, TrendingDown, BrainCircuit, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/utils";
import { useStrategyStore } from "@/store/useStrategyStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { AlgoAnalysisResult } from "@/types/strategy";


const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface Props {
  result: AlgoAnalysisResult;
  onClose: () => void;
  onSaved?: (strategyId: string) => void;
}

export function StrategyResultModal({ result, onClose, onSaved }: Props) {
  const { strategy, deltaVsHold } = result;
  const { saveStrategy, setActiveStrategy } = useStrategyStore();
  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);

  const [investment, setInvestment] = useState(strategy.initialInvestment);
  const [lotSizeDollars, setLotSizeDollars] = useState(strategy.lotSizeDollars ?? 1_000);
  const [lotSizeMode, setLotSizeMode] = useState<"dollars" | "units">(strategy.lotSizeMode ?? "dollars");
  const [saving, setSaving] = useState<"save" | "trade" | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { bestStrategyReturn, bestHoldReturn, bestMaxDrawdown, bestPeriodKey } = strategy;
  const strategyPnlPct  = bestStrategyReturn * 100;
  const strategyPnlCash = bestStrategyReturn * investment;
  const holdPnlPct      = bestHoldReturn * 100;
  const drawdownPct     = bestMaxDrawdown * 100;
  const drawdownCash    = bestMaxDrawdown * investment;
  const isPositive      = strategyPnlPct >= 0;

  async function handleSave(withAutoTrade = false) {
    if (!user) {
      openAuthModal();
      return;
    }
    setSaving(withAutoTrade ? "trade" : "save");
    setError(null);
    try {
      const now = Date.now();
      const id = await saveStrategy(
        {
          ...strategy,
          initialInvestment: investment,
          autoTrade: withAutoTrade,
          lotSizeMode,
          lotSizeDollars,
          orderQty: lotSizeMode === "units" ? lotSizeDollars : 1,
          openEntry: null,
          createdAt: now,
          updatedAt: now,
        },
        user.uid,
      );
      setActiveStrategy(id);
      setSaved(true);
      onSaved?.(id);
      setTimeout(onClose, 1400);
    } catch (e) {
      setError((e as Error).message ?? "Failed to save strategy.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass rounded-2xl w-full max-w-md shadow-2xl border border-white/10 flex flex-col">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 pt-5 pb-2">
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-5 text-violet-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-zinc-100">AI Optimize Result</p>
              <p className="text-[11px] text-zinc-500 font-mono mt-0.5 truncate max-w-[280px]">
                {strategy.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── Period badge ────────────────────────────────────────── */}
        <p className="px-5 pb-3 text-[11px] text-zinc-400">
          Results based on{" "}
          <span className="font-bold text-violet-300">{bestPeriodKey} period</span>
        </p>

        {/* ── Stats grid ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">

          {/* Total P/L */}
          <div className="glass-sm rounded-xl p-3 flex flex-col gap-0.5">
            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide flex items-center gap-1">
              {isPositive
                ? <TrendingUp className="size-3 text-emerald-400" />
                : <TrendingDown className="size-3 text-red-400" />
              }
              Total P/L
            </p>
            <span className={cn(
              "text-2xl font-mono font-bold tabular-nums leading-tight",
              isPositive ? "text-emerald-400" : "text-red-400",
            )}>
              {formatPercent(strategyPnlPct)}
            </span>
            <span className={cn(
              "text-base font-mono font-semibold tabular-nums",
              isPositive ? "text-emerald-300/80" : "text-red-300/80",
            )}>
              {currencyFmt.format(strategyPnlCash)}
            </span>
          </div>

          {/* vs. Hold — hold percent in red */}
          <div className="glass-sm rounded-xl p-3 flex flex-col gap-0.5">
            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">
              vs. Hold Strategy
            </p>
            <span className="text-2xl font-mono font-bold tabular-nums leading-tight text-red-400">
              {formatPercent(holdPnlPct)}
            </span>
            <span className={cn(
              "text-[11px] font-mono",
              deltaVsHold >= 0 ? "text-emerald-400/80" : "text-red-400/80",
            )}>
              {deltaVsHold >= 0 ? "+" : ""}{formatPercent(deltaVsHold * 100)} vs. strategy
            </span>
          </div>

          {/* Max Drawdown — always red */}
          <div className="glass-sm rounded-xl p-3 flex flex-col gap-0.5">
            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">
              Max Drawdown
            </p>
            <span className="text-2xl font-mono font-bold tabular-nums leading-tight text-red-400">
              {formatPercent(drawdownPct)}
            </span>
            <span className="text-base font-mono font-semibold tabular-nums text-red-400/70">
              {currencyFmt.format(drawdownCash)}
            </span>
          </div>

          {/* Based on — editable investment */}
          <div className="glass-sm rounded-xl p-3 flex flex-col gap-1">
            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">
              Based on
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-zinc-400 text-sm font-mono shrink-0">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={investment.toLocaleString("en-US")}
                onChange={(e) => {
                  const v = Number(e.target.value.replace(/,/g, ""));
                  if (Number.isFinite(v) && v >= 0) setInvestment(v);
                }}
                className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded-md px-2 py-1 text-sm font-mono font-bold text-zinc-200 focus:outline-none focus:border-violet-500/50 tabular-nums"
              />
            </div>
            <p className="text-[10px] text-zinc-500 font-mono">
              {strategy.ticker} &middot; {strategy.timeframe.toUpperCase()}
            </p>
          </div>
        </div>

        {/* ── Lot size ────────────────────────────────────────────── */}
        <div className="mx-5 mb-3 glass-sm rounded-xl p-3 flex items-center gap-3">
          <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide shrink-0">Lot Size</span>
          <div className="flex items-center gap-1 glass rounded-lg px-0.5 py-0.5 shrink-0">
            <button
              onClick={() => setLotSizeMode("dollars")}
              className={cn(
                "px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all",
                lotSizeMode === "dollars" ? "bg-violet-500/20 text-violet-300" : "text-zinc-500 hover:text-zinc-300",
              )}
            >$</button>
            <button
              onClick={() => setLotSizeMode("units")}
              className={cn(
                "px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all",
                lotSizeMode === "units" ? "bg-violet-500/20 text-violet-300" : "text-zinc-500 hover:text-zinc-300",
              )}
            >qty</button>
          </div>
          <div className="flex items-center gap-1 flex-1">
            {lotSizeMode === "dollars" && <span className="text-zinc-400 text-sm font-mono shrink-0">$</span>}
            <input
              type="number"
              min={1}
              step={lotSizeMode === "dollars" ? 100 : 1}
              value={lotSizeDollars}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v > 0) setLotSizeDollars(v);
              }}
              className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded-md px-2 py-1 text-sm font-mono font-bold text-zinc-200 focus:outline-none focus:border-violet-500/50 tabular-nums"
            />
          </div>
          <p className="text-[9px] text-zinc-600 shrink-0">per trade</p>
        </div>

        {/* ── Error ──────────────────────────────────────────────── */}
        {error && (
          <p className="mx-5 mb-3 text-[11px] text-red-400 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            {error}
          </p>
        )}

        {/* ── Footer: Save + Trade buttons ────────────────────────── */}
        <div className="flex items-center gap-2 px-5 pb-5">
          {/* Save Strategy — adds to sidebar, auto-trade off */}
          <button
            onClick={() => handleSave(false)}
            disabled={!!saving || saved}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border",
              saved
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "text-zinc-300 border-white/15 hover:bg-white/5 hover:text-zinc-100",
              (!!saving || saved) && "opacity-70 cursor-not-allowed",
            )}
          >
            {saved ? (
              <><CheckCircle2 className="size-4" /> Saved!</>
            ) : saving === "save" ? (
              <><Loader2 className="size-4 animate-spin" /> Saving&hellip;</>
            ) : (
              "Save Strategy"
            )}
          </button>

          {/* Trade this Strategy — saves + enables auto-trade */}
          <button
            onClick={() => handleSave(true)}
            disabled={!!saving || saved}
            className={cn(
              "flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all",
              saved
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-900/40",
              (!!saving || saved) && "opacity-80 cursor-not-allowed",
            )}
          >
            {saved ? (
              <><CheckCircle2 className="size-4" /> Strategy Saved!</>
            ) : saving === "trade" ? (
              <><Loader2 className="size-4 animate-spin" /> Saving&hellip;</>
            ) : (
              "Trade this Strategy"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
