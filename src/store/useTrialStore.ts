"use client";

import { create } from "zustand";
import {
  getVisitorId,
  getTrialStart,
  getTrialDaysRemaining,
  isTrialExpired,
} from "@/lib/trialIdentity";

interface TrialState {
  visitorId: string;
  trialStart: number;
  daysRemaining: number;
  isExpired: boolean;
  initialized: boolean;

  /** Read cookies and hydrate state. Call once on app mount. */
  initTrial: () => void;
  /** Re-compute remaining days (call periodically if needed) */
  refreshTrial: () => void;
}

export const useTrialStore = create<TrialState>((set) => ({
  visitorId: "",
  trialStart: 0,
  daysRemaining: 14,
  isExpired: false,
  initialized: false,

  initTrial: () => {
    const visitorId = getVisitorId();
    const trialStart = getTrialStart();
    set({
      visitorId,
      trialStart,
      daysRemaining: getTrialDaysRemaining(),
      isExpired: isTrialExpired(),
      initialized: true,
    });
  },

  refreshTrial: () => {
    set({
      daysRemaining: getTrialDaysRemaining(),
      isExpired: isTrialExpired(),
    });
  },
}));
