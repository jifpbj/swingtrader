"use client";

import { useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { useStrategyStore } from "@/store/useStrategyStore";
import { Zap, CheckCircle2, AlertCircle, BrainCircuit, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function TradeStrategyWidget() {
  const ticker             = useUIStore(s => s.ticker);
  const activeIndicatorTab = useUIStore(s => s.activeIndicatorTab);
  const emaPeriod          = useUIStore(s => s.emaPeriod);
  const bbPeriod           = useUIStore(s => s.bbPeriod);
  const bbStdDev           = useUIStore(s => s.bbStdDev);
  const rsiPeriod          = useUIStore(s => s.rsiPeriod);
  const rsiOverbought      = useUIStore(s => s.rsiOverbought);
  const rsiOversold        = useUIStore(s => s.rsiOversold);
  const macdFastPeriod     = useUIStore(s => s.macdFastPeriod);
  const macdSlowPeriod     = useUIStore(s => s.macdSlowPeriod);
  const macdSignalPeriod   = useUIStore(s => s.macdSignalPeriod);
  const timeframe          = useUIStore(s => s.timeframe);

  const user          = useAuthStore(s => s.user);
  const openAuthModal = useAuthStore(s => s.openAuthModal);

  const tradingMode = useAlpacaStore(s => s.tradingMode);

  const analyzing         = useStrategyStore(s => s.analyzing);
  const requestAnalysis   = useStrategyStore(s => s.requestAnalysis);
  const saveStrategy      = useStrategyStore(s => s.saveStrategy);
  const setActiveStrategy = useStrategyStore(s => s.setActiveStrategy);

  const [submitting, setSubmitting] = useState(false);
  const [wittyPhrase, setWittyPhrase] = useState<string | null>(null);
  const [lotSizeDollars, setLotSizeDollars] = useState(1_000);
  const [lotSizeMode, setLotSizeMode] = useState<"dollars" | "units">("dollars");

  const WITTY_PHRASES = [
    "Consulting the crystal ball…",
    "Bribing the market gods…",
    "Whispering to the algorithm…",
    "Decoding chart hieroglyphics…",
    "Summoning the quant overlords…",
    "Asking the robots nicely…",
    "Reverse-engineering alpha…",
    "Staring at candles intensely…",
    "Crunching numbers, hold tight…",
    "Channeling Warren Buffett…",
  ];

  function handleAnalyze() {
    const phrase = WITTY_PHRASES[Math.floor(Math.random() * WITTY_PHRASES.length)];
    setWittyPhrase(phrase);
    setTimeout(() => {
      setWittyPhrase(null);
      requestAnalysis();
    }, 3000);
  }
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const indicator = activeIndicatorTab === "TD9" ? "TD9" : activeIndicatorTab as "EMA" | "BB" | "RSI" | "MACD";
  const strategyLabel =
    indicator === "EMA"  ? `EMA(${emaPeriod})` :
    indicator === "BB"   ? `BB(${bbPeriod}, ${bbStdDev})` :
    indicator === "RSI"  ? `RSI(${rsiPeriod})` :
    indicator === "MACD" ? `MACD(${macdFastPeriod},${macdSlowPeriod},${macdSignalPeriod})` :
    "TD Sequential";

  async function handleTrade() {
    setError(null);

    if (!user) {
      openAuthModal();
      return;
    }

    setSubmitting(true);
    try {
      const now = Date.now();
      const id = await saveStrategy(
        {
          name: `${strategyLabel} \u00B7 ${ticker} \u00B7 ${timeframe.toUpperCase()}`,
          ticker,
          timeframe,
          indicator,
          params: {
            emaPeriod, bbPeriod, bbStdDev,
            rsiPeriod, rsiOverbought, rsiOversold,
            macdFast: macdFastPeriod, macdSlow: macdSlowPeriod, macdSignal: macdSignalPeriod,
          },
          backtestResult: { ticker, strategyLabel, periods: {}, periodKeys: [] },
          bestPeriodKey: "",
          bestStrategyReturn: 0,
          bestHoldReturn: 0,
          bestMaxDrawdown: 0,
          initialInvestment: 100_000,
          autoTrade: true,
          tradingMode,
          orderQty: lotSizeMode === "units" ? lotSizeDollars : 1,
          lotSizeMode,
          lotSizeDollars,
          openEntry: null,
          lastExecutedSignalTime: null,
          createdAt: now,
          updatedAt: now,
        },
        user.uid,
      );
      setActiveStrategy(id);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="glass rounded-2xl px-4 py-4 flex flex-col gap-3 shrink-0">
      {/* Strategy summary */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Active strategy</span>
        <span className="text-sm font-mono font-semibold text-zinc-100">
          {ticker} {"\u00B7"} {strategyLabel}
        </span>
        <span className="text-[10px] text-zinc-500 font-mono">{timeframe.toUpperCase()} timeframe</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* AI Analyze — full width, above CTA */}
      <button
        onClick={handleAnalyze}
        disabled={!!wittyPhrase || analyzing}
        title="AI Optimize — find the best indicator config for this ticker & timeframe"
        className={cn(
          "w-full flex items-center justify-center gap-2.5 rounded-xl py-3.5 px-4",
          "text-sm font-bold tracking-wide transition-all duration-200 select-none",
          "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/40",
          "active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed",
        )}
      >
        {(wittyPhrase || analyzing)
          ? <Loader2 className="size-4 animate-spin shrink-0" />
          : <BrainCircuit className="size-4 shrink-0" />
        }
        {wittyPhrase ?? (analyzing ? "Analyzing\u2026" : "AI Analyze")}
      </button>

      {/* Lot size */}
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-zinc-500 font-medium shrink-0">Lot size</span>
        <div className="flex items-center gap-0.5 glass rounded-lg px-0.5 py-0.5 shrink-0">
          <button
            onClick={() => setLotSizeMode("dollars")}
            className={cn(
              "px-2 py-0.5 rounded-md font-semibold transition-all",
              lotSizeMode === "dollars" ? "bg-amber-500/20 text-amber-400" : "text-zinc-500 hover:text-zinc-300",
            )}
          >$</button>
          <button
            onClick={() => setLotSizeMode("units")}
            className={cn(
              "px-2 py-0.5 rounded-md font-semibold transition-all",
              lotSizeMode === "units" ? "bg-amber-500/20 text-amber-400" : "text-zinc-500 hover:text-zinc-300",
            )}
          >qty</button>
        </div>
        <div className="flex items-center gap-1 flex-1">
          {lotSizeMode === "dollars" && <span className="text-zinc-500 font-mono">$</span>}
          <input
            type="number"
            min={1}
            step={lotSizeMode === "dollars" ? 100 : 1}
            value={lotSizeDollars}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) setLotSizeDollars(v);
            }}
            className="flex-1 min-w-0 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-right font-mono tabular-nums text-zinc-200 outline-none focus:border-amber-500/40"
          />
        </div>
        <span className="text-zinc-600 shrink-0">/ trade</span>
      </div>

      {/* Trade CTA — always amber "Trade this Strategy" */}
      <button
        onClick={handleTrade}
        disabled={submitting}
        className={cn(
          "relative w-full flex items-center justify-center gap-2.5 rounded-xl py-3.5 px-4",
          "text-sm font-bold tracking-wide transition-all duration-200 select-none",
          "shadow-lg active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed",
          saved
            ? "bg-emerald-500 text-white shadow-emerald-500/30 scale-[0.98]"
            : "bg-amber-400 hover:bg-amber-300 text-zinc-900 shadow-amber-400/30 hover:shadow-amber-400/50",
        )}
      >
        {submitting ? (
          <span className="size-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
        ) : saved ? (
          <>
            <CheckCircle2 className="size-4 shrink-0" />
            Strategy Saved!
          </>
        ) : (
          <>
            <Zap className="size-4 shrink-0 fill-zinc-900" />
            Trade this Strategy
          </>
        )}
      </button>
    </div>
  );
}
