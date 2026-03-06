"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AlpacaAccount, AlpacaOrder, AlpacaPosition, PlaceOrderRequest } from "@/types/market";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function alpacaHeaders(apiKey: string, secretKey: string): HeadersInit {
  return {
    "X-Alpaca-Key": apiKey,
    "X-Alpaca-Secret": secretKey,
  };
}

async function alpacaFetch<T>(
  path: string,
  apiKey: string,
  secretKey: string,
  init?: RequestInit,
): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...alpacaHeaders(apiKey, secretKey),
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
  // ─── Credentials (persisted in localStorage)
  apiKey: string;
  secretKey: string;

  // ─── Live state (ephemeral)
  connected: boolean;
  account: AlpacaAccount | null;
  positions: AlpacaPosition[];
  orders: AlpacaOrder[];
  loading: boolean;
  error: string | null;

  // ─── Actions
  setCredentials: (apiKey: string, secretKey: string) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  fetchAccount: () => Promise<void>;
  fetchPositions: () => Promise<void>;
  fetchOrders: () => Promise<void>;
  placeOrder: (req: PlaceOrderRequest) => Promise<AlpacaOrder>;
  cancelOrder: (orderId: string) => Promise<void>;
  cancelAllOrders: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useAlpacaStore = create<AlpacaState>()(
  persist(
    (set, get) => ({
      apiKey: "",
      secretKey: "",
      connected: false,
      account: null,
      positions: [],
      orders: [],
      loading: false,
      error: null,

      setCredentials: (apiKey, secretKey) =>
        set({ apiKey, secretKey, error: null }),

      connect: async () => {
        const { apiKey, secretKey } = get();
        if (!apiKey || !secretKey) {
          set({ error: "API key and secret key are required." });
          return;
        }
        set({ loading: true, error: null });
        try {
          const account = await alpacaFetch<AlpacaAccount>(
            "/api/v1/trading/account",
            apiKey,
            secretKey,
          );
          set({ account, connected: true, loading: false });
          // Background-fetch positions and orders
          void get().fetchPositions();
          void get().fetchOrders();
        } catch (e) {
          set({ error: (e as Error).message, loading: false, connected: false });
        }
      },

      disconnect: () =>
        set({
          connected: false,
          account: null,
          positions: [],
          orders: [],
          error: null,
        }),

      fetchAccount: async () => {
        const { apiKey, secretKey } = get();
        try {
          const account = await alpacaFetch<AlpacaAccount>(
            "/api/v1/trading/account",
            apiKey,
            secretKey,
          );
          set({ account });
        } catch {
          // silently ignore background refresh failures
        }
      },

      fetchPositions: async () => {
        const { apiKey, secretKey } = get();
        try {
          const positions = await alpacaFetch<AlpacaPosition[]>(
            "/api/v1/trading/positions",
            apiKey,
            secretKey,
          );
          set({ positions });
        } catch {
          // silently ignore
        }
      },

      fetchOrders: async () => {
        const { apiKey, secretKey } = get();
        try {
          const orders = await alpacaFetch<AlpacaOrder[]>(
            "/api/v1/trading/orders",
            apiKey,
            secretKey,
          );
          set({ orders });
        } catch {
          // silently ignore
        }
      },

      placeOrder: async (req) => {
        const { apiKey, secretKey } = get();
        const order = await alpacaFetch<AlpacaOrder>(
          "/api/v1/trading/orders",
          apiKey,
          secretKey,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(req),
          },
        );
        void get().fetchOrders();
        void get().fetchAccount();
        return order;
      },

      cancelOrder: async (orderId) => {
        const { apiKey, secretKey } = get();
        await fetch(`${API_BASE}/api/v1/trading/orders/${orderId}`, {
          method: "DELETE",
          headers: alpacaHeaders(apiKey, secretKey),
        });
        void get().fetchOrders();
      },

      cancelAllOrders: async () => {
        const { apiKey, secretKey } = get();
        await fetch(`${API_BASE}/api/v1/trading/orders`, {
          method: "DELETE",
          headers: alpacaHeaders(apiKey, secretKey),
        });
        void get().fetchOrders();
      },

      refresh: async () => {
        if (!get().connected) return;
        await Promise.all([
          get().fetchAccount(),
          get().fetchPositions(),
          get().fetchOrders(),
        ]);
      },
    }),
    {
      name: "alpaca-credentials",
      // Only persist credentials — ephemeral state is always re-fetched
      partialize: (state) => ({
        apiKey: state.apiKey,
        secretKey: state.secretKey,
      }),
    },
  ),
);
