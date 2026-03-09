"use client";

import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";
import { FlaskConical } from "lucide-react";
import { getPopularTickers } from "@/lib/demoPriceCache";

/**
 * Pill toggle that switches between live backend data and local mock data.
 * On entry to demo mode, picks a random popular ticker with a real price.
 */
export function DemoModeToggle({ showLabel = true }: { showLabel?: boolean }) {
  const demoMode    = useUIStore((s) => s.demoMode);
  const setDemoMode = useUIStore((s) => s.setDemoMode);
  const setTicker   = useUIStore((s) => s.setTicker);

  async function handleClick() {
    const entering = !demoMode;
    setDemoMode(entering);
    if (entering) {
      // Pick a random popular ticker so demo starts with a realistic symbol + price
      const tickers = await getPopularTickers();
      if (tickers.length > 0) {
        const pick = tickers[Math.floor(Math.random() * tickers.length)];
        setTicker(pick.ticker);
      }
    }
  }

  return (
    <button
      onClick={handleClick}
      title={demoMode ? "Exit demo mode" : "Enter demo mode (mock data)"}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all select-none",
        demoMode
          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
          : "glass text-muted-foreground hover:text-foreground border border-white/5 hover:border-white/10",
      )}
    >
      <FlaskConical className="size-3.5 shrink-0" />
      {showLabel && <span>Demo</span>}
    </button>
  );
}
