"use client";

import { useUIStore } from "@/store/useUIStore";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { CandlestickChart } from "lucide-react";
import { cn } from "@/lib/utils";

export function CandlestickToggle() {
  const visible = useUIStore((s) => s.candlestickVisible);
  const setVisible = useUIStore((s) => s.setCandlestickVisible);

  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            onClick={() => setVisible(!visible)}
            className={cn(
              "flex items-center justify-center size-9 rounded-xl transition-all",
              visible
                ? "bg-amber-500/20 text-amber-400 shadow-lg shadow-amber-500/10"
                : "glass text-zinc-500 hover:text-zinc-300 hover:bg-white/10",
            )}
          >
            <CandlestickChart className="size-5" />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="bottom"
            sideOffset={6}
            className="max-w-[220px] rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-xs text-zinc-300 shadow-xl animate-fade-up"
          >
            {visible
              ? "Hide candlestick chart"
              : "Show candlestick chart with real-time price data and indicator signals"}
            <TooltipPrimitive.Arrow className="fill-zinc-900" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
