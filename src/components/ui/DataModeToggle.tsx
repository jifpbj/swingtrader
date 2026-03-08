"use client";

import { useEffect, useRef, useState } from "react";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/useUIStore";
import { useAlpacaStore } from "@/store/useAlpacaStore";

/**
 * Three-way pill that unifies Demo / Paper / Live mode selection.
 *
 * - Demo  : amber — uses local mock data, no backend required
 * - Paper : yellow — real market data, simulated orders
 * - Live  : emerald — real market data, real orders (confirmation required)
 *
 * A small animated pulse dot appears on the active real-data button
 * (Paper or Live) when the WebSocket is connected.
 */
export function DataModeToggle() {
  const demoMode    = useUIStore((s) => s.demoMode);
  const setDemoMode = useUIStore((s) => s.setDemoMode);
  const wsConnected = useUIStore((s) => s.wsConnected);

  const tradingMode    = useAlpacaStore((s) => s.tradingMode);
  const setTradingMode = useAlpacaStore((s) => s.setTradingMode);
  const account        = useAlpacaStore((s) => s.account);

  const [showComingSoon, setShowComingSoon] = useState(false);
  const comingSoonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Which of the three slots is highlighted
  const active = demoMode ? "demo" : tradingMode; // "demo" | "paper" | "live"

  function handlePaper() {
    setDemoMode(false);
    setTradingMode("paper");
  }

  function handleLive() {
    setShowComingSoon(true);
    if (comingSoonTimer.current) clearTimeout(comingSoonTimer.current);
    comingSoonTimer.current = setTimeout(() => setShowComingSoon(false), 2500);
  }

  useEffect(() => () => { if (comingSoonTimer.current) clearTimeout(comingSoonTimer.current); }, []);

  // Pulse dot: show on the active real-data button when WS is up
  function PulseDot() {
    return (
      <span className="relative flex size-1.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
        <span className="relative inline-flex rounded-full size-1.5 bg-current" />
      </span>
    );
  }

  return (
    <>
      <div className="flex items-center gap-0.5 glass rounded-lg px-0.5 py-0.5 text-xs">
        {/* Demo */}
        <button
          onClick={() => setDemoMode(true)}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-all",
            active === "demo"
              ? "bg-amber-500/20 text-amber-400"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <FlaskConical className="size-3 shrink-0" />
          Demo
        </button>

        {/* Paper */}
        <button
          onClick={handlePaper}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all",
            active === "paper"
              ? "bg-yellow-500/20 text-yellow-400"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Paper
          {active === "paper" && wsConnected && <PulseDot />}
        </button>

        {/* Live */}
        <div className="relative">
          <button
            onClick={handleLive}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all",
              active === "live"
                ? "bg-emerald-500/20 text-emerald-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Live
            {active === "live" && wsConnected && <PulseDot />}
          </button>
          {/* Coming soon badge */}
          {showComingSoon && (
            <span className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30 pointer-events-none z-50">
              Coming Soon!
            </span>
          )}
        </div>
      </div>

    </>
  );
}
