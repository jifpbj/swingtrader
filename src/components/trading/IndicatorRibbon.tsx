"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  Tooltip,
} from "recharts";
import { generateMockIndicators } from "@/hooks/useMockData";
import { useUIStore } from "@/store/useUIStore";
import type { Indicators } from "@/types/market";
import { cn, formatVolume } from "@/lib/utils";
import { Activity, TrendingUp, Cpu } from "lucide-react";

// ─── RSI Gauge ────────────────────────────────────────────────────────────────
function RSIGauge({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const zone =
    pct >= 70
      ? { label: "Overbought", color: "text-red-400", bg: "bg-red-500" }
      : pct <= 30
      ? { label: "Oversold", color: "text-emerald-400", bg: "bg-emerald-500" }
      : { label: "Neutral", color: "text-zinc-400", bg: "bg-zinc-400" };

  // Arc SVG
  const r = 36;
  const circumference = Math.PI * r; // semicircle
  const offset = circumference * (1 - pct / 100);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative size-20">
        <svg viewBox="0 0 80 48" className="w-full overflow-visible">
          {/* Track */}
          <path
            d="M 8 44 A 32 32 0 0 1 72 44"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d="M 8 44 A 32 32 0 0 1 72 44"
            fill="none"
            stroke={
              pct >= 70
                ? "rgba(239,68,68,0.9)"
                : pct <= 30
                ? "rgba(34,197,94,0.9)"
                : "rgba(113,113,122,0.9)"
            }
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${offset}`}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
          {/* Value label */}
          <text x="40" y="38" textAnchor="middle" className="fill-white" fontSize="11" fontWeight="700" fontFamily="monospace">
            {pct.toFixed(0)}
          </text>
        </svg>
      </div>
      <span className={cn("text-[10px] font-medium", zone.color)}>{zone.label}</span>
    </div>
  );
}

// ─── MACD Histogram ───────────────────────────────────────────────────────────
function MACDChart({
  current,
  signal,
  histogram,
}: {
  current: number;
  signal: number;
  histogram: number;
}) {
  const [history, setHistory] = useState<
    Array<{ h: number; positive: boolean }>
  >(() =>
    Array.from({ length: 20 }, () => {
      const v = (Math.random() - 0.5) * 100;
      return { h: v, positive: v >= 0 };
    })
  );

  useEffect(() => {
    setHistory((prev) => [
      ...prev.slice(-19),
      { h: histogram, positive: histogram >= 0 },
    ]);
  }, [histogram]);

  return (
    <div className="flex flex-col gap-1 flex-1 min-w-0">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-zinc-500">MACD</span>
        <div className="flex gap-2 font-mono">
          <span className={current >= signal ? "text-emerald-400" : "text-red-400"}>
            {current.toFixed(1)}
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-400">{signal.toFixed(1)}</span>
        </div>
      </div>
      <div className="h-14">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={history} margin={{ top: 2, bottom: 2 }}>
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
            <Tooltip
              content={<span />}
              cursor={false}
            />
            <Bar dataKey="h" radius={[2, 2, 0, 0]}>
              {history.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.positive
                      ? "rgba(34,197,94,0.7)"
                      : "rgba(239,68,68,0.7)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Regime Score ─────────────────────────────────────────────────────────────
function RegimeScore({ value }: { value: number }) {
  // -1 (bear) → +1 (bull), displayed as percentage of bar
  const pct = ((value + 1) / 2) * 100;
  const isBull = value > 0.1;
  const isBear = value < -0.1;

  const label = isBull ? "Bull Regime" : isBear ? "Bear Regime" : "Neutral";
  const color = isBull ? "from-emerald-500 to-emerald-400" : isBear ? "from-red-500 to-red-400" : "from-zinc-500 to-zinc-400";
  const textColor = isBull ? "text-emerald-400" : isBear ? "text-red-400" : "text-zinc-400";

  return (
    <div className="flex flex-col gap-2 min-w-[100px]">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-zinc-500">Regime</span>
        <span className={cn("font-mono font-semibold", textColor)}>
          {value.toFixed(2)}
        </span>
      </div>
      {/* Track */}
      <div className="relative h-2 rounded-full bg-white/5 overflow-hidden">
        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10" />
        {/* Indicator */}
        <div
          className={cn(
            "absolute top-0 bottom-0 rounded-full bg-gradient-to-r transition-all duration-700",
            color
          )}
          style={{
            left: value >= 0 ? "50%" : `${pct}%`,
            width: `${Math.abs(value) * 50}%`,
          }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-zinc-600">
        <span>Bear</span>
        <span className={cn("font-medium", textColor)}>{label}</span>
        <span>Bull</span>
      </div>
    </div>
  );
}

// ─── ATR Pill ────────────────────────────────────────────────────────────────
function ATRDisplay({ atr, price }: { atr: number; price: number }) {
  const pct = (atr / price) * 100;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-zinc-500">ATR</span>
      <span className="font-mono text-sm text-white font-medium">
        {atr.toFixed(0)}
      </span>
      <span className="text-[10px] text-zinc-500">{pct.toFixed(2)}%</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function IndicatorRibbon() {
  const liveIndicators = useUIStore((s) => s.indicators);

  // Fall back to mock data until the first WS indicator message arrives
  const [mockIndicators] = useState<Indicators>(() =>
    generateMockIndicators(67_000)
  );
  const indicators = liveIndicators ?? mockIndicators;

  return (
    <div className="glass-bright border-t border-white/5 px-4 py-3 shrink-0">
      <div className="flex items-stretch gap-6 overflow-x-auto">
        {/* Section label */}
        <div className="flex items-center gap-2 shrink-0">
          <Activity className="size-4 text-zinc-500" />
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
            Indicators
          </span>
        </div>

        <div className="h-px w-px bg-white/5 self-stretch" />

        {/* RSI */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 self-start">
            <TrendingUp className="size-3" />
            RSI(14)
          </div>
          <RSIGauge value={indicators.rsi} />
        </div>

        <div className="h-px w-px bg-white/5 self-stretch" />

        {/* MACD */}
        <MACDChart
          current={indicators.macd}
          signal={indicators.macdSignal}
          histogram={indicators.macdHistogram}
        />

        <div className="h-px w-px bg-white/5 self-stretch" />

        {/* Regime Score */}
        <div className="shrink-0 w-36 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-2">
            <Cpu className="size-3" />
            AI Regime
          </div>
          <RegimeScore value={indicators.regimeScore} />
        </div>

        <div className="h-px w-px bg-white/5 self-stretch" />

        {/* ATR */}
        <div className="shrink-0 flex flex-col justify-center">
          <ATRDisplay atr={indicators.atr} price={67_000} />
        </div>

        <div className="h-px w-px bg-white/5 self-stretch" />

        {/* Volume */}
        <div className="shrink-0 flex flex-col justify-center gap-1">
          <span className="text-[10px] text-zinc-500">Vol 24h</span>
          <span className="font-mono text-sm text-white font-medium">
            {formatVolume(indicators.volume24h)}
          </span>
          <span className="text-[10px] text-zinc-500">USDT</span>
        </div>
      </div>
    </div>
  );
}
