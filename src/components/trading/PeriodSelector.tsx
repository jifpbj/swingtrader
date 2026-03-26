"use client";

import { useUIStore, type PerformancePeriodKey } from "@/store/useUIStore";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

const PERIODS: { key: PerformancePeriodKey; label: string; tooltip: string }[] = [
  { key: "1D", label: "1D", tooltip: "1 Day" },
  { key: "5D", label: "5D", tooltip: "5 Trading Days" },
  { key: "1M", label: "1M", tooltip: "1 Month" },
  { key: "6M", label: "6M", tooltip: "6 Months" },
  { key: "YTD", label: "YTD", tooltip: "Year To Date" },
  { key: "1Y", label: "1Y", tooltip: "1 Year" },
  { key: "5Y", label: "5Y", tooltip: "5 Years" },
];

export function PeriodSelector() {
  const active = useUIStore((s) => s.performancePeriod);
  const setActive = useUIStore((s) => s.setPerformancePeriod);

  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <div className="flex items-center gap-1 glass rounded-xl px-1 py-1">
        {PERIODS.map(({ key, label, tooltip }) => (
          <TooltipPrimitive.Root key={key}>
            <TooltipPrimitive.Trigger asChild>
              <button
                onClick={() => setActive(key)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all",
                  active === key
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5",
                )}
              >
                {label}
              </button>
            </TooltipPrimitive.Trigger>
            <TooltipPrimitive.Portal>
              <TooltipPrimitive.Content
                side="bottom"
                sideOffset={6}
                className="rounded-lg bg-zinc-900 border border-white/10 px-3 py-1.5 text-xs text-zinc-300 shadow-xl animate-fade-up"
              >
                {tooltip}
                <TooltipPrimitive.Arrow className="fill-zinc-900" />
              </TooltipPrimitive.Content>
            </TooltipPrimitive.Portal>
          </TooltipPrimitive.Root>
        ))}
      </div>
    </TooltipPrimitive.Provider>
  );
}
