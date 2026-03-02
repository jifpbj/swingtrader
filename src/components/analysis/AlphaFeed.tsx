"use client";

import { useEffect, useRef } from "react";
import { useUIStore } from "@/store/useUIStore";
import { useMockData, generateMockSignal } from "@/hooks/useMockData";
import { cn, formatPrice } from "@/lib/utils";
import type { AlphaSignal } from "@/types/market";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Clock,
  Trash2,
} from "lucide-react";

const DIRECTION_CONFIG = {
  bullish: {
    Icon: TrendingUp,
    textColor: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    dot: "bg-emerald-400",
  },
  bearish: {
    Icon: TrendingDown,
    textColor: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
    dot: "bg-red-400",
  },
  neutral: {
    Icon: Minus,
    textColor: "text-zinc-400",
    bgColor: "bg-zinc-500/10",
    borderColor: "border-zinc-500/20",
    dot: "bg-zinc-400",
  },
};

const STRENGTH_CONFIG = {
  strong: { label: "Strong", color: "text-white bg-white/10" },
  moderate: { label: "Moderate", color: "text-zinc-300 bg-white/5" },
  weak: { label: "Weak", color: "text-zinc-500 bg-white/5" },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function SignalCard({ signal, isNew }: { signal: AlphaSignal; isNew: boolean }) {
  const { Icon, textColor, bgColor, borderColor, dot } =
    DIRECTION_CONFIG[signal.direction];
  const strength = STRENGTH_CONFIG[signal.strength];

  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex flex-col gap-2 transition-all",
        bgColor,
        borderColor,
        isNew && "animate-fade-up"
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "size-6 rounded-lg flex items-center justify-center shrink-0",
              bgColor,
              "border",
              borderColor
            )}
          >
            <Icon className={cn("size-3.5", textColor)} />
          </div>
          <div>
            <span className="text-xs font-semibold text-white leading-tight">
              {signal.title}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider",
                  strength.color
                )}
              >
                {strength.label}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-white/5 text-zinc-400">
                {signal.timeframe}
              </span>
            </div>
          </div>
        </div>

        {/* Confidence */}
        <div className="flex flex-col items-end shrink-0">
          <div className={cn("text-sm font-bold font-mono tabular-nums", textColor)}>
            {signal.confidence}%
          </div>
          <div className="flex items-center gap-0.5 text-[9px] text-zinc-500">
            <Clock className="size-2.5" />
            {timeAgo(signal.timestamp)}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-[11px] text-zinc-400 leading-relaxed">
        {signal.description}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-zinc-500">
          @ ${formatPrice(signal.price)}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full shrink-0 animate-pulse", dot)} />
          <span className={cn("text-[10px] font-medium capitalize", textColor)}>
            {signal.direction}
          </span>
        </div>
      </div>
    </div>
  );
}

export function AlphaFeed() {
  const ticker = useUIStore((s) => s.ticker);
  const signals = useUIStore((s) => s.signals);
  const addSignal = useUIStore((s) => s.addSignal);
  const clearSignals = useUIStore((s) => s.clearSignals);
  const scrollRef = useRef<HTMLDivElement>(null);
  const newestIdRef = useRef<string | null>(null);

  // Seed initial signals on mount
  useEffect(() => {
    const initial = Array.from({ length: 5 }, (_, i) => ({
      ...generateMockSignal(ticker),
      timestamp: Date.now() - (5 - i) * 45_000,
    }));
    initial.forEach(addSignal);
  }, [ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  useMockData(ticker, { onSignal: addSignal });

  // Track newest
  const latestId = signals[0]?.id;
  const isNewSignal = latestId !== newestIdRef.current;
  useEffect(() => {
    newestIdRef.current = latestId ?? null;
  }, [latestId]);

  return (
    <div className="glass rounded-2xl flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-amber-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Alpha Feed
          </span>
          {signals.length > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/15 text-amber-400">
              {signals.length}
            </span>
          )}
        </div>
        <button
          onClick={clearSignals}
          className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-600 hover:text-zinc-300 transition-colors"
          title="Clear feed"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* Signal list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2">
            <Zap className="size-6 opacity-30" />
            <span className="text-xs">Waiting for signals…</span>
          </div>
        ) : (
          signals.map((signal, i) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              isNew={i === 0 && isNewSignal}
            />
          ))
        )}
      </div>
    </div>
  );
}
