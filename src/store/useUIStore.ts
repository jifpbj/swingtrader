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

  // ─── Live price stats (polled every 1s + daily bar for context)
  livePrice: number | null;
  priceOpen: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  setPriceStats: (stats: { livePrice?: number; priceOpen?: number; high24h?: number; low24h?: number; volume24h?: number }) => void;

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

  // ─── Demo mode (local mock data, no backend)
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;

}

export const useUIStore = create<UIState>()(
  subscribeWithSelector((set) => ({
    theme: "dark" as Theme,
    setTheme: (theme) => set({ theme }),

    ticker: "BTC/USD",
    setTicker: (ticker) => set({ ticker, livePrice: null, priceOpen: null, high24h: null, low24h: null, volume24h: null }),

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

    livePrice: null,
    priceOpen: null,
    high24h: null,
    low24h: null,
    volume24h: null,
    setPriceStats: (stats) => set((s) => ({
      livePrice:  stats.livePrice  ?? s.livePrice,
      priceOpen:  stats.priceOpen  ?? s.priceOpen,
      high24h:    stats.high24h    ?? s.high24h,
      low24h:     stats.low24h     ?? s.low24h,
      volume24h:  stats.volume24h  ?? s.volume24h,
    })),

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

    demoMode: false,
    setDemoMode: (demoMode) => set({ demoMode }),

  }))
);
