"use client";

import { create } from "zustand";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { SavedStrategy, AlgoAnalysisResult } from "@/types/strategy";

interface StrategyState {
  strategies: SavedStrategy[];
  activeStrategyId: string | null;
  analysisResult: AlgoAnalysisResult | null;
  analyzing: boolean;
  /** Set by any component to request an AI analysis run; BacktestPanel consumes and clears */
  analysisRequested: boolean;
  /** Internal Firebase listener cleanup */
  _unsubscribe: Unsubscribe | null;

  /** Subscribe to user's strategies via Firestore onSnapshot */
  loadStrategies: (uid: string) => void;
  /** Unsubscribe listener and clear local state */
  unloadStrategies: () => void;

  /** Create a new strategy document; returns the new doc id */
  saveStrategy: (s: Omit<SavedStrategy, "id">, uid: string) => Promise<string>;
  /** Partial-update an existing strategy document */
  updateStrategy: (id: string, patch: Partial<Omit<SavedStrategy, "id">>, uid: string) => Promise<void>;
  /** Delete a strategy document */
  deleteStrategy: (id: string, uid: string) => Promise<void>;

  /** Set which strategy is currently displayed in the chart */
  setActiveStrategy: (id: string | null) => void;
  /** Store the ephemeral AI Optimize result (shown in modal) */
  setAnalysisResult: (r: AlgoAnalysisResult | null) => void;
  /** Toggle optimization loading state */
  setAnalyzing: (v: boolean) => void;
  /** Request an AI analysis run from any component */
  requestAnalysis: () => void;
  /** Clear the analysis request flag (called by BacktestPanel after consuming) */
  clearAnalysisRequest: () => void;
}

export const useStrategyStore = create<StrategyState>()((set, get) => ({
  strategies: [],
  activeStrategyId: null,
  analysisResult: null,
  analyzing: false,
  analysisRequested: false,
  _unsubscribe: null,

  loadStrategies: (uid) => {
    // Tear down any existing listener first
    get()._unsubscribe?.();

    const ref = collection(db, "users", uid, "strategies");
    const unsub = onSnapshot(ref, (snapshot) => {
      const strategies: SavedStrategy[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SavedStrategy, "id">),
      }));
      // Newest first
      strategies.sort((a, b) => b.createdAt - a.createdAt);
      set({ strategies });
    });
    set({ _unsubscribe: unsub });
  },

  unloadStrategies: () => {
    get()._unsubscribe?.();
    set({ strategies: [], _unsubscribe: null, activeStrategyId: null });
  },

  saveStrategy: async (s, uid) => {
    const ref = collection(db, "users", uid, "strategies");
    const docRef = await addDoc(ref, s);
    return docRef.id;
  },

  updateStrategy: async (id, patch, uid) => {
    const ref = doc(db, "users", uid, "strategies", id);
    await setDoc(ref, { ...patch, updatedAt: Date.now() }, { merge: true });
  },

  deleteStrategy: async (id, uid) => {
    const ref = doc(db, "users", uid, "strategies", id);
    await deleteDoc(ref);
    if (get().activeStrategyId === id) {
      set({ activeStrategyId: null });
    }
  },

  setActiveStrategy: (id) => set({ activeStrategyId: id }),
  setAnalysisResult: (r) => set({ analysisResult: r }),
  setAnalyzing: (v) => set({ analyzing: v }),
  requestAnalysis: () => set({ analysisRequested: true }),
  clearAnalysisRequest: () => set({ analysisRequested: false }),
}));
