"use client";

import { useMemo } from "react";
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

export function PerformanceCurve({
  chartData,
  yDomain,
  refY100,
  timeframe,
  result,
  chartPeriod,
  viewMode,
  initialInvestment,
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

  if (chartData.length < 2) {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <span className="text-sm text-zinc-600">Insufficient data for {chartPeriod}</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 6, right: 2, bottom: 2, left: 2 }}>
          {/* Y-axis domain is [0, yMax-yMin] matching the offset data */}
          <YAxis domain={[0, yDomain[1] - yDomain[0]]} hide />

          {/* ── Stacked fill areas ───────────────────────────── */}
          {/* Layer 1: grey — always fills from 0 up to min(strategy,hold) */}
          <Area
            type="monotone"
            dataKey="grayBand"
            stackId="fills"
            fill="rgba(113,113,122,0.22)"
            stroke="none"
            isAnimationActive={false}
          />
          {/* Layer 2: red — from min(s,h) up to hold (strategy below hold) */}
          <Area
            type="monotone"
            dataKey="redBand"
            stackId="fills"
            fill="rgba(239,68,68,0.38)"
            stroke="none"
            isAnimationActive={false}
          />
          {/* Layer 3: green — from hold up to strategy (strategy above hold) */}
          <Area
            type="monotone"
            dataKey="greenBand"
            stackId="fills"
            fill="rgba(52,211,153,0.38)"
            stroke="none"
            isAnimationActive={false}
          />

          {/* Start-of-period reference line */}
          <ReferenceLine y={refY100} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />

          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as EquityCurvePoint;
              const stratDelta = d.strategy - 100;
              const holdDelta  = d.hold - 100;
              const date = new Date(d.time * 1000);
              const label = ["1m","5m","15m"].includes(timeframe)
                ? date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
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
            isAnimationActive={false}
          />
          {/* Hold — dashed zinc */}
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
          <span className="text-3xl font-black font-mono" style={{ color: "#fbbf24" }}>
            {strategyDisplay}
          </span>
        </div>
        {/* Hold */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Hold</span>
          <span className="text-3xl font-black font-mono text-zinc-400">
            {holdDisplay}
          </span>
        </div>
        {/* Stop Loss */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Stop Loss</span>
          <span className="text-3xl font-black font-mono text-red-400">
            {stopLossDisplay}
          </span>
        </div>
        {/* Trades */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Trades</span>
          <span className="text-3xl font-black font-mono text-zinc-300">
            {tradesDisplay}
          </span>
        </div>
      </div>
    </div>
  );
}
