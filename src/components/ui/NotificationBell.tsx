"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell, X, TrendingUp, TrendingDown, Trash2, CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/store/useNotificationStore";
import type { AppNotification } from "@/store/useNotificationStore";

const relFmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function relativeTime(ts: number): string {
  const diff = ts - Date.now(); // negative = past
  const abs  = Math.abs(diff);
  if (abs < 60_000)  return relFmt.format(-Math.round(abs / 1_000), "second");
  if (abs < 3_600_000) return relFmt.format(-Math.round(abs / 60_000), "minute");
  if (abs < 86_400_000) return relFmt.format(-Math.round(abs / 3_600_000), "hour");
  return relFmt.format(-Math.round(abs / 86_400_000), "day");
}

function NotificationItem({
  n,
  onDismiss,
}: {
  n: AppNotification;
  onDismiss: (id: string) => void;
}) {
  const isBuy    = n.type === "trade_buy";
  const isProfit = (n.pnlDollars ?? 0) >= 0;

  return (
    <div className={cn(
      "group flex items-start gap-2.5 px-3 py-2.5 transition-colors",
      !n.read && "bg-white/3",
      "hover:bg-white/5",
    )}>
      {/* Icon */}
      <div className={cn(
        "size-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
        isBuy
          ? "bg-emerald-500/20 text-emerald-400"
          : isProfit
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-red-500/20 text-red-400",
      )}>
        {isBuy
          ? <TrendingUp className="size-3" />
          : isProfit
            ? <TrendingUp className="size-3" />
            : <TrendingDown className="size-3" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <p className={cn(
            "text-[11px] font-semibold leading-snug truncate",
            !n.read ? "text-zinc-100" : "text-zinc-300",
          )}>
            {n.title}
          </p>
          <button
            onClick={() => onDismiss(n.id)}
            className="shrink-0 text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all -mt-0.5"
          >
            <X className="size-3" />
          </button>
        </div>
        <p className="text-[10px] text-zinc-400 leading-snug mt-0.5 line-clamp-2">
          {n.body}
        </p>
        <p className="text-[9px] text-zinc-600 mt-1 tabular-nums">
          {relativeTime(n.timestamp)}
        </p>
      </div>

      {/* Unread dot */}
      {!n.read && (
        <span className="size-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
      )}
    </div>
  );
}

export function NotificationBell() {
  const { notifications, dismissNotification, clearAll, markAllRead } =
    useNotificationStore();

  const [open, setOpen]               = useState(false);
  const [permDenied, setPermDenied]   = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const panelRef                      = useRef<HTMLDivElement>(null);
  const buttonRef                     = useRef<HTMLButtonElement>(null);

  const unread = notifications.filter((n) => !n.read).length;

  // ── Check notification permission after mount (avoids SSR mismatch) ────────
  useEffect(() => {
    if ("Notification" in window) {
      setNeedsPermission(Notification.permission === "default");
    }
  }, []);

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current?.contains(e.target as Node) ||
        buttonRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // ── Mark all read when opening ─────────────────────────────────────────────
  function handleOpen() {
    if (!open) markAllRead();
    setOpen((v) => !v);
  }

  // ── Browser notification permission ───────────────────────────────────────
  async function requestPermission() {
    const result = await Notification.requestPermission();
    setPermDenied(result === "denied");
    setNeedsPermission(false);
  }


  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className={cn(
          "p-2 rounded-lg hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors relative",
          open && "bg-white/8 text-zinc-200",
        )}
        aria-label="Notifications"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-emerald-500 text-[8px] font-bold text-white flex items-center justify-center tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        {unread === 0 && (
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-zinc-600" />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-80 z-50 glass-bright border border-white/12 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/8">
            <div className="flex items-center gap-2">
              <Bell className="size-3.5 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-200">Notifications</span>
              {notifications.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-white/8 text-[9px] font-mono text-zinc-400">
                  {notifications.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {notifications.length > 0 && (
                <>
                  <button
                    onClick={markAllRead}
                    title="Mark all read"
                    className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/8 transition-colors"
                  >
                    <CheckCheck className="size-3.5" />
                  </button>
                  <button
                    onClick={clearAll}
                    title="Clear all"
                    className="p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Permission request */}
          {needsPermission && !permDenied && (
            <div className="mx-3 mt-2.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2">
              <Bell className="size-3 text-amber-400 shrink-0 mt-px" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-amber-300 leading-snug">
                  Enable browser notifications to get alerted even when the tab is in the background.
                </p>
                <button
                  onClick={requestPermission}
                  className="mt-1.5 text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Enable notifications →
                </button>
              </div>
            </div>
          )}

          {/* Notification list */}
          <div className={cn(
            "overflow-y-auto",
            notifications.length > 0 ? "max-h-[360px]" : "",
          )}>
            {notifications.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-2 text-zinc-600">
                <Bell className="size-6 opacity-30" />
                <p className="text-xs">No notifications yet</p>
                <p className="text-[10px] text-zinc-700">
                  Trade signals will appear here
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    n={n}
                    onDismiss={dismissNotification}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-white/8 px-3 py-2 flex justify-end">
              <button
                onClick={clearAll}
                className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors font-medium"
              >
                Clear all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
