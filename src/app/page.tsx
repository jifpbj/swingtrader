"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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

export default function TradingDashboard() {
  useLivePrice();
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
        <main className="flex flex-1 overflow-hidden gap-3 p-3">
          {/* ─── Left: Chart + Indicator Ribbon ─── */}
          <div className="flex flex-col flex-1 gap-3 min-w-0 overflow-hidden">
            {/* Chart area */}
            <div className="glass rounded-2xl flex-1 overflow-hidden relative min-h-0">
              <ChartContainer />
            </div>

            {/* Indicator ribbon */}
            <div className="rounded-2xl shrink-0">
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
          <aside
            className="flex flex-col gap-3 shrink-0 overflow-y-auto min-w-[300px] max-w-[65vw]"
            style={{ width: `${rightPanelWidth}px` }}
          >
            {/* Trade CTA */}
            <TradeStrategyWidget />

            {/* Indicator config + Backtest — adjacent */}
            <IndicatorPanel />
            <BacktestPanel />

            {/* Paper trading */}
            <div id="paper-trading-panel">
              <PaperTradingPanel />
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
