"use client";

import { cn } from "@/lib/utils";

export type TimePeriod = "1W" | "30D" | "90D" | "6M" | "1Y" | "YTD";

export const TIME_PERIODS: TimePeriod[] = ["1W", "30D", "90D", "6M", "1Y", "YTD"];

interface Props {
  value: TimePeriod;
  onChange: (p: TimePeriod) => void;
}

export function TimePeriodSelector({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5 glass rounded-xl px-1 py-1">
      {TIME_PERIODS.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
            value === p
              ? "bg-emerald-500/20 text-emerald-300 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5",
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

/** Returns the cutoff Unix-ms timestamp for a given period */
export function periodToStartMs(period: TimePeriod): number {
  const now = Date.now();
  switch (period) {
    case "1W":  return now - 7  * 24 * 3600 * 1000;
    case "30D": return now - 30 * 24 * 3600 * 1000;
    case "90D": return now - 90 * 24 * 3600 * 1000;
    case "6M":  return now - 180 * 24 * 3600 * 1000;
    case "1Y":  return now - 365 * 24 * 3600 * 1000;
    case "YTD": {
      const y = new Date().getFullYear();
      return new Date(y, 0, 1).getTime();
    }
  }
}
