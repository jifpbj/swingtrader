"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { EquityCurvePoint } from "@/lib/indicators";
import type { BacktestPeriodKey, BacktestResult } from "@/types/market";
import { formatPercent } from "@/lib/utils";
import {
  ComposedChart, Area, Line, ResponsiveContainer, Tooltip, ReferenceLine, YAxis,
} from "recharts";

interface PerformanceCurveProps {
  chartData: Array<{
    strategy: number;
    hold: number;
    time: number;
    signal?: string;
    adjStrategy: number;
    adjHold: number;
    grayBand: number;
    redBand: number;
    greenBand: number;
  }>;
  yDomain: [number, number];
  refY100: number;
  timeframe: string;
  result: BacktestResult | null;
  chartPeriod: BacktestPeriodKey;
  viewMode: "pct" | "val";
  initialInvestment: number;
  isAnimating?: boolean;
}

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Generate random strategy deltas (relative to hold) for the scan animation. */
function makeScanDeltas(points: number, yRange: number) {
  const maxSwing = yRange * 0.35;           // strategy can swing ±35% of the chart range
  let delta = (Math.random() - 0.6) * maxSwing * 0.5; // start slightly negative so it often dips below
  const bias = (Math.random() - 0.55) * 0.4;          // slight downward bias so we see red zones
  return Array.from({ length: points }, () => {
    delta += bias + (Math.random() - 0.5) * maxSwing * 0.12;
    delta = Math.max(-maxSwing, Math.min(maxSwing, delta));
    return delta;
  });
}

export function PerformanceCurve({
  chartData,
  yDomain,
  refY100,
  timeframe,
  result,
  chartPeriod,
  viewMode,
  initialInvestment,
  isAnimating,
}: PerformanceCurveProps) {
  const periodData = result?.periods[chartPeriod];

  const strategyDisplay = useMemo(() => {
    if (!periodData?.sufficientData) return "—";
    if (viewMode === "pct") return formatPercent(periodData.strategyReturn * 100);
    return currencyFmt.format(initialInvestment * periodData.strategyReturn);
  }, [periodData, viewMode, initialInvestment]);

  const holdDisplay = useMemo(() => {
    if (!periodData?.sufficientData) return "—";
    if (viewMode === "pct") return formatPercent(periodData.holdReturn * 100);
    return currencyFmt.format(initialInvestment * periodData.holdReturn);
  }, [periodData, viewMode, initialInvestment]);

  const stopLossDisplay = useMemo(() => {
    if (!periodData?.sufficientData) return "—";
    return `${(periodData.maxDrawdown * 100).toFixed(1)}%`;
  }, [periodData]);

  const tradesDisplay = useMemo(() => {
    if (!periodData?.sufficientData) return "—";
    return String(periodData.tradeCount);
  }, [periodData]);

  // ── Scanning deltas — morphs every 350 ms while isAnimating ──────────────
  const [scanDeltas, setScanDeltas] = useState<number[]>([]);
  const scanRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const yRange = yDomain[1] - yDomain[0];

  useEffect(() => {
    if (!isAnimating) {
      if (scanRef.current) clearInterval(scanRef.current);
      setScanDeltas([]);
      return;
    }
    const pts = Math.max(chartData.length, 30);
    setScanDeltas(makeScanDeltas(pts, yRange));
    scanRef.current = setInterval(() => setScanDeltas(makeScanDeltas(pts, yRange)), 350);
    return () => { if (scanRef.current) clearInterval(scanRef.current); };
  }, [isAnimating, chartData.length, yRange]);

  // Build active data: real chart data with only adjStrategy + bands morphing
  const activeData = useMemo(() => {
    if (!isAnimating || !scanDeltas.length || !chartData.length) return chartData;
    return chartData.map((pt, i) => {
      const delta = scanDeltas[Math.min(i, scanDeltas.length - 1)];
      const adjS = pt.adjHold + delta;
      const base = Math.min(adjS, pt.adjHold);
      return {
        ...pt,
        adjStrategy: adjS,
        strategy: (pt.hold - 100) + delta + 100,
        grayBand: base,
        redBand: Math.max(0, pt.adjHold - adjS),
        greenBand: Math.max(0, adjS - pt.adjHold),
      };
    });
  }, [isAnimating, scanDeltas, chartData]);

  if (!isAnimating && chartData.length < 2) {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <span className="text-sm text-zinc-600">Insufficient data for {chartPeriod}</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Scan line + glow overlay — visible through the semi-transparent AIAnalyzeAnimation backdrop */}
      {isAnimating && (
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden rounded-2xl">
          {/* Amber scan line sweeping left → right */}
          <div
            className="absolute inset-y-0 w-0.5 animate-scan-line-x"
            style={{ background: "linear-gradient(to bottom, transparent, rgba(251,191,36,0.9), transparent)" }}
          />
          {/* Soft amber tint pulsing over the chart */}
          <div className="absolute inset-0 animate-pulse" style={{ background: "radial-gradient(ellipse at center, rgba(251,191,36,0.06) 0%, transparent 70%)" }} />
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={activeData} margin={{ top: 6, right: 2, bottom: 2, left: 2 }}>
          <YAxis domain={[0, yRange]} hide />

          {/* ── Stacked fill areas ───────────────────────────── */}
          <Area
            type="monotone"
            dataKey="grayBand"
            stackId="fills"
            fill="rgba(113,113,122,0.22)"
            stroke="none"
            isAnimationActive={isAnimating}
            animationDuration={320}
          />
          <Area
            type="monotone"
            dataKey="redBand"
            stackId="fills"
            fill="rgba(239,68,68,0.38)"
            stroke="none"
            isAnimationActive={isAnimating}
            animationDuration={320}
          />
          <Area
            type="monotone"
            dataKey="greenBand"
            stackId="fills"
            fill="rgba(52,211,153,0.38)"
            stroke="none"
            isAnimationActive={isAnimating}
            animationDuration={320}
          />

          <ReferenceLine y={refY100} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />

          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as EquityCurvePoint;
              const stratDelta = d.strategy - 100;
              const holdDelta  = d.hold - 100;
              const date = new Date(d.time * 1000);
              let label: string;
              if (timeframe === "1d") {
                // Daily bars: full date
                label = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              } else if (chartPeriod === "4H") {
                // Intraday-only window: time is enough
                label = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
              } else {
                // Multi-day intraday bars: show date + time
                label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
                  " " + date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
              }
              return (
                <div style={{ background: "rgba(9,9,11,0.92)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 10px", fontSize: 10, lineHeight: 1.6 }}>
                  <div style={{ color: "#71717a", marginBottom: 2 }}>{label}</div>
                  <div style={{ color: stratDelta >= 0 ? "#fbbf24" : "rgb(248 113 113)" }}>
                    Strat: {stratDelta >= 0 ? "+" : ""}{stratDelta.toFixed(1)}%
                  </div>
                  <div style={{ color: holdDelta >= 0 ? "#e4e4e7" : "#71717a" }}>
                    Hold: {holdDelta >= 0 ? "+" : ""}{holdDelta.toFixed(1)}%
                  </div>
                </div>
              );
            }}
            isAnimationActive={false}
          />

          {/* ── Line overlays (drawn on top of fills) ────────── */}
          {/* Strategy — solid amber */}
          <Line
            type="monotone"
            dataKey="adjStrategy"
            stroke="#fbbf24"
            strokeWidth={2}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dot={(props: any) => {
              const sig = props?.payload?.signal;
              if (!sig) return <g key={props.key} />;
              const color = sig === "buy" ? "#34d399" : sig === "stop" ? "#f59e0b" : "#ef4444";
              return (
                <circle
                  key={props.key}
                  cx={props.cx}
                  cy={props.cy}
                  r={3.5}
                  fill={color}
                  stroke="rgba(0,0,0,0.5)"
                  strokeWidth={1}
                />
              );
            }}
            isAnimationActive={isAnimating}
            animationDuration={320}
          />
          {/* Hold — dashed zinc, never animates */}
          <Line
            type="monotone"
            dataKey="adjHold"
            stroke="#71717a"
            strokeWidth={1.25}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* ── Legend ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-2 flex-wrap absolute bottom-20 left-2 z-10 pointer-events-none">
        <div className="flex items-center gap-1">
          <span className="w-4 h-px inline-block" style={{ background: "#fbbf24" }} />
          <span className="text-[9px] text-zinc-500">Strategy</span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="w-4 h-px inline-block"
            style={{ borderTop: "1px dashed #71717a", background: "none" }}
          />
          <span className="text-[9px] text-zinc-500">Hold</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-[9px] text-zinc-500">Buy</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          <span className="text-[9px] text-zinc-500">Sell</span>
        </div>
      </div>

      {/* ── Bold overlay metrics ───────────────────────────── */}
      <div className="absolute bottom-2 left-0 right-0 flex items-end justify-around px-4 pointer-events-none z-10">
        {/* Strategy */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Strategy</span>
          <span className={`text-3xl font-black font-mono${isAnimating ? " animate-number-scramble" : ""}`}
            key={isAnimating ? `s-${strategyDisplay}` : "s"}
            style={{ color: "#fbbf24" }}>
            {strategyDisplay}
          </span>
        </div>
        {/* Hold */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Hold</span>
          <span className={`text-3xl font-black font-mono text-zinc-400${isAnimating ? " animate-number-scramble" : ""}`}
            key={isAnimating ? `h-${holdDisplay}` : "h"}>
            {holdDisplay}
          </span>
        </div>
        {/* Stop Loss */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Stop Loss</span>
          <span className={`text-3xl font-black font-mono text-red-400${isAnimating ? " animate-number-scramble" : ""}`}
            key={isAnimating ? `sl-${stopLossDisplay}` : "sl"}>
            {stopLossDisplay}
          </span>
        </div>
        {/* Trades */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Trades</span>
          <span className={`text-3xl font-black font-mono text-zinc-300${isAnimating ? " animate-number-scramble" : ""}`}
            key={isAnimating ? `t-${tradesDisplay}` : "t"}>
            {tradesDisplay}
          </span>
        </div>
      </div>
    </div>
  );
}
