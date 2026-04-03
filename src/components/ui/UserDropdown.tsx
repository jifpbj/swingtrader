"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  User,
  LogIn,
  LogOut,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
  FlaskConical,
  Key,
  CreditCard,
  BarChart2,
  Zap,
  Crown,
  XCircle,
  Bell,
  SlidersHorizontal,
} from "lucide-react";
import { useUIStore, type Theme } from "@/store/useUIStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { useSubscriptionStore } from "@/store/useSubscriptionStore";
import { cn } from "@/lib/utils";

// ─── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
      {children}
    </p>
  );
}

// ─── Divider ───────────────────────────────────────────────────────────────────
function Divider() {
  return <div className="my-1 h-px bg-zinc-200 dark:bg-white/5" />;
}

// ─── Paid-only tooltip wrapper ─────────────────────────────────────────────────
function PaidTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative group/paid">
      {children}
      <span className="pointer-events-none absolute right-7 top-1/2 -translate-y-1/2 whitespace-nowrap px-2 py-0.5 rounded-md text-[10px] font-semibold bg-red-500/90 text-white shadow-lg opacity-0 group-hover/paid:opacity-100 transition-opacity duration-150 z-50">
        Only on paid plans
      </span>
    </div>
  );
}

// ─── Main dropdown ─────────────────────────────────────────────────────────────
export function UserDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Store selectors
  const theme    = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  const demoMode       = useUIStore((s) => s.demoMode);
  const setDemoMode    = useUIStore((s) => s.setDemoMode);
  const wsConnected    = useUIStore((s) => s.wsConnected);
  const setSettingsOpen                = useUIStore((s) => s.setSettingsOpen);
  const setSubscriptionModalOpen       = useUIStore((s) => s.setSubscriptionModalOpen);
  const setNotificationSettingsOpen    = useUIStore((s) => s.setNotificationSettingsOpen);


  const plan   = useSubscriptionStore((s) => s.plan);
  const status = useSubscriptionStore((s) => s.status);
  const isPaid = useSubscriptionStore((s) => s.isPaid);

  const user          = useAuthStore((s) => s.user);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const signOut       = useAuthStore((s) => s.signOut);

  // Close on outside click or Escape
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
    }
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // ── Theme options
  const themeOptions: { value: Theme; icon: React.ReactNode; label: string }[] = [
    { value: "light",  icon: <Sun className="size-3.5" />,     label: "Light"  },
    { value: "dark",   icon: <Moon className="size-3.5" />,    label: "Dark"   },
    { value: "system", icon: <Monitor className="size-3.5" />, label: "System" },
  ];

  // ── Data mode: which of the two is active (live disabled in beta)
  const dataMode = demoMode ? "demo" : "paper";

  // ── Pulse dot for live/paper when WS connected
  function PulseDot() {
    return (
      <span className="relative flex size-1.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
        <span className="relative inline-flex rounded-full size-1.5 bg-current" />
      </span>
    );
  }

  // ── Subscription badge chip
  function SubBadge() {
    if (status === "loading") return null;
    if (plan === "basic") return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-emerald-400 bg-emerald-500/15 border border-emerald-500/25">
        <Zap className="size-2.5" /> Basic
      </span>
    );
    if (plan === "executive") return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-violet-400 bg-violet-500/15 border border-violet-500/25">
        <Crown className="size-2.5" /> Executive
      </span>
    );
    // cancelled
    if (status !== "active" && plan !== "free") return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-amber-400 bg-amber-500/15 border border-amber-500/25">
        <XCircle className="size-2.5" /> Cancelled
      </span>
    );
    return (
      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium text-zinc-500 bg-zinc-700/50 border border-white/5">
        Free
      </span>
    );
  }

  function close() { setOpen(false); }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 glass rounded-lg px-2.5 py-1.5 border transition-all",
          open
            ? "border-emerald-500/40 bg-emerald-500/10 text-foreground"
            : "border-white/10 text-zinc-300 hover:text-white hover:border-white/20",
        )}
        aria-label="User menu"
        aria-expanded={open}
      >
        <User className="size-3.5 text-emerald-400 shrink-0" />
        <span className="hidden sm:block text-xs font-mono max-w-[100px] truncate">
          {user ? user.email?.split("@")[0] : "Account"}
        </span>
        <ChevronDown className={cn("size-3 transition-transform text-zinc-500", open && "rotate-180")} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className={cn(
          "absolute right-0 top-full mt-2 z-50",
          "w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl shadow-2xl shadow-zinc-300/40 dark:shadow-black/60",
          "py-1 animate-in fade-in-0 zoom-in-95 origin-top-right",
        )}>

          {/* User identity header */}
          {user && (
            <div className="px-3 py-2.5 border-b border-zinc-200 dark:border-white/5">
              <p className="text-xs font-medium text-zinc-700 dark:text-foreground/80 truncate">{user.email}</p>
              <SubBadge />
            </div>
          )}

          {/* ── Appearance ── */}
          <SectionLabel>Appearance</SectionLabel>
          <div className="px-3 pb-2 flex items-center gap-0.5 bg-zinc-100 dark:bg-white/5 rounded-xl mx-2 py-1">
            {themeOptions.map(({ value, icon, label }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                title={label}
                aria-pressed={theme === value}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all",
                  theme === value
                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : "text-zinc-400 dark:text-muted-foreground hover:text-zinc-700 dark:hover:text-foreground",
                )}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* ── Data Mode ── */}
          <SectionLabel>Data Mode</SectionLabel>
          <div className="px-2 pb-2 flex items-center gap-0.5 bg-zinc-100 dark:bg-white/5 rounded-xl mx-2 py-0.5 text-xs">
            {/* Demo */}
            <button
              onClick={() => setDemoMode(true)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md font-medium transition-all",
                dataMode === "demo"
                  ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                  : "text-zinc-400 dark:text-muted-foreground hover:text-zinc-700 dark:hover:text-foreground",
              )}
            >
              <FlaskConical className="size-3 shrink-0" />
              Demo
            </button>

            {/* Paper — free for all users */}
            <button
              onClick={() => { setDemoMode(false); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md font-medium transition-all",
                dataMode === "paper"
                  ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                  : "text-zinc-400 dark:text-muted-foreground hover:text-zinc-700 dark:hover:text-foreground",
              )}
            >
              Paper
              {dataMode === "paper" && wsConnected && <PulseDot />}
            </button>

            {/* Live trading disabled in beta */}
          </div>

          <Divider />

          {/* ── Account items ── */}
          <SectionLabel>Account</SectionLabel>

          {/* Subscription */}
          <button
            onClick={() => { setSubscriptionModalOpen(true); close(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
          >
            <CreditCard className="size-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
            <span className="flex-1 text-left">Subscription</span>
            {user && <SubBadge />}
          </button>

          {/* API Keys — open to all users in beta */}
          <button
            onClick={() => { setSettingsOpen(true); close(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
          >
            <Key className="size-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
            <span className="flex-1 text-left">API Keys</span>
          </button>

          {/* Notifications */}
          <button
            onClick={() => { setNotificationSettingsOpen(true); close(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
          >
            <Bell className="size-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
            Notifications
          </button>

          <Divider />

          {/* Screener — always accessible */}
          <Link
            href="/screener"
            onClick={close}
            className="flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
          >
            <SlidersHorizontal className="size-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
            Screener
          </Link>

          {/* Paper Portfolio — open to all users in beta */}
          <Link
            href="/portfolio"
            onClick={close}
            className="flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
          >
            <BarChart2 className="size-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
            <span className="flex-1">Paper Portfolio</span>
          </Link>
          {/* Live Trading Registration — coming soon */}

          <Divider />

          {/* Log in / Log out */}
          {user ? (
            <button
              onClick={() => { signOut(); close(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/5 transition-colors rounded-b-xl"
            >
              <LogOut className="size-3.5 shrink-0" />
              Log Out
            </button>
          ) : (
            <button
              onClick={() => { openAuthModal(); close(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/5 transition-colors rounded-b-xl"
            >
              <LogIn className="size-3.5 shrink-0" />
              Log In
            </button>
          )}
        </div>
      )}
    </div>
  );
}

