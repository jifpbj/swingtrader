"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useUIStore } from "@/store/useUIStore";
import type { AlpacaPortfolioHistory } from "@/types/market";

interface ChartPoint {
  date: string;
  equity: number;
}

interface Props {
  history: AlpacaPortfolioHistory | null;
}

const currFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function EquityChart({ history }: Props) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";

  if (!history || history.timestamp.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground/70">
        No portfolio history available.
      </div>
    );
  }

  const data: ChartPoint[] = history.timestamp.map((ts, i) => ({
    date: dateFmt.format(new Date(ts * 1000)),
    equity: history.equity[i],
  }));

  const maxVal = Math.max(...data.map((d) => d.equity));
  const minVal = Math.min(...data.map((d) => d.equity));
  const padding = (maxVal - minVal) * 0.1 || 1;

  const tickColor  = isDark ? "#71717a" : "#6b7280";
  const gridColor  = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
  const tipBg      = isDark ? "rgba(9,9,11,0.95)" : "rgba(255,255,255,0.97)";
  const tipBorder  = isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)";
  const tipColor   = isDark ? "#e4e4e7" : "#1a1a2e";
  const tipLabel   = isDark ? "#71717a" : "#6b7280";

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
          </linearGradient>
        </defs>
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
          domain={[minVal - padding, maxVal + padding]}
          width={72}
        />
        <Tooltip
          contentStyle={{
            background: tipBg,
            border: tipBorder,
            borderRadius: "8px",
            fontSize: 11,
            color: tipColor,
          }}
          formatter={(value: number | undefined) =>
            [value != null ? currFmt.format(value) : "—", "Account Value"] as [string, string]
          }
          labelStyle={{ color: tipLabel, marginBottom: 4 }}
        />
        <Area
          type="monotone"
          dataKey="equity"
          stroke="#34d399"
          strokeWidth={2}
          fill="url(#equityGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
