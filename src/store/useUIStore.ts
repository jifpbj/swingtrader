"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { AlphaSignal, Indicators, Prediction, Timeframe } from "@/types/market";

export type IndicatorTab = "EMA" | "BB" | "RSI" | "MACD" | "TD9";
export type Theme = "light" | "dark" | "system";

interface UIState {
  // ─── Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;

  // ─── Active asset
  ticker: string;
  setTicker: (ticker: string) => void;

  // ─── Timeframe
  timeframe: Timeframe;
  setTimeframe: (tf: Timeframe) => void;

  // ─── Command palette
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;

  // ─── Signals feed
  signals: AlphaSignal[];
  addSignal: (signal: AlphaSignal) => void;
  clearSignals: () => void;

  // ─── Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // ─── Connection status
  wsConnected: boolean;
  setWsConnected: (connected: boolean) => void;

  // ─── Confidence score
  confidenceScore: number;
  setConfidenceScore: (score: number) => void;

  // ─── Live indicators (from WS)
  indicators: Indicators | null;
  setIndicators: (indicators: Indicators) => void;

  // ─── Live prediction (from WS)
  prediction: Prediction | null;
  setPrediction: (prediction: Prediction) => void;

  // ─── Active indicator tab — drives what's drawn on the chart
  activeIndicatorTab: IndicatorTab;
  setActiveIndicatorTab: (tab: IndicatorTab) => void;

  // ─── Shared: show BUY/SELL markers for indicator crossovers
  showSignalMarkers: boolean;
  setShowSignalMarkers: (v: boolean) => void;

  // ─── EMA config
  emaPeriod: number;
  setEmaPeriod: (v: number) => void;

  // ─── Bollinger Bands config
  bbPeriod: number;
  setBbPeriod: (v: number) => void;
  bbStdDev: number;
  setBbStdDev: (v: number) => void;

  // ─── RSI config
  rsiPeriod: number;
  setRsiPeriod: (v: number) => void;
  rsiOverbought: number;
  setRsiOverbought: (v: number) => void;
  rsiOversold: number;
  setRsiOversold: (v: number) => void;

  // ─── MACD config
  macdFastPeriod: number;
  setMacdFastPeriod: (v: number) => void;
  macdSlowPeriod: number;
  setMacdSlowPeriod: (v: number) => void;
  macdSignalPeriod: number;
  setMacdSignalPeriod: (v: number) => void;
}

export const useUIStore = create<UIState>()(
  subscribeWithSelector((set) => ({
    theme: "dark" as Theme,
    setTheme: (theme) => set({ theme }),

    ticker: "BTC/USDT",
    setTicker: (ticker) => set({ ticker }),

    timeframe: "15m",
    setTimeframe: (timeframe) => set({ timeframe }),

    searchOpen: false,
    setSearchOpen: (searchOpen) => set({ searchOpen }),

    signals: [],
    addSignal: (signal) => set((s) => ({ signals: [signal, ...s.signals].slice(0, 50) })),
    clearSignals: () => set({ signals: [] }),

    sidebarCollapsed: false,
    toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

    wsConnected: false,
    setWsConnected: (wsConnected) => set({ wsConnected }),

    confidenceScore: 0,
    setConfidenceScore: (confidenceScore) => set({ confidenceScore }),

    indicators: null,
    setIndicators: (indicators) => set({ indicators }),

    prediction: null,
    setPrediction: (prediction) => set({ prediction }),

    // Tab drives which indicator is active on the chart
    activeIndicatorTab: "EMA",
    setActiveIndicatorTab: (activeIndicatorTab) => set({ activeIndicatorTab }),

    showSignalMarkers: true,
    setShowSignalMarkers: (showSignalMarkers) => set({ showSignalMarkers }),

    emaPeriod: 20,
    setEmaPeriod: (emaPeriod) => set({ emaPeriod }),

    bbPeriod: 20,
    setBbPeriod: (bbPeriod) => set({ bbPeriod }),
    bbStdDev: 2.0,
    setBbStdDev: (bbStdDev) => set({ bbStdDev }),

    rsiPeriod: 14,
    setRsiPeriod: (rsiPeriod) => set({ rsiPeriod }),
    rsiOverbought: 70,
    setRsiOverbought: (rsiOverbought) => set({ rsiOverbought }),
    rsiOversold: 30,
    setRsiOversold: (rsiOversold) => set({ rsiOversold }),

    macdFastPeriod: 12,
    setMacdFastPeriod: (macdFastPeriod) => set({ macdFastPeriod }),
    macdSlowPeriod: 26,
    setMacdSlowPeriod: (macdSlowPeriod) => set({ macdSlowPeriod }),
    macdSignalPeriod: 9,
    setMacdSignalPeriod: (macdSignalPeriod) => set({ macdSignalPeriod }),
  }))
);
