"use client";

import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChartContainer } from "@/components/trading/ChartContainer";
import { IndicatorRibbon } from "@/components/trading/IndicatorRibbon";
import { PredictiveGauge } from "@/components/analysis/PredictiveGauge";
import { BacktestPanel } from "@/components/trading/BacktestPanel";
import { IndicatorPanel } from "@/components/trading/IndicatorPanel";
import { TickerSearch } from "@/components/ui/TickerSearch";

export default function TradingDashboard() {
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

          {/* ─── Right: Analysis Panel ─── */}
          <aside className="flex flex-col gap-3 w-72 shrink-0 overflow-y-auto">
            {/* Predictive Gauge */}
            <PredictiveGauge />

            {/* Indicator config + Backtest — adjacent */}
            <IndicatorPanel />
            <BacktestPanel />
          </aside>
        </main>
      </div>
    </div>
  );
}
