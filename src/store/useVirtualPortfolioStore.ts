"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  VirtualAccount,
  VirtualPosition,
  VirtualTrade,
  EquitySnapshot,
  SignalEvent,
} from "@/types/paperPortfolio";

const INITIAL_CASH = 100_000;

interface VirtualPortfolioState {
  account: VirtualAccount;
  positions: VirtualPosition[];
  trades: VirtualTrade[];
  equityHistory: EquitySnapshot[];
  notificationsEnabled: boolean;

  /** Execute a buy — deducts cash, opens a position */
  executeBuy: (params: {
    strategyId: string;
    strategyName: string;
    ticker: string;
    price: number;
    qty: number;
    time: number; // Unix ms
  }) => void;

  /** Execute a sell — closes a position, records trade with P/L */
  executeSell: (params: {
    strategyId: string;
    ticker: string;
    price: number;
    time: number; // Unix ms
    exitReason?: "signal" | "trailing_stop";
  }) => void;

  /** Update current prices for all positions (mark-to-market) */
  updatePositionPrices: (prices: Record<string, number>) => void;

  /** Process historical signals for a strategy (backfill) */
  backfillSignals: (
    strategyId: string,
    strategyName: string,
    lotSizeDollars: number,
    signals: SignalEvent[],
  ) => void;

  /** Record an equity snapshot */
  recordEquitySnapshot: () => void;

  /** Toggle browser notifications */
  setNotificationsEnabled: (v: boolean) => void;

  /** Reset to initial $100K state */
  reset: () => void;
}

function makeId(): string {
  return `vt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function initialAccount(): VirtualAccount {
  return {
    equity: INITIAL_CASH,
    cash: INITIAL_CASH,
    buyingPower: INITIAL_CASH,
    createdAt: Date.now(),
  };
}

export const useVirtualPortfolioStore = create<VirtualPortfolioState>()(
  persist(
    (set, get) => ({
      account: initialAccount(),
      positions: [],
      trades: [],
      equityHistory: [],
      notificationsEnabled: false,

      executeBuy: ({ strategyId, strategyName, ticker, price, qty, time }) => {
        const cost = price * qty;
        set((s) => {
          if (s.account.cash < cost) return s; // insufficient funds
          // Check if we already have a position for this strategy
          const existing = s.positions.find(
            (p) => p.strategyId === strategyId && p.symbol === ticker,
          );
          if (existing) return s; // already in position

          const newPos: VirtualPosition = {
            symbol: ticker,
            qty,
            avgEntryPrice: price,
            currentPrice: price,
            unrealizedPl: 0,
            unrealizedPlPct: 0,
            strategyId,
            entryTime: time,
          };

          return {
            account: {
              ...s.account,
              cash: s.account.cash - cost,
              buyingPower: s.account.buyingPower - cost,
            },
            positions: [...s.positions, newPos],
          };
        });
      },

      executeSell: ({ strategyId, ticker, price, time, exitReason }) => {
        set((s) => {
          const posIdx = s.positions.findIndex(
            (p) => p.strategyId === strategyId && p.symbol === ticker,
          );
          if (posIdx === -1) return s; // no position to sell

          const pos = s.positions[posIdx];
          const pnlDollars = (price - pos.avgEntryPrice) * pos.qty;
          const pnlPercent = (price - pos.avgEntryPrice) / pos.avgEntryPrice;
          const proceeds = price * pos.qty;

          const trade: VirtualTrade = {
            id: makeId(),
            strategyId,
            strategyName:
              s.trades.find((t) => t.strategyId === strategyId)?.strategyName ??
              ticker,
            ticker,
            direction: "sell",
            entryPrice: pos.avgEntryPrice,
            exitPrice: price,
            qty: pos.qty,
            pnlDollars,
            pnlPercent,
            entryTime: pos.entryTime,
            exitTime: time,
            exitReason,
          };

          const newPositions = s.positions.filter((_, i) => i !== posIdx);
          const positionEquity = newPositions.reduce(
            (sum, p) => sum + p.currentPrice * p.qty,
            0,
          );
          const newCash = s.account.cash + proceeds;

          return {
            account: {
              ...s.account,
              cash: newCash,
              buyingPower: newCash,
              equity: newCash + positionEquity,
            },
            positions: newPositions,
            trades: [trade, ...s.trades].slice(0, 200), // keep last 200
          };
        });
      },

      updatePositionPrices: (prices) => {
        set((s) => {
          let positionEquity = 0;
          const positions = s.positions.map((p) => {
            const currentPrice = prices[p.symbol] ?? p.currentPrice;
            const unrealizedPl = (currentPrice - p.avgEntryPrice) * p.qty;
            const unrealizedPlPct =
              (currentPrice - p.avgEntryPrice) / p.avgEntryPrice;
            positionEquity += currentPrice * p.qty;
            return { ...p, currentPrice, unrealizedPl, unrealizedPlPct };
          });
          return {
            positions,
            account: {
              ...s.account,
              equity: s.account.cash + positionEquity,
            },
          };
        });
      },

      backfillSignals: (strategyId, strategyName, lotSizeDollars, signals) => {
        const state = get();
        // Check if we already backfilled this strategy (has any trades for it)
        const existingTrades = state.trades.filter(
          (t) => t.strategyId === strategyId,
        );
        if (existingTrades.length > 0) return; // already backfilled

        // Process signals chronologically
        const sorted = [...signals].sort((a, b) => a.time - b.time);
        let cash = state.account.cash;
        let inPosition = false;
        let entryPrice = 0;
        let entryTime = 0;
        let qty = 0;
        const newTrades: VirtualTrade[] = [];

        for (const sig of sorted) {
          if (sig.direction === "entry" && !inPosition) {
            qty = Math.floor(lotSizeDollars / sig.price);
            if (qty <= 0 || qty * sig.price > cash) continue;
            cash -= qty * sig.price;
            entryPrice = sig.price;
            entryTime = sig.time * 1000; // convert to ms
            inPosition = true;
          } else if (sig.direction === "sell" && inPosition) {
            const pnlDollars = (sig.price - entryPrice) * qty;
            const pnlPercent = (sig.price - entryPrice) / entryPrice;
            cash += sig.price * qty;
            newTrades.push({
              id: makeId(),
              strategyId,
              strategyName,
              ticker: sig.ticker,
              direction: "sell",
              entryPrice,
              exitPrice: sig.price,
              qty,
              pnlDollars,
              pnlPercent,
              entryTime,
              exitTime: sig.time * 1000,
              exitReason: "signal",
            });
            inPosition = false;
          }
        }

        if (newTrades.length === 0) return;

        set((s) => ({
          trades: [...newTrades.reverse(), ...s.trades].slice(0, 200),
          account: {
            ...s.account,
            cash,
            buyingPower: cash,
          },
        }));
      },

      recordEquitySnapshot: () => {
        set((s) => ({
          equityHistory: [
            ...s.equityHistory,
            { time: Date.now(), equity: s.account.equity },
          ].slice(-500), // keep last 500 points
        }));
      },

      setNotificationsEnabled: (v) => set({ notificationsEnabled: v }),

      reset: () =>
        set({
          account: initialAccount(),
          positions: [],
          trades: [],
          equityHistory: [],
        }),
    }),
    {
      name: "pa-virtual-portfolio",
      version: 1,
    },
  ),
);
