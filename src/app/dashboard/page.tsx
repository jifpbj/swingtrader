"use client";

import React, { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChartContainer } from "@/components/trading/ChartContainer";
import { IndicatorRibbon } from "@/components/trading/IndicatorRibbon";
import { BacktestPanel } from "@/components/trading/BacktestPanel";
import { IndicatorPanel } from "@/components/trading/IndicatorPanel";
import { TradeStrategyWidget } from "@/components/trading/TradeStrategyWidget";
import { PaperTradingPanel } from "@/components/trading/PaperTradingPanel";
import { TickerSearch } from "@/components/ui/TickerSearch";
import { useLivePrice } from "@/hooks/useLivePrice";
import { useAutoTrader } from "@/hooks/useAutoTrader";
import { useTradeNotifications } from "@/hooks/useTradeNotifications";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/lib/utils";

export default function TradingDashboard() {
  useLivePrice();
  useAutoTrader();
  useTradeNotifications();
  const user = useAuthStore((s) => s.user);
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onResizeHandlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragStateRef.current = { startX: e.clientX, startWidth: rightPanelWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [rightPanelWidth]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const delta = dragState.startX - e.clientX;
      const viewportMax = Math.floor(window.innerWidth * 0.65);
      const next = dragState.startWidth + delta;
      setRightPanelWidth(Math.min(Math.max(next, 300), Math.max(300, viewportMax)));
    };

    const onPointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen md:h-screen md:overflow-hidden">
      {/* Top navigation bar */}
      <TopBar />

      {/* Command-K search overlay */}
      <TickerSearch />

      {/* Main content */}
      <div className="flex flex-1 md:overflow-hidden">
        {/* Sidebar nav */}
        <Sidebar />

        {/* Dashboard body */}
        <main className="flex flex-col md:flex-row flex-1 gap-3 p-3 md:overflow-hidden">
          {/* ─── Left: Chart + Indicator Ribbon ─── */}
          {/* Mobile: shrink-0 (chart has explicit h-[50vh]). Desktop: flex-1 fills remaining height. */}
          <div className="flex flex-col shrink-0 gap-3 min-w-0 md:flex-1 md:overflow-hidden">
            {/* Chart area: 50vh on mobile, flex-1 on desktop */}
            <div className="glass rounded-2xl overflow-hidden relative h-[50vh] md:flex-1 md:min-h-0">
              <ChartContainer />
            </div>

            {/* Indicator ribbon — desktop only */}
            <div className="rounded-2xl shrink-0 hidden md:block">
              <IndicatorRibbon />
            </div>
          </div>

          {/* Resize handle — hidden when right panel is collapsed */}
          {!rightCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={onResizeHandlePointerDown}
              className="hidden md:flex w-1.5 -mx-1 cursor-col-resize items-stretch justify-center group"
            >
              <span className="w-px rounded-full bg-white/8 transition-colors group-hover:bg-amber-400/70" />
            </div>
          )}

          {/* ─── Right: Analysis Panel ─── */}
          {/* Mobile: flex-1 takes remaining height, scrolls internally. Desktop: fixed-width side panel. */}
          <aside
            className={cn(
              "flex flex-col min-h-0 flex-1 w-full overflow-y-visible md:overflow-y-auto md:overscroll-y-contain",
              rightCollapsed
                ? "md:flex-none md:w-10 md:overflow-hidden"
                : "gap-3 md:shrink-0 md:flex-none md:min-w-[300px] md:max-w-[65vw] md:w-(--right-panel-w)",
            )}
            style={!rightCollapsed ? ({ "--right-panel-w": `${rightPanelWidth}px` } as React.CSSProperties) : undefined}
          >
            {/* Desktop: toggle + Create Strategy row */}
            <div className="hidden md:flex items-center gap-2 mt-2 mx-2 shrink-0">
              <button
                onClick={() => setRightCollapsed((v) => !v)}
                className="p-2 rounded-xl text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-all shrink-0"
                title={rightCollapsed ? "Expand panel" : "Collapse panel"}
              >
                {rightCollapsed ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
              {!rightCollapsed && (
                <button className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors select-none">
                  Create Strategy
                </button>
              )}
            </div>

            {/* Panel content — hidden when collapsed on desktop */}
            <div className={cn("flex flex-col gap-3", rightCollapsed && "md:hidden")}>
              {/* Trade CTA */}
              <TradeStrategyWidget />

              {/* Backtest + Indicator config — adjacent */}
              <BacktestPanel />
              <IndicatorPanel />

              {/* Paper trading — only for signed-in users */}
              {user && (
                <div id="paper-trading-panel">
                  <PaperTradingPanel />
                </div>
              )}
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
