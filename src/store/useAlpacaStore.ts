"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { auth } from "@/lib/firebase";
import type { AlpacaAccount, AlpacaOrder, AlpacaPosition, AlpacaPortfolioHistory, PlaceOrderRequest } from "@/types/market";
import type { TradingMode } from "@/types/strategy";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Demo/beta: paper trading only — credentials are stored in localStorage only, never sent to our servers.
const PAPER_API_URL = "https://paper-api.alpaca.markets";

function alpacaHeaders(apiKey: string, secretKey: string): HeadersInit {
  return {
    "X-Alpaca-Key": apiKey,
    "X-Alpaca-Secret": secretKey,
    "X-Alpaca-Base-Url": PAPER_API_URL,
  };
}

async function alpacaFetch<T>(
  path: string,
  apiKey: string,
  secretKey: string,
  init?: RequestInit,
): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Not authenticated");
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...alpacaHeaders(apiKey, secretKey),
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(body.detail ?? `HTTP ${resp.status}`);
  }
  return resp.json();
}

interface AlpacaState {
  // ─── Paper credentials (persisted in localStorage — never sent to our servers)
  apiKey: string;
  secretKey: string;

  // ─── Trading mode (paper only in beta)
  tradingMode: TradingMode;

  // ─── Paper ephemeral state
  account: AlpacaAccount | null;
  positions: AlpacaPosition[];
  orders: AlpacaOrder[];
  portfolioHistory: AlpacaPortfolioHistory | null;
  loading: boolean;
  error: string | null;

  // ─── Paper actions
  setCredentials: (apiKey: string, secretKey: string) => void;
  setTradingMode: (mode: TradingMode) => void;
  connect: (apiKey: string, secretKey: string) => Promise<void>;
  disconnect: () => void;
  fetchAccount: () => Promise<void>;
  fetchPositions: () => Promise<void>;
  fetchOrders: () => Promise<void>;
  fetchPortfolioHistory: (period: string, timeframe?: string) => Promise<void>;
  placeOrder: (req: PlaceOrderRequest) => Promise<AlpacaOrder>;
  cancelOrder: (orderId: string) => Promise<void>;
  cancelAllOrders: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useAlpacaStore = create<AlpacaState>()(
  persist(
    (set, get) => ({
      // ── Defaults
      apiKey: "",
      secretKey: "",
      tradingMode: "paper",
      account: null,
      positions: [],
      orders: [],
      portfolioHistory: null,
      loading: false,
      error: null,

      setCredentials: (apiKey, secretKey) =>
        set({ apiKey, secretKey, error: null }),

      setTradingMode: (tradingMode) => set({ tradingMode }),

      connect: async (apiKey, secretKey) => {
        if (!apiKey || !secretKey) {
          set({ error: "API key and secret key are required." });
          return;
        }
        set({ apiKey, secretKey, loading: true, error: null });
        try {
          const account = await alpacaFetch<AlpacaAccount>(
            "/api/v1/trading/account",
            apiKey,
            secretKey,
          );
          set({ account, loading: false });
          void Promise.all([get().fetchPositions(), get().fetchOrders()]);
        } catch (e) {
          set({ error: (e as Error).message, loading: false });
        }
      },

      disconnect: () =>
        set({ account: null, positions: [], orders: [], error: null }),

      fetchAccount: async () => {
        const { apiKey, secretKey } = get();
        try {
          const account = await alpacaFetch<AlpacaAccount>(
            "/api/v1/trading/account", apiKey, secretKey,
          );
          set({ account });
        } catch { /* silent */ }
      },

      fetchPositions: async () => {
        const { apiKey, secretKey } = get();
        try {
          const positions = await alpacaFetch<AlpacaPosition[]>(
            "/api/v1/trading/positions", apiKey, secretKey,
          );
          set({ positions });
        } catch { /* silent */ }
      },

      fetchOrders: async () => {
        const { apiKey, secretKey } = get();
        try {
          const orders = await alpacaFetch<AlpacaOrder[]>(
            "/api/v1/trading/orders?limit=500&status=all", apiKey, secretKey,
          );
          set({ orders });
        } catch { /* silent */ }
      },

      fetchPortfolioHistory: async (period, timeframe = "1D") => {
        const { apiKey, secretKey } = get();
        try {
          const history = await alpacaFetch<AlpacaPortfolioHistory>(
            `/api/v1/trading/account/portfolio/history?period=${period}&timeframe=${timeframe}`,
            apiKey, secretKey,
          );
          set({ portfolioHistory: history });
        } catch { /* silent */ }
      },

      placeOrder: async (req) => {
        const { apiKey, secretKey } = get();
        const order = await alpacaFetch<AlpacaOrder>(
          "/api/v1/trading/orders", apiKey, secretKey,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) },
        );
        void get().fetchOrders();
        void get().fetchAccount();
        return order;
      },

      cancelOrder: async (orderId) => {
        const { apiKey, secretKey } = get();
        await alpacaFetch<void>(
          `/api/v1/trading/orders/${orderId}`, apiKey, secretKey, { method: "DELETE" },
        );
        void get().fetchOrders();
      },

      cancelAllOrders: async () => {
        const { apiKey, secretKey } = get();
        await alpacaFetch<void>(
          "/api/v1/trading/orders", apiKey, secretKey, { method: "DELETE" },
        );
        void get().fetchOrders();
      },

      refresh: async () => {
        if (!get().account) return;
        await Promise.all([get().fetchAccount(), get().fetchPositions(), get().fetchOrders()]);
      },
    }),
    {
      name: "alpaca-credentials",
      partialize: (state) => ({
        apiKey: state.apiKey,
        secretKey: state.secretKey,
        tradingMode: state.tradingMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.apiKey && state?.secretKey) {
          void state.connect(state.apiKey, state.secretKey);
        }
      },
    },
  ),
);
