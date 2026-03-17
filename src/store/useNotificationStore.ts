"use client";

import { create } from "zustand";

export type NotificationType = "trade_buy" | "trade_sell";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: number; // Unix ms
  read: boolean;
  ticker?: string;
  strategyName?: string;
  pnlDollars?: number;
}

interface NotificationState {
  notifications: AppNotification[];
  addNotification: (n: Omit<AppNotification, "id" | "read">) => void;
  dismissNotification: (id: string) => void;
  clearAll: () => void;
  markAllRead: () => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],

  addNotification: (n) =>
    set((s) => ({
      notifications: [
        { ...n, id: `${n.timestamp}-${Math.random().toString(36).slice(2)}`, read: false },
        ...s.notifications,
      ].slice(0, 50),
    })),

  dismissNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),

  clearAll: () => set({ notifications: [] }),

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),
}));
