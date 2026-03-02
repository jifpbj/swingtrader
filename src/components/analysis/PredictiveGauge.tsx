"use client";

import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
} from "recharts";
import { BrainCircuit, TrendingUp, TrendingDown, Minus } from "lucide-react";

function getScoreLabel(score: number): {
  label: string;
  sublabel: string;
  color: string;
  textColor: string;
  gradient: string;
  Icon: React.ElementType;
} {
  if (score >= 75)
    return {
      label: "Strong Bull",
      sublabel: "High conviction long",
      color: "rgba(34,197,94,0.8)",
      textColor: "text-emerald-400",
      gradient: "from-emerald-500/20 to-emerald-500/0",
      Icon: TrendingUp,
    };
  if (score >= 60)
    return {
      label: "Bullish",
      sublabel: "Moderate long bias",
      color: "rgba(34,197,94,0.6)",
      textColor: "text-emerald-400",
      gradient: "from-emerald-500/15 to-emerald-500/0",
      Icon: TrendingUp,
    };
  if (score >= 45)
    return {
      label: "Neutral",
      sublabel: "No clear directional edge",
      color: "rgba(113,113,122,0.7)",
      textColor: "text-zinc-400",
      gradient: "from-zinc-500/15 to-zinc-500/0",
      Icon: Minus,
    };
  if (score >= 30)
    return {
      label: "Bearish",
      sublabel: "Moderate short bias",
      color: "rgba(239,68,68,0.6)",
      textColor: "text-red-400",
      gradient: "from-red-500/15 to-red-500/0",
      Icon: TrendingDown,
    };
  return {
    label: "Strong Bear",
    sublabel: "High conviction short",
    color: "rgba(239,68,68,0.85)",
    textColor: "text-red-400",
    gradient: "from-red-500/20 to-red-500/0",
    Icon: TrendingDown,
  };
}

export function PredictiveGauge() {
  const rawScore = useUIStore((s) => s.confidenceScore);
  // Animate score up from 0 on first load with a demo value
  const score = rawScore === 0 ? 72 : rawScore;
  const meta = getScoreLabel(score);

  const data = [{ value: score, fill: meta.color }];

  return (
    <div className="glass rounded-2xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BrainCircuit className="size-4 text-emerald-400" />
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          AI Confidence
        </span>
      </div>

      {/* Gauge */}
      <div className={cn("rounded-xl p-3 bg-gradient-to-b", meta.gradient)}>
        <div className="relative h-32">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="80%"
              innerRadius="65%"
              outerRadius="95%"
              startAngle={180}
              endAngle={0}
              data={data}
            >
              {/* Background track */}
              <RadialBar
                dataKey="value"
                cornerRadius={6}
                background={{ fill: "rgba(255,255,255,0.04)" }}
              />
            </RadialBarChart>
          </ResponsiveContainer>

          {/* Center text overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
            <span
              className={cn(
                "text-3xl font-black font-mono tabular-nums leading-none transition-all",
                meta.textColor
              )}
            >
              {score.toFixed(0)}
            </span>
            <span className="text-[10px] text-zinc-500 mt-0.5">/ 100</span>
          </div>
        </div>
      </div>

      {/* Direction label */}
      <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2.5 glass-sm")}>
        <meta.Icon className={cn("size-4 shrink-0", meta.textColor)} />
        <div className="flex flex-col min-w-0">
          <span className={cn("text-sm font-bold leading-tight", meta.textColor)}>
            {meta.label}
          </span>
          <span className="text-[10px] text-zinc-500 truncate">{meta.sublabel}</span>
        </div>
      </div>

      {/* Probability bars */}
      <div className="flex flex-col gap-1.5">
        <ProbBar label="Up" pct={score} color="bg-emerald-500" />
        <ProbBar label="Down" pct={100 - score} color="bg-red-500" />
      </div>

      {/* Scale ticks */}
      <div className="flex justify-between text-[9px] text-zinc-600 mt-1">
        <span className="text-red-400/60">Bear</span>
        <span className="text-zinc-600">Neutral</span>
        <span className="text-emerald-400/60">Bull</span>
      </div>
    </div>
  );
}

function ProbBar({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-zinc-500 w-6">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${pct}%`, opacity: 0.7 }}
        />
      </div>
      <span className="text-[10px] font-mono text-zinc-400 w-6 text-right">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}
