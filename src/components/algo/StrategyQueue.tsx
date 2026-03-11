"use client";

import { useEffect } from "react";
import { Bot, Plus, LogIn } from "lucide-react";

import { useStrategyStore } from "@/store/useStrategyStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { useUIStore } from "@/store/useUIStore";
import { StrategyCard } from "@/components/algo/StrategyCard";
import type { Timeframe } from "@/types/market";

export function StrategyQueue() {
  const user            = useAuthStore((s) => s.user);
  const openAuthModal   = useAuthStore((s) => s.openAuthModal);
  const tradingMode     = useAlpacaStore((s) => s.tradingMode);
  const { strategies, loadStrategies, unloadStrategies, saveStrategy, setActiveStrategy } = useStrategyStore();

  const ticker             = useUIStore((s) => s.ticker);
  const timeframe          = useUIStore((s) => s.timeframe);
  const activeIndicatorTab = useUIStore((s) => s.activeIndicatorTab);
  const emaPeriod          = useUIStore((s) => s.emaPeriod);
  const bbPeriod           = useUIStore((s) => s.bbPeriod);
  const bbStdDev           = useUIStore((s) => s.bbStdDev);
  const rsiPeriod          = useUIStore((s) => s.rsiPeriod);
  const rsiOverbought      = useUIStore((s) => s.rsiOverbought);
  const rsiOversold        = useUIStore((s) => s.rsiOversold);
  const macdFastPeriod     = useUIStore((s) => s.macdFastPeriod);
  const macdSlowPeriod     = useUIStore((s) => s.macdSlowPeriod);
  const macdSignalPeriod   = useUIStore((s) => s.macdSignalPeriod);

  // Subscribe to Firestore when user logs in, unsubscribe on logout
  useEffect(() => {
    if (user) {
      loadStrategies(user.uid);
    } else {
      unloadStrategies();
    }
    return () => unloadStrategies();
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Save the current chart config as a strategy */
  async function handleAddCurrent() {
    if (!user) { openAuthModal(); return; }
    const now = Date.now();
    const indicator = activeIndicatorTab === "TD9" ? "TD9" : activeIndicatorTab as "EMA" | "BB" | "RSI" | "MACD";
    const indicatorLabel =
      indicator === "EMA"  ? `EMA(${emaPeriod})` :
      indicator === "BB"   ? `BB(${bbPeriod},${bbStdDev})` :
      indicator === "RSI"  ? `RSI(${rsiPeriod})` :
      indicator === "MACD" ? `MACD(${macdFastPeriod},${macdSlowPeriod},${macdSignalPeriod})` :
      "TD9";

    const id = await saveStrategy(
      {
        name: `${indicatorLabel} · ${ticker} · ${timeframe.toUpperCase()}`,
        ticker,
        timeframe,
        indicator,
        params: {
          emaPeriod, bbPeriod, bbStdDev, rsiPeriod, rsiOverbought, rsiOversold,
          macdFast: macdFastPeriod, macdSlow: macdSlowPeriod, macdSignal: macdSignalPeriod,
        },
        backtestResult: { ticker, strategyLabel: indicatorLabel, periods: {}, periodKeys: [] },
        bestPeriodKey: "",
        bestStrategyReturn: 0,
        bestHoldReturn: 0,
        bestMaxDrawdown: 0,
        initialInvestment: 100_000,
        autoTrade: false,
        tradingMode,
        orderQty: 1,
        lotSizeMode: "dollars" as const,
        lotSizeDollars: 1_000,
        openEntry: null,
        lastExecutedSignalTime: null,
        createdAt: now,
        updatedAt: now,
      },
      user.uid,
    );
    setActiveStrategy(id);
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* ── Add current button ────────────────────────────────────── */}
      <button
        onClick={handleAddCurrent}
        title="Save current indicator config as a strategy"
        className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border border-dashed border-white/10 text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all text-[10px]"
      >
        <Plus className="size-3 shrink-0" />
        Save current config
      </button>

      {/* ── Auth prompt ──────────────────────────────────────────── */}
      {!user && (
        <button
          onClick={openAuthModal}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-all text-[10px]"
        >
          <LogIn className="size-3" />
          Sign in to save strategies
        </button>
      )}

      {/* ── Strategy list ─────────────────────────────────────────── */}
      {user && strategies.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <Bot className="size-6 text-zinc-700" />
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            No strategies yet.<br />
            Use <span className="text-violet-400 font-semibold">AI Analyze</span> in the<br />
            Backtest panel to get started.
          </p>
        </div>
      )}

      {user && strategies.length > 0 && (
        <div className="flex flex-col gap-3 overflow-y-auto max-h-[70vh] pr-0.5">
          {strategies.map((s) => (
            <StrategyCard key={s.id} strategy={s} />
          ))}
        </div>
      )}
    </div>
  );
}
