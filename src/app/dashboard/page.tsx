"use client";

import React, { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChartContainer } from "@/components/trading/ChartContainer";
import { PerformanceCurve } from "@/components/trading/PerformanceCurve";
import { PeriodSelector } from "@/components/trading/PeriodSelector";
import { CandlestickToggle } from "@/components/trading/CandlestickToggle";
import { AIAnalyzeAnimation } from "@/components/trading/AIAnalyzeAnimation";
import { IndicatorPanel } from "@/components/trading/IndicatorPanel";
import { TradeStrategyWidget } from "@/components/trading/TradeStrategyWidget";
import { PaperTradingPanel } from "@/components/trading/PaperTradingPanel";
import { LiveTradingPanel } from "@/components/trading/LiveTradingPanel";
import { StrategyResultModal } from "@/components/algo/StrategyResultModal";
import { TickerSearch } from "@/components/ui/TickerSearch";
import { useLivePrice } from "@/hooks/useLivePrice";
import { useAutoTrader } from "@/hooks/useAutoTrader";
import { useTradeNotifications } from "@/hooks/useTradeNotifications";
import { useBacktestData } from "@/hooks/useBacktestData";
import { useAuthStore } from "@/store/useAuthStore";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";

export default function TradingDashboard() {
  useLivePrice();
  useAutoTrader();
  useTradeNotifications();
  const user        = useAuthStore((s) => s.user);
  const tradingMode = useAlpacaStore((s) => s.tradingMode);
  const candlestickVisible = useUIStore((s) => s.candlestickVisible);
  const timeframe   = useUIStore((s) => s.timeframe);
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Backtest data hook — drives the PerformanceCurve and strategy controls
  const backtest = useBacktestData();

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
          {/* ─── Left/Center: Performance Curve + Indicators + Strategy ─── */}
          <div className="flex flex-col shrink-0 gap-3 min-w-0 md:flex-1 md:overflow-y-auto md:overscroll-y-contain">
            {/* Hero chart area */}
            <div className="glass rounded-2xl overflow-hidden relative h-[60vh] md:min-h-[400px] md:flex-1 md:min-h-0">
              {/* Period selector — top center (hidden when candlestick is active) */}
              {!candlestickVisible && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
                  <PeriodSelector />
                </div>
              )}

              {/* Candlestick toggle — top right */}
              <div className="absolute top-3 right-3 z-20">
                <CandlestickToggle />
              </div>

              {/* Chart content — swap between Performance Curve and Candlestick */}
              {candlestickVisible ? (
                <ChartContainer />
              ) : backtest.backtestLoading ? (
                <div className="flex items-center justify-center h-full gap-2 text-zinc-500">
                  <Loader2 className="size-5 animate-spin" />
                  <span className="text-sm">Loading performance data…</span>
                </div>
              ) : (
                <PerformanceCurve
                  chartData={backtest.chartData}
                  yDomain={backtest.yDomain}
                  refY100={backtest.refY100}
                  timeframe={timeframe}
                  result={backtest.result}
                  chartPeriod={backtest.chartPeriod}
                  viewMode={backtest.viewMode}
                  initialInvestment={backtest.initialInvestment}
                  isAnimating={backtest.analyzing}
                />
              )}

              {/* AI Analyze animation overlay */}
              <AIAnalyzeAnimation />
            </div>

            {/* Indicators Panel — below chart, larger fonts */}
            <IndicatorPanel />

            {/* Active Strategy Panel — below indicators, with huge glowing AI button */}
            <TradeStrategyWidget />
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

          {/* ─── Right: Portfolio Sidebar ─── */}
          <aside
            className={cn(
              "flex flex-col min-h-0 flex-1 w-full overflow-y-visible md:overflow-y-auto md:overscroll-y-contain",
              rightCollapsed
                ? "md:flex-none md:w-10 md:overflow-hidden"
                : "gap-3 md:shrink-0 md:flex-none md:min-w-[300px] md:max-w-[65vw] md:w-(--right-panel-w)",
            )}
            style={!rightCollapsed ? ({ "--right-panel-w": `${rightPanelWidth}px` } as React.CSSProperties) : undefined}
          >
            {/* Desktop: toggle + Portfolio heading */}
            <div className="hidden md:flex items-center gap-2 mt-2 mx-2 shrink-0">
              <button
                onClick={() => setRightCollapsed((v) => !v)}
                className="p-2 rounded-xl text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-all shrink-0"
                title={rightCollapsed ? "Expand panel" : "Collapse panel"}
              >
                {rightCollapsed ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
              {!rightCollapsed && (
                <span className="text-sm font-semibold text-zinc-200 select-none">
                  Portfolio
                </span>
              )}
            </div>

            {/* Panel content — hidden when collapsed on desktop */}
            <div className={cn("flex flex-col gap-3", rightCollapsed && "md:hidden")}>
              {/* Paper trading panel — visible when in paper mode */}
              {tradingMode === "paper" && (
                <div id="paper-trading-panel">
                  <PaperTradingPanel />
                </div>
              )}

              {/* Live trading panel — visible when in live mode (paid users) */}
              {tradingMode === "live" && user && (
                <div id="live-trading-panel">
                  <LiveTradingPanel />
                </div>
              )}
            </div>
          </aside>
        </main>
      </div>

      {/* ── AI Result Modal ──────────────────────────────────────────── */}
      {backtest.showModal && backtest.analysisResult && (
        <StrategyResultModal
          result={backtest.analysisResult}
          onClose={() => backtest.setShowModal(false)}
          onSaved={() => {
            backtest.setShowModal(false);
            backtest.setAnalysisResult(null);
          }}
        />
      )}
    </div>
  );
}
