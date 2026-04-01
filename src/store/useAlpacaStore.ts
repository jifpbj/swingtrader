"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { AlpacaAccount, AlpacaOrder, AlpacaPosition, AlpacaPortfolioHistory, PlaceOrderRequest } from "@/types/market";
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
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Not authenticated");
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...alpacaHeaders(apiKey, secretKey, mode),
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
  // ─── Paper credentials (persisted)
  apiKey: string;
  secretKey: string;

  // ─── Live credentials (persisted)
  liveApiKey: string;
  liveSecretKey: string;

  // ─── Trading mode (persisted)
  tradingMode: TradingMode;

  // ─── Paper DB sync state
  dbSaving: boolean;
  dbSaved: boolean;

  // ─── Live DB sync state
  liveDbSaving: boolean;
  liveDbSaved: boolean;

  // ─── Paper ephemeral state
  account: AlpacaAccount | null;
  positions: AlpacaPosition[];
  orders: AlpacaOrder[];
  portfolioHistory: AlpacaPortfolioHistory | null;
  loading: boolean;
  error: string | null;

  // ─── Live ephemeral state
  liveAccount: AlpacaAccount | null;
  livePositions: AlpacaPosition[];
  liveOrders: AlpacaOrder[];
  livePortfolioHistory: AlpacaPortfolioHistory | null;
  liveLoading: boolean;
  liveError: string | null;

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

  // ─── Live actions
  setLiveCredentials: (apiKey: string, secretKey: string) => void;
  connectLive: (apiKey: string, secretKey: string) => Promise<void>;
  disconnectLive: () => void;
  fetchLiveAccount: () => Promise<void>;
  fetchLivePositions: () => Promise<void>;
  fetchLiveOrders: () => Promise<void>;
  fetchLivePortfolioHistory: (period: string, timeframe?: string) => Promise<void>;
  placeOrderLive: (req: PlaceOrderRequest) => Promise<AlpacaOrder>;
  cancelLiveOrder: (orderId: string) => Promise<void>;
  cancelAllLiveOrders: () => Promise<void>;
  refreshLive: () => Promise<void>;

  // ─── Firestore persistence
  saveCredentialsToDb: (uid: string) => Promise<void>;
  loadCredentialsFromDb: (uid: string) => Promise<void>;
  clearDbSaved: () => void;
  saveLiveCredentialsToDb: (uid: string) => Promise<void>;
  loadLiveCredentialsFromDb: (uid: string) => Promise<void>;
  clearLiveDbSaved: () => void;
}

export const useAlpacaStore = create<AlpacaState>()(
  persist(
    (set, get) => ({
      // ── Paper defaults
      apiKey: "",
      secretKey: "",
      tradingMode: "paper",
      dbSaving: false,
      dbSaved: false,
      account: null,
      positions: [],
      orders: [],
      portfolioHistory: null,
      loading: false,
      error: null,

      // ── Live defaults
      liveApiKey: "",
      liveSecretKey: "",
      liveDbSaving: false,
      liveDbSaved: false,
      liveAccount: null,
      livePositions: [],
      liveOrders: [],
      livePortfolioHistory: null,
      liveLoading: false,
      liveError: null,

      // ── Paper actions ──────────────────────────────────────────────────────

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
            "paper",
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
            "/api/v1/trading/account", apiKey, secretKey, "paper",
          );
          set({ account });
        } catch { /* silent */ }
      },

      fetchPositions: async () => {
        const { apiKey, secretKey } = get();
        try {
          const positions = await alpacaFetch<AlpacaPosition[]>(
            "/api/v1/trading/positions", apiKey, secretKey, "paper",
          );
          set({ positions });
        } catch { /* silent */ }
      },

      fetchOrders: async () => {
        const { apiKey, secretKey } = get();
        try {
          const orders = await alpacaFetch<AlpacaOrder[]>(
            "/api/v1/trading/orders?limit=500&status=all", apiKey, secretKey, "paper",
          );
          set({ orders });
        } catch { /* silent */ }
      },

      fetchPortfolioHistory: async (period, timeframe = "1D") => {
        const { apiKey, secretKey } = get();
        try {
          const history = await alpacaFetch<AlpacaPortfolioHistory>(
            `/api/v1/trading/account/portfolio/history?period=${period}&timeframe=${timeframe}`,
            apiKey, secretKey, "paper",
          );
          set({ portfolioHistory: history });
        } catch { /* silent */ }
      },

      placeOrder: async (req) => {
        const { apiKey, secretKey } = get();
        const order = await alpacaFetch<AlpacaOrder>(
          "/api/v1/trading/orders", apiKey, secretKey, "paper",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) },
        );
        void get().fetchOrders();
        void get().fetchAccount();
        return order;
      },

      cancelOrder: async (orderId) => {
        const { apiKey, secretKey } = get();
        await alpacaFetch<void>(
          `/api/v1/trading/orders/${orderId}`, apiKey, secretKey, "paper", { method: "DELETE" },
        );
        void get().fetchOrders();
      },

      cancelAllOrders: async () => {
        const { apiKey, secretKey } = get();
        await alpacaFetch<void>(
          "/api/v1/trading/orders", apiKey, secretKey, "paper", { method: "DELETE" },
        );
        void get().fetchOrders();
      },

      refresh: async () => {
        if (!get().account) return;
        await Promise.all([get().fetchAccount(), get().fetchPositions(), get().fetchOrders()]);
      },

      // ── Live actions ───────────────────────────────────────────────────────

      setLiveCredentials: (liveApiKey, liveSecretKey) =>
        set({ liveApiKey, liveSecretKey, liveError: null }),

      connectLive: async (apiKey, secretKey) => {
        if (!apiKey || !secretKey) {
          set({ liveError: "API key and secret key are required." });
          return;
        }
        set({ liveApiKey: apiKey, liveSecretKey: secretKey, liveLoading: true, liveError: null });
        try {
          const liveAccount = await alpacaFetch<AlpacaAccount>(
            "/api/v1/trading/account", apiKey, secretKey, "live",
          );
          set({ liveAccount, liveLoading: false });
          void Promise.all([get().fetchLivePositions(), get().fetchLiveOrders()]);
        } catch (e) {
          set({ liveError: (e as Error).message, liveLoading: false });
        }
      },

      disconnectLive: () =>
        set({ liveAccount: null, livePositions: [], liveOrders: [], liveError: null }),

      fetchLiveAccount: async () => {
        const { liveApiKey, liveSecretKey } = get();
        try {
          const liveAccount = await alpacaFetch<AlpacaAccount>(
            "/api/v1/trading/account", liveApiKey, liveSecretKey, "live",
          );
          set({ liveAccount });
        } catch { /* silent */ }
      },

      fetchLivePositions: async () => {
        const { liveApiKey, liveSecretKey } = get();
        try {
          const livePositions = await alpacaFetch<AlpacaPosition[]>(
            "/api/v1/trading/positions", liveApiKey, liveSecretKey, "live",
          );
          set({ livePositions });
        } catch { /* silent */ }
      },

      fetchLiveOrders: async () => {
        const { liveApiKey, liveSecretKey } = get();
        try {
          const liveOrders = await alpacaFetch<AlpacaOrder[]>(
            "/api/v1/trading/orders?limit=500&status=all", liveApiKey, liveSecretKey, "live",
          );
          set({ liveOrders });
        } catch { /* silent */ }
      },

      fetchLivePortfolioHistory: async (period, timeframe = "1D") => {
        const { liveApiKey, liveSecretKey } = get();
        try {
          const livePortfolioHistory = await alpacaFetch<AlpacaPortfolioHistory>(
            `/api/v1/trading/account/portfolio/history?period=${period}&timeframe=${timeframe}`,
            liveApiKey, liveSecretKey, "live",
          );
          set({ livePortfolioHistory });
        } catch { /* silent */ }
      },

      placeOrderLive: async (req) => {
        const { liveApiKey, liveSecretKey } = get();
        const order = await alpacaFetch<AlpacaOrder>(
          "/api/v1/trading/orders", liveApiKey, liveSecretKey, "live",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) },
        );
        void get().fetchLiveOrders();
        void get().fetchLiveAccount();
        return order;
      },

      cancelLiveOrder: async (orderId) => {
        const { liveApiKey, liveSecretKey } = get();
        await alpacaFetch<void>(
          `/api/v1/trading/orders/${orderId}`, liveApiKey, liveSecretKey, "live", { method: "DELETE" },
        );
        void get().fetchLiveOrders();
      },

      cancelAllLiveOrders: async () => {
        const { liveApiKey, liveSecretKey } = get();
        await alpacaFetch<void>(
          "/api/v1/trading/orders", liveApiKey, liveSecretKey, "live", { method: "DELETE" },
        );
        void get().fetchLiveOrders();
      },

      refreshLive: async () => {
        if (!get().liveAccount) return;
        await Promise.all([get().fetchLiveAccount(), get().fetchLivePositions(), get().fetchLiveOrders()]);
      },

      // ── Firestore persistence ──────────────────────────────────────────────

      saveCredentialsToDb: async (uid) => {
        const { apiKey, secretKey } = get();
        set({ dbSaving: true, dbSaved: false, error: null });
        try {
          await setDoc(
            doc(db, "users", uid, "private", "alpacaKeys"),
            { paperApiKey: apiKey, paperSecretKey: secretKey, updatedAt: serverTimestamp() },
            { merge: true },
          );
          set({ dbSaving: false, dbSaved: true });
          setTimeout(() => get().clearDbSaved(), 3000);
        } catch (e) {
          set({ dbSaving: false, error: (e as Error).message });
        }
      },

      loadCredentialsFromDb: async (uid) => {
        try {
          const snap = await getDoc(doc(db, "users", uid, "private", "alpacaKeys"));
          if (snap.exists()) {
            const data = snap.data() as { paperApiKey?: string; paperSecretKey?: string; liveApiKey?: string; liveSecretKey?: string };
            if (data.paperApiKey && data.paperSecretKey) {
              await get().connect(data.paperApiKey, data.paperSecretKey);
            }
            if (data.liveApiKey && data.liveSecretKey) {
              await get().connectLive(data.liveApiKey, data.liveSecretKey);
            }
          }
        } catch { /* Non-fatal */ }
      },

      clearDbSaved: () => set({ dbSaved: false }),

      saveLiveCredentialsToDb: async (uid) => {
        const { liveApiKey, liveSecretKey } = get();
        set({ liveDbSaving: true, liveDbSaved: false, liveError: null });
        try {
          await setDoc(
            doc(db, "users", uid, "private", "alpacaKeys"),
            { liveApiKey, liveSecretKey, updatedAt: serverTimestamp() },
            { merge: true },
          );
          set({ liveDbSaving: false, liveDbSaved: true });
          setTimeout(() => get().clearLiveDbSaved(), 3000);
        } catch (e) {
          set({ liveDbSaving: false, liveError: (e as Error).message });
        }
      },

      loadLiveCredentialsFromDb: async (uid) => {
        try {
          const snap = await getDoc(doc(db, "users", uid, "private", "alpacaKeys"));
          if (snap.exists()) {
            const data = snap.data() as { liveApiKey?: string; liveSecretKey?: string };
            if (data.liveApiKey && data.liveSecretKey) {
              await get().connectLive(data.liveApiKey, data.liveSecretKey);
            }
          }
        } catch { /* Non-fatal */ }
      },

      clearLiveDbSaved: () => set({ liveDbSaved: false }),
    }),
    {
      name: "alpaca-credentials",
      partialize: (state) => ({
        apiKey: state.apiKey,
        secretKey: state.secretKey,
        liveApiKey: state.liveApiKey,
        liveSecretKey: state.liveSecretKey,
        tradingMode: state.tradingMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.apiKey && state?.secretKey) {
          void state.connect(state.apiKey, state.secretKey);
        }
        if (state?.liveApiKey && state?.liveSecretKey) {
          void state.connectLive(state.liveApiKey, state.liveSecretKey);
        }
      },
    },
  ),
);
