"use client";

import { create } from "zustand";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { TradeRecord } from "@/types/trade";

interface TradeState {
  trades: TradeRecord[];
  _unsubscribe: Unsubscribe | null;

  /** Subscribe to all trades for a user, newest first */
  loadTrades: (uid: string) => void;
  /** Unsubscribe and clear local state */
  unloadTrades: () => void;
  /** Persist a completed trade to Firestore */
  addTrade: (uid: string, trade: Omit<TradeRecord, "id">) => Promise<string>;
  /** Get trades for a specific strategy (derived from trades array) */
  getTradesForStrategy: (strategyId: string) => TradeRecord[];
}

export const useTradeStore = create<TradeState>()((set, get) => ({
  trades: [],
  _unsubscribe: null,

  loadTrades: (uid) => {
    get()._unsubscribe?.();
    const ref = collection(db, "users", uid, "trades");
    const q = query(ref, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const trades: TradeRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<TradeRecord, "id">),
      }));
      set({ trades });
    });
    set({ _unsubscribe: unsub });
  },

  unloadTrades: () => {
    get()._unsubscribe?.();
    set({ trades: [], _unsubscribe: null });
  },

  addTrade: async (uid, trade) => {
    const ref = collection(db, "users", uid, "trades");
    const docRef = await addDoc(ref, trade);
    return docRef.id;
  },

  getTradesForStrategy: (strategyId) => {
    return get().trades.filter((t) => t.strategyId === strategyId);
  },
}));
