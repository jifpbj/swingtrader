"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AlpacaAccount, AlpacaOrder, AlpacaPosition, PlaceOrderRequest } from "@/types/market";
import type { TradingMode } from "@/types/strategy";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const ALPACA_URLS: Record<TradingMode, string> = {
  paper: "https://paper-api.alpaca.markets",
  live:  "https://api.alpaca.markets",
};

function alpacaHeaders(apiKey: string, secretKey: string, mode: TradingMode): HeadersInit {
  return {
    "X-Alpaca-Key": apiKey,
    "X-Alpaca-Secret": secretKey,
    "X-Alpaca-Base-Url": ALPACA_URLS[mode],
  };
}

async function alpacaFetch<T>(
  path: string,
  apiKey: string,
  secretKey: string,
  mode: TradingMode,
  init?: RequestInit,
): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...alpacaHeaders(apiKey, secretKey, mode),
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
  // ─── Credentials (persisted in localStorage + Firestore when logged in)
  apiKey: string;
  secretKey: string;

  // ─── Trading mode (persisted)
  tradingMode: TradingMode;

  // ─── DB sync state
  dbSaving: boolean;
  dbSaved: boolean;   // true for 3s after a successful save

  // ─── Live state (ephemeral)
  account: AlpacaAccount | null;
  positions: AlpacaPosition[];
  orders: AlpacaOrder[];
  loading: boolean;
  error: string | null;

  // ─── Actions
  setCredentials: (apiKey: string, secretKey: string) => void;
  setTradingMode: (mode: TradingMode) => void;
  connect: (apiKey: string, secretKey: string) => Promise<void>;
  disconnect: () => void;
  fetchAccount: () => Promise<void>;
  fetchPositions: () => Promise<void>;
  fetchOrders: () => Promise<void>;
  placeOrder: (req: PlaceOrderRequest) => Promise<AlpacaOrder>;
  cancelOrder: (orderId: string) => Promise<void>;
  cancelAllOrders: () => Promise<void>;
  refresh: () => Promise<void>;

  // ─── Firestore persistence
  saveCredentialsToDb: (uid: string) => Promise<void>;
  loadCredentialsFromDb: (uid: string) => Promise<void>;
  clearDbSaved: () => void;
}

export const useAlpacaStore = create<AlpacaState>()(
  persist(
    (set, get) => ({
      apiKey: "",
      secretKey: "",
      tradingMode: "paper",
      dbSaving: false,
      dbSaved: false,
      account: null,
      positions: [],
      orders: [],
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
            get().tradingMode,
          );
          set({ account, loading: false });
          void Promise.all([get().fetchPositions(), get().fetchOrders()]);
        } catch (e) {
          set({ error: (e as Error).message, loading: false });
        }
      },

      disconnect: () =>
        set({
          account: null,
          positions: [],
          orders: [],
          error: null,
        }),

      fetchAccount: async () => {
        const { apiKey, secretKey, tradingMode } = get();
        try {
          const account = await alpacaFetch<AlpacaAccount>(
            "/api/v1/trading/account",
            apiKey,
            secretKey,
            tradingMode,
          );
          set({ account });
        } catch {
          // silently ignore background refresh failures
        }
      },

      fetchPositions: async () => {
        const { apiKey, secretKey, tradingMode } = get();
        try {
          const positions = await alpacaFetch<AlpacaPosition[]>(
            "/api/v1/trading/positions",
            apiKey,
            secretKey,
            tradingMode,
          );
          set({ positions });
        } catch {
          // silently ignore
        }
      },

      fetchOrders: async () => {
        const { apiKey, secretKey, tradingMode } = get();
        try {
          const orders = await alpacaFetch<AlpacaOrder[]>(
            "/api/v1/trading/orders",
            apiKey,
            secretKey,
            tradingMode,
          );
          set({ orders });
        } catch {
          // silently ignore
        }
      },

      placeOrder: async (req) => {
        const { apiKey, secretKey, tradingMode } = get();
        const order = await alpacaFetch<AlpacaOrder>(
          "/api/v1/trading/orders",
          apiKey,
          secretKey,
          tradingMode,
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
        const { apiKey, secretKey, tradingMode } = get();
        await alpacaFetch<void>(
          `/api/v1/trading/orders/${orderId}`,
          apiKey,
          secretKey,
          tradingMode,
          { method: "DELETE" },
        );
        void get().fetchOrders();
      },

      cancelAllOrders: async () => {
        const { apiKey, secretKey, tradingMode } = get();
        await alpacaFetch<void>(
          "/api/v1/trading/orders",
          apiKey,
          secretKey,
          tradingMode,
          { method: "DELETE" },
        );
        void get().fetchOrders();
      },

      refresh: async () => {
        if (!get().account) return;
        await Promise.all([
          get().fetchAccount(),
          get().fetchPositions(),
          get().fetchOrders(),
        ]);
      },

      // ─── Firestore: save paper keys to users/{uid}/alpacaKeys
      saveCredentialsToDb: async (uid) => {
        const { apiKey, secretKey } = get();
        set({ dbSaving: true, dbSaved: false, error: null });
        try {
          await setDoc(
            doc(db, "users", uid, "private", "alpacaKeys"),
            {
              paperApiKey: apiKey,
              paperSecretKey: secretKey,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
          set({ dbSaving: false, dbSaved: true });
          // Auto-clear the "Saved!" indicator after 3s
          setTimeout(() => get().clearDbSaved(), 3000);
        } catch (e) {
          set({ dbSaving: false, error: (e as Error).message });
        }
      },

      // ─── Firestore: load paper keys on login and auto-connect
      loadCredentialsFromDb: async (uid) => {
        try {
          const snap = await getDoc(doc(db, "users", uid, "private", "alpacaKeys"));
          if (snap.exists()) {
            const data = snap.data() as { paperApiKey?: string; paperSecretKey?: string };
            if (data.paperApiKey && data.paperSecretKey) {
              await get().connect(data.paperApiKey, data.paperSecretKey);
            }
          }
        } catch {
          // Non-fatal: user may not have saved keys yet
        }
      },

      clearDbSaved: () => set({ dbSaved: false }),
    }),
    {
      name: "alpaca-credentials",
      // Keep localStorage as a local cache; Firestore is the source of truth when logged in
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
