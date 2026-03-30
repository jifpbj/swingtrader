"use client";

import { useEffect } from "react";
import { Bot, Plus, LogIn, Bell, Lock } from "lucide-react";

import { useStrategyStore } from "@/store/useStrategyStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { useUIStore } from "@/store/useUIStore";
import { useSubscriptionStore } from "@/store/useSubscriptionStore";
import { StrategyCard } from "@/components/algo/StrategyCard";
import { FREE_STRATEGY_LIMIT } from "@/lib/trialIdentity";
import type { Timeframe } from "@/types/market";

export function StrategyQueue() {
  const user            = useAuthStore((s) => s.user);
  const openAuthModal   = useAuthStore((s) => s.openAuthModal);
  const isPaid          = useSubscriptionStore((s) => s.isPaid);
  const tradingMode     = useAlpacaStore((s) => s.tradingMode);
  const { strategies, loadStrategies, unloadStrategies, loadLocalStrategies, saveStrategy, saveStrategyLocal, setActiveStrategy } = useStrategyStore();

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
  const trailingStopEnabled  = useUIStore((s) => s.trailingStopEnabled);
  const trailingStopPercent  = useUIStore((s) => s.trailingStopPercent);

  // Subscribe to Firestore when user logs in, unsubscribe on logout
  useEffect(() => {
    if (user) {
      loadStrategies(user.uid);
    } else {
      unloadStrategies();
      loadLocalStrategies(); // Load localStorage strategies for unauthenticated users
    }
    return () => unloadStrategies();
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const atLimit = !isPaid() && strategies.length >= FREE_STRATEGY_LIMIT;

  /** Save the current chart config as a strategy */
  async function handleAddCurrent() {
    if (atLimit) return; // enforced in UI, but guard here too
    const now = Date.now();
    const indicator = (activeIndicatorTab === "TD9" ? "TD9" : activeIndicatorTab) as import("@/types/strategy").IndicatorType;
    const indicatorLabel =
      indicator === "EMA"  ? `EMA(${emaPeriod})` :
      indicator === "BB"   ? `BB(${bbPeriod},${bbStdDev})` :
      indicator === "RSI"  ? `RSI(${rsiPeriod})` :
      indicator === "MACD" ? `MACD(${macdFastPeriod},${macdSlowPeriod},${macdSignalPeriod})` :
      "TD9";

    const strategyData = {
      name: `${indicatorLabel} · ${ticker} · ${timeframe.toUpperCase()}`,
      ticker,
      timeframe,
      indicator,
      params: {
        emaPeriod, bbPeriod, bbStdDev, rsiPeriod, rsiOverbought, rsiOversold,
        macdFast: macdFastPeriod, macdSlow: macdSlowPeriod, macdSignal: macdSignalPeriod,
        trailingStopEnabled, trailingStopPercent,
      },
      trailingStopEnabled,
      trailingStopPercent,
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
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const id = user
      ? await saveStrategy(strategyData, user.uid)
      : saveStrategyLocal(strategyData);
    setActiveStrategy(id);
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* ── Add current button ────────────────────────────────────── */}
      {atLimit ? (
        <div className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border border-dashed border-amber-500/20 text-amber-400/70 text-[10px]">
          <Lock className="size-3 shrink-0" />
          <span>Limit {FREE_STRATEGY_LIMIT} strategies — <button onClick={openAuthModal} className="underline hover:text-amber-300">Upgrade</button></span>
        </div>
      ) : (
        <button
          onClick={handleAddCurrent}
          title="Save current indicator config as a strategy"
          className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border border-dashed border-white/10 text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all text-[10px]"
        >
          <Plus className="size-3 shrink-0" />
          Save current config ({strategies.length}/{FREE_STRATEGY_LIMIT})
        </button>
      )}

      {/* ── Auth prompt — only when no strategies saved yet */}
      {!user && strategies.length === 0 && (
        <button
          onClick={openAuthModal}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-all text-[10px]"
        >
          <LogIn className="size-3" />
          Sign in to sync strategies across devices
        </button>
      )}

      {/* ── Free plan notification banner ────────────────────────── */}
      {!isPaid() && strategies.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/8 border border-amber-500/20 text-[10px] text-amber-300/80 leading-relaxed">
          <Bell className="size-3 shrink-0 mt-0.5 text-amber-400" />
          <span>{user ? "Email notifications only on free plan." : "Sign in to sync & unlock more features."} <button onClick={openAuthModal} className="text-amber-400 font-semibold hover:underline">Upgrade</button></span>
        </div>
      )}

      {/* ── Strategy list ─────────────────────────────────────────── */}
      {strategies.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <Bot className="size-6 text-zinc-700" />
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            No strategies yet.<br />
            Use <span className="text-violet-400 font-semibold">AI Analyze</span> in the<br />
            Backtest panel to get started.
          </p>
        </div>
      )}

      {strategies.length > 0 && (
        <div className="flex flex-col gap-3 overflow-y-auto max-h-[70vh] pr-0.5">
          {strategies.map((s) => (
            <StrategyCard key={s.id} strategy={s} />
          ))}
        </div>
      )}
    </div>
  );
}
