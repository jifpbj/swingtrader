"use client";

import React, { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
import { useAuthStore } from "@/store/useAuthStore";

export default function TradingDashboard() {
  useLivePrice();
  useAutoTrader();
  const user = useAuthStore((s) => s.user);
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
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
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top navigation bar */}
      <TopBar />

      {/* Command-K search overlay */}
      <TickerSearch />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar nav */}
        <Sidebar />

        {/* Dashboard body */}
        <main className="flex flex-col md:flex-row flex-1 overflow-hidden gap-3 p-3">
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

          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={onResizeHandlePointerDown}
            className="hidden md:flex w-1.5 -mx-1 cursor-col-resize items-stretch justify-center group"
          >
            <span className="w-px rounded-full bg-white/8 transition-colors group-hover:bg-amber-400/70" />
          </div>

          {/* ─── Right: Analysis Panel ─── */}
          {/* Mobile: flex-1 takes remaining height, scrolls internally. Desktop: fixed-width side panel. */}
          <aside
            className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto overscroll-y-contain w-full md:shrink-0 md:flex-none md:min-w-[300px] md:max-w-[65vw] md:[width:var(--right-panel-w)]"
            style={{ "--right-panel-w": `${rightPanelWidth}px` } as React.CSSProperties}
          >
            {/* Trade CTA */}
            <TradeStrategyWidget />

            {/* Indicator config + Backtest — adjacent */}
            <IndicatorPanel />
            <BacktestPanel />

            {/* Paper trading — only for signed-in users */}
            {user && (
              <div id="paper-trading-panel">
                <PaperTradingPanel />
              </div>
            )}
          </aside>
        </main>
      </div>
    </div>
  );
}
