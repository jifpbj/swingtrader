"use client";

import { useMemo, useState } from "react";
import { X, TrendingUp, TrendingDown, BrainCircuit, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import {
  ComposedChart, Area, Line, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
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
  const { strategy, deltaVsHold, equityCurve } = result;
  const { saveStrategy, setActiveStrategy } = useStrategyStore();
  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);

  const [saving, setSaving] = useState<"save" | "trade" | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { bestStrategyReturn, bestHoldReturn, bestPeriodKey } = strategy;
  const investment      = strategy.initialInvestment;
  const strategyPnlPct  = bestStrategyReturn * 100;
  const strategyPnlCash = bestStrategyReturn * investment;
  const holdPnlPct      = bestHoldReturn * 100;
  const isPositive      = strategyPnlPct >= 0;

  // ── Equity curve chart data ────────────────────────────────────────────────
  const yDomain = useMemo<[number, number]>(() => {
    if (!equityCurve?.length) return [90, 110];
    let lo = Infinity, hi = -Infinity;
    for (const p of equityCurve) {
      lo = Math.min(lo, p.strategy, p.hold);
      hi = Math.max(hi, p.strategy, p.hold);
    }
    const pad = Math.max((hi - lo) * 0.1, 1);
    return [lo - pad, hi + pad];
  }, [equityCurve]);

  const chartData = useMemo(() => {
    if (!equityCurve?.length) return [];
    const yMin = yDomain[0];
    return equityCurve.map((p) => {
      const s = p.strategy - yMin;
      const h = p.hold     - yMin;
      return {
        ...p,
        adjStrategy: s,
        adjHold:     h,
        grayBand:    Math.min(s, h),
        redBand:     Math.max(0, h - s),
        greenBand:   Math.max(0, s - h),
      };
    });
  }, [equityCurve, yDomain]);

  const refY100 = 100 - yDomain[0];
  const hasChart = chartData.length >= 2;

  // Friendly indicator label
  const indicatorLabel: Record<string, string> = {
    EMA: "EMA Crossover", BB: "Bollinger Bands",
    RSI: "RSI", MACD: "MACD", TD9: "TD Sequential",
  };
  const stratLabel = indicatorLabel[strategy.indicator] ?? strategy.indicator;

  async function handleSave(withAutoTrade = false) {
    if (!user) { openAuthModal(); return; }
    setSaving(withAutoTrade ? "trade" : "save");
    setError(null);
    try {
      const now = Date.now();
      const id = await saveStrategy(
        {
          ...strategy,
          autoTrade: withAutoTrade,
          orderQty: strategy.lotSizeMode === "units" ? strategy.lotSizeDollars : 1,
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
      <div className="glass rounded-2xl w-full max-w-lg shadow-2xl border border-white/10 flex flex-col max-h-[92vh] overflow-y-auto">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 pt-5 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-5 text-violet-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-zinc-100">AI Optimize Result</p>
              <p className="text-[11px] text-zinc-500 font-mono mt-0.5 truncate max-w-[320px]">
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

        {/* ── Summary hero ────────────────────────────────────────── */}
        <div
          className="mx-5 mb-4 rounded-xl overflow-hidden border border-white/8 shrink-0"
          style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(16,16,20,0.55) 65%)" }}
        >
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="size-3.5 text-violet-400 shrink-0" />
              <span className="text-[11px] text-violet-300 font-semibold uppercase tracking-wider">
                Analysis Summary
              </span>
            </div>
            <p className="text-[13px] text-zinc-300 leading-relaxed">
              Based on our analysis, trading{" "}
              <span className="font-semibold text-zinc-100">{strategy.ticker}</span>{" "}
              with{" "}
              <span className="font-semibold text-violet-300">{stratLabel}</span>{" "}
              over the past{" "}
              <span className="font-semibold text-zinc-100">{bestPeriodKey}</span>{" "}
              could have{" "}
              {isPositive ? (
                <>
                  returned{" "}
                  <span className="font-bold text-emerald-400">
                    {currencyFmt.format(Math.abs(strategyPnlCash))}
                  </span>
                  {" "}
                  <span className="text-emerald-400/80 font-mono text-[12px]">
                    ({formatPercent(strategyPnlPct)})
                  </span>
                </>
              ) : (
                <>
                  lost{" "}
                  <span className="font-bold text-red-400">
                    {currencyFmt.format(Math.abs(strategyPnlCash))}
                  </span>
                  {" "}
                  <span className="text-red-400/80 font-mono text-[12px]">
                    ({formatPercent(strategyPnlPct)})
                  </span>
                </>
              )}
              {" "}on a{" "}
              <span className="font-semibold text-zinc-100">
                {currencyFmt.format(investment)}
              </span>{" "}
              investment
              {holdPnlPct !== 0 ? (
                <>
                  , compared to{" "}
                  <span className={cn(
                    "font-semibold",
                    holdPnlPct >= 0 ? "text-zinc-300" : "text-red-400/80",
                  )}>
                    {formatPercent(holdPnlPct)}
                  </span>
                  {" "}just holding.
                </>
              ) : "."}
            </p>
          </div>

          {/* Performance curve */}
          {hasChart ? (
            <div className="px-2 pb-2">
              <ResponsiveContainer width="100%" height={110} debounce={50}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <YAxis domain={[0, yDomain[1] - yDomain[0]]} hide />

                  {/* Grey base fill */}
                  <Area type="monotone" dataKey="grayBand" stackId="fills"
                    fill="rgba(113,113,122,0.20)" stroke="none" isAnimationActive={false} />
                  {/* Red fill — strategy below hold */}
                  <Area type="monotone" dataKey="redBand" stackId="fills"
                    fill="rgba(239,68,68,0.35)" stroke="none" isAnimationActive={false} />
                  {/* Green fill — strategy above hold */}
                  <Area type="monotone" dataKey="greenBand" stackId="fills"
                    fill="rgba(52,211,153,0.35)" stroke="none" isAnimationActive={false} />

                  <ReferenceLine y={refY100} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />

                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload as { strategy: number; hold: number };
                      const sd = d.strategy - 100;
                      const hd = d.hold - 100;
                      return (
                        <div style={{
                          background: "rgba(9,9,11,0.95)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8, padding: "6px 10px",
                          fontSize: 10, lineHeight: 1.6,
                        }}>
                          <div style={{ color: sd >= 0 ? "#34d399" : "#f87171" }}>
                            Strategy: {sd >= 0 ? "+" : ""}{sd.toFixed(1)}%
                          </div>
                          <div style={{ color: "#71717a" }}>
                            Hold: {hd >= 0 ? "+" : ""}{hd.toFixed(1)}%
                          </div>
                        </div>
                      );
                    }}
                    isAnimationActive={false}
                  />

                  {/* Strategy line — emerald */}
                  <Line type="monotone" dataKey="adjStrategy" stroke="#34d399"
                    strokeWidth={2} dot={false} isAnimationActive={false} />
                  {/* Hold line — dashed zinc */}
                  <Line type="monotone" dataKey="adjHold" stroke="#71717a"
                    strokeWidth={1.25} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="flex items-center gap-4 px-2 pb-1">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-5 h-[2px] bg-emerald-400 rounded-full" />
                  <span className="text-[9px] text-zinc-500">{stratLabel}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg width="20" height="4" viewBox="0 0 20 4" className="shrink-0">
                    <line x1="0" y1="2" x2="20" y2="2" stroke="#71717a" strokeWidth="1.25" strokeDasharray="4 3" />
                  </svg>
                  <span className="text-[9px] text-zinc-500">Hold</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-10 flex items-center justify-center pb-3">
              <span className="text-[10px] text-zinc-600">No chart data for this period</span>
            </div>
          )}
        </div>

        {/* ── Period badge ────────────────────────────────────────── */}
        <p className="px-5 pb-3 text-[11px] text-zinc-400 shrink-0">
          Results based on{" "}
          <span className="font-bold text-violet-300">{bestPeriodKey} period</span>
        </p>

        {/* ── Stats grid ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 px-5 pb-4 shrink-0">

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

          {/* vs. Hold */}
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

        </div>

        {/* ── Error ──────────────────────────────────────────────── */}
        {error && (
          <p className="mx-5 mb-3 text-[11px] text-red-400 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 shrink-0">
            {error}
          </p>
        )}

        {/* ── Footer: Save + Trade buttons ────────────────────────── */}
        <div className="flex items-center gap-2 px-5 pb-5 shrink-0">
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
            ) : "Save Strategy"}
          </button>

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
            ) : "Trade this Strategy"}
          </button>
        </div>
      </div>
    </div>
  );
}
