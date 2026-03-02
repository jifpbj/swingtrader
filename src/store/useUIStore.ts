"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { AlphaSignal, Timeframe } from "@/types/market";

interface UIState {
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

  // ─── Layout
  showPredictiveOverlay: boolean;
  togglePredictiveOverlay: () => void;

  // ─── Confidence score
  confidenceScore: number;
  setConfidenceScore: (score: number) => void;
}

export const useUIStore = create<UIState>()(
  subscribeWithSelector((set) => ({
    ticker: "BTC/USDT",
    setTicker: (ticker) => set({ ticker }),

    timeframe: "15m",
    setTimeframe: (timeframe) => set({ timeframe }),

    searchOpen: false,
    setSearchOpen: (searchOpen) => set({ searchOpen }),

    signals: [],
    addSignal: (signal) =>
      set((s) => ({
        signals: [signal, ...s.signals].slice(0, 50), // cap at 50
      })),
    clearSignals: () => set({ signals: [] }),

    sidebarCollapsed: false,
    toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

    wsConnected: false,
    setWsConnected: (wsConnected) => set({ wsConnected }),

    showPredictiveOverlay: true,
    togglePredictiveOverlay: () =>
      set((s) => ({ showPredictiveOverlay: !s.showPredictiveOverlay })),

    confidenceScore: 0,
    setConfidenceScore: (confidenceScore) => set({ confidenceScore }),
  }))
);
