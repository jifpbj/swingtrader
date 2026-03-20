"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useUIStore } from "@/store/useUIStore";
import type { TradeRecord } from "@/types/trade";

interface ChartPoint {
  date: string;
  cumPnl: number;
}

interface Props {
  trades: TradeRecord[];
}

const currFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function PnLChart({ trades }: Props) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";

  if (trades.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground/70">
        No completed trades in this period yet.
      </div>
    );
  }

  // Build cumulative P/L series sorted by exit time
  const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime);
  let cumPnl = 0;
  const data: ChartPoint[] = sorted.map((t) => {
    cumPnl += t.pnlDollars;
    return {
      date: dateFmt.format(new Date(t.exitTime * 1000)),
      cumPnl,
    };
  });

  // Prepend a zero point at the start
  const startDate = dateFmt.format(new Date(sorted[0].entryTime * 1000));
  const chartData = [{ date: startDate, cumPnl: 0 }, ...data];

  const maxVal = Math.max(...chartData.map((d) => d.cumPnl));
  const minVal = Math.min(...chartData.map((d) => d.cumPnl));
  const lineColor = chartData[chartData.length - 1].cumPnl >= 0 ? "#34d399" : "#f87171";

  const tickColor  = isDark ? "#71717a" : "#6b7280";
  const gridColor  = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
  const refColor   = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
  const tipBg      = isDark ? "rgba(9,9,11,0.95)" : "rgba(255,255,255,0.97)";
  const tipBorder  = isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)";
  const tipColor   = isDark ? "#e4e4e7" : "#1a1a2e";
  const tipLabel   = isDark ? "#71717a" : "#6b7280";

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey="date"
          tick={{ fill: tickColor, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: tickColor, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => currFmt.format(v)}
          domain={[Math.min(minVal * 1.1, -1), Math.max(maxVal * 1.1, 1)]}
          width={64}
        />
        <Tooltip
          contentStyle={{
            background: tipBg,
            border: tipBorder,
            borderRadius: "8px",
            fontSize: 11,
            color: tipColor,
          }}
          formatter={(value: number | undefined) => [value != null ? currFmt.format(value) : "—", "Cumulative P/L"] as [string, string]}
          labelStyle={{ color: tipLabel, marginBottom: 4 }}
        />
        <ReferenceLine y={0} stroke={refColor} strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="cumPnl"
          stroke={lineColor}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: lineColor }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
