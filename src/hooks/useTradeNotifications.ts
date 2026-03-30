"use client";

import { useEffect, useRef } from "react";
import { useTradeStore } from "@/store/useTradeStore";
import { useStrategyStore } from "@/store/useStrategyStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useVirtualPortfolioStore } from "@/store/useVirtualPortfolioStore";
import type { OpenEntry } from "@/types/strategy";

const currFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fireBrowserNotification(title: string, body: string, tag: string) {
  if (typeof window === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag, icon: "/favicon.ico", silent: false });
  } catch {
    // unsupported in this context (e.g. Safari restrictions)
  }
}

/**
 * Watches Firestore-backed trades and strategy openEntry transitions.
 * Fires in-app + browser notifications for:
 *   • New completed trade records (sell executed, P/L available)
 *   • openEntry transitioning null → value (buy signal fired)
 *
 * Mount this once inside a logged-in layout (e.g. dashboard/page.tsx).
 */
export function useTradeNotifications() {
  const trades     = useTradeStore((s) => s.trades);
  const strategies = useStrategyStore((s) => s.strategies);
  const addNotification = useNotificationStore((s) => s.addNotification);

  // Tracks trade IDs seen at mount — we don't notify for pre-existing trades
  const knownTradeIds = useRef<Set<string> | null>(null);

  // Tracks openEntry per strategy at last render — to detect transitions
  const prevOpenEntry = useRef<Map<string, OpenEntry | null>>(new Map());

  // ── Completed trades (sell executed) ───────────────────────────────────────
  useEffect(() => {
    if (knownTradeIds.current === null) {
      // First render: record existing IDs, don't notify
      knownTradeIds.current = new Set(trades.map((t) => t.id));
      return;
    }

    for (const trade of trades) {
      if (knownTradeIds.current.has(trade.id)) continue;
      knownTradeIds.current.add(trade.id);

      const isProfit = trade.pnlDollars >= 0;
      const pnlStr = `${isProfit ? "+" : ""}${currFmt.format(trade.pnlDollars)}`;
      const title = `${trade.ticker} Trade Closed ${isProfit ? "🟢" : "🔴"}`;
      const body  = `${trade.strategyName} · ${pnlStr} (${isProfit ? "+" : ""}${(trade.pnlPercent * 100).toFixed(1)}%)`;

      addNotification({
        type: "trade_sell",
        title,
        body,
        timestamp: Date.now(),
        ticker: trade.ticker,
        strategyName: trade.strategyName,
        pnlDollars: trade.pnlDollars,
      });

      fireBrowserNotification(title, body, `trade-sell-${trade.id}`);
    }
  }, [trades]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Buy signals (openEntry null → set) ─────────────────────────────────────
  useEffect(() => {
    for (const strategy of strategies) {
      const prev = prevOpenEntry.current.get(strategy.id);
      const curr = strategy.openEntry;

      // Detect null → value transition (buy executed)
      if (prev !== undefined && prev === null && curr !== null) {
        const title = `${strategy.ticker} BUY Signal`;
        const body  = `${strategy.name} entered at $${curr.price.toFixed(2)} · ${curr.qty} unit${curr.qty !== 1 ? "s" : ""}`;

        addNotification({
          type: "trade_buy",
          title,
          body,
          timestamp: Date.now(),
          ticker: strategy.ticker,
          strategyName: strategy.name,
        });

        fireBrowserNotification(title, body, `trade-buy-${strategy.id}-${curr.time}`);
      }

      prevOpenEntry.current.set(strategy.id, curr);
    }
  }, [strategies]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Virtual portfolio trades ───────────────────────────────────────────────
  const virtualTrades = useVirtualPortfolioStore((s) => s.trades);
  const virtualNotify = useVirtualPortfolioStore((s) => s.notificationsEnabled);
  const knownVirtualIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (knownVirtualIds.current === null) {
      knownVirtualIds.current = new Set(virtualTrades.map((t) => t.id));
      return;
    }

    for (const trade of virtualTrades) {
      if (knownVirtualIds.current.has(trade.id)) continue;
      knownVirtualIds.current.add(trade.id);

      const isProfit = trade.pnlDollars >= 0;
      const pnlStr = `${isProfit ? "+" : ""}${currFmt.format(trade.pnlDollars)}`;
      const title = `${trade.ticker} Virtual Trade ${isProfit ? "🟢" : "🔴"}`;
      const body = `${trade.strategyName} · ${pnlStr} (${isProfit ? "+" : ""}${(trade.pnlPercent * 100).toFixed(1)}%)`;

      addNotification({
        type: "virtual_trade_sell",
        title,
        body,
        timestamp: Date.now(),
        ticker: trade.ticker,
        strategyName: trade.strategyName,
        pnlDollars: trade.pnlDollars,
      });

      if (virtualNotify) {
        fireBrowserNotification(title, body, `vtrade-${trade.id}`);
      }
    }
  }, [virtualTrades]); // eslint-disable-line react-hooks/exhaustive-deps
}
