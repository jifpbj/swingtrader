"use client";

/**
 * Subscription store — mirrors users/{uid}/billing/subscription in Firestore.
 *
 * Written by the FastAPI Stripe webhook (POST /webhook/stripe) when a payment
 * succeeds. Read here via a real-time onSnapshot listener so the UI updates
 * the moment the webhook fires (usually within 1–2 seconds of payment).
 *
 * Firestore path: users/{uid}/billing/subscription
 *   plan:                   "free" | "basic" | "executive"
 *   status:                 "active" | "cancelled"
 *   stripeCustomerId:       "cus_xxx"
 *   stripeSubscriptionId:   "sub_xxx"
 *   activatedAt:            unix ms
 */

import { create } from "zustand";
import {
  doc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Plan = "free" | "basic" | "executive";

export interface SubscriptionState {
  plan: Plan;
  /** "loading" until the first Firestore snapshot arrives */
  status: "loading" | "active" | "inactive";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;

  /** @internal — Firestore unsubscribe handle */
  _unsub: Unsubscribe | null;

  loadSubscription:   (uid: string) => void;
  unloadSubscription: () => void;

  /** Convenience helper used for UI gating */
  isPaid: () => boolean;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  plan:                   "free",
  status:                 "loading",
  stripeCustomerId:       null,
  stripeSubscriptionId:   null,
  _unsub:                 null,

  loadSubscription: (uid: string) => {
    // Clean up any previous listener
    get()._unsub?.();

    const ref = doc(db, "users", uid, "billing", "subscription");

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          set({
            plan:                 (data.plan as Plan) ?? "free",
            status:               data.status === "active" ? "active" : "inactive",
            stripeCustomerId:     data.stripeCustomerId ?? null,
            stripeSubscriptionId: data.stripeSubscriptionId ?? null,
          });
        } else {
          // No subscription doc → free tier
          set({ plan: "free", status: "inactive", stripeCustomerId: null, stripeSubscriptionId: null });
        }
      },
      () => {
        // On error (e.g. network), default to free to avoid locking out the UI
        set({ plan: "free", status: "inactive" });
      },
    );

    set({ _unsub: unsub, status: "loading" });
  },

  unloadSubscription: () => {
    get()._unsub?.();
    set({
      plan:                 "free",
      status:               "inactive",
      stripeCustomerId:     null,
      stripeSubscriptionId: null,
      _unsub:               null,
    });
  },

  isPaid: () => {
    const { plan, status } = get();
    return status === "active" && (plan === "basic" || plan === "executive");
  },
}));
