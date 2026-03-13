import { create } from "zustand";
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useTradeStore } from "@/store/useTradeStore";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { useBrokerStore } from "@/store/useBrokerStore";

interface AuthState {
  user:          User | null;
  loading:       boolean;
  error:         string | null;
  authModalOpen: boolean;

  setUser:         (user: User | null) => void;
  setLoading:      (loading: boolean) => void;
  setError:        (error: string | null) => void;
  openAuthModal:   () => void;
  closeAuthModal:  () => void;
  signOut:         () => Promise<void>;
  initAuth:        () => () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:          null,
  loading:       true,
  error:         null,
  authModalOpen: false,

  setUser:        (user)    => set({ user }),
  setLoading:     (loading) => set({ loading }),
  setError:       (error)   => set({ error }),
  openAuthModal:  ()        => set({ authModalOpen: true, error: null }),
  closeAuthModal: ()        => set({ authModalOpen: false, error: null }),

  signOut: async () => {
    await firebaseSignOut(auth);
    set({ user: null });
  },

  initAuth: () => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      set({ user, loading: false });
      if (user) {
        useTradeStore.getState().loadTrades(user.uid);
        void useAlpacaStore.getState().loadCredentialsFromDb(user.uid);
        void useBrokerStore.getState().loadFromFirestore(user.uid);
      } else {
        useTradeStore.getState().unloadTrades();
      }
    });
    return unsubscribe;
  },
}));
