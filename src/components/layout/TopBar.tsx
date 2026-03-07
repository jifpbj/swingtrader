"use client";

import { useUIStore } from "@/store/useUIStore";
import { useAuthStore } from "@/store/useAuthStore";
import { formatPrice, formatPercent } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Wifi,
  WifiOff,
  Search,
  Settings,
  Bell,
  ChevronUp,
  ChevronDown,
  LogIn,
  LogOut,
  User,
  Menu,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { TradingModeToggle } from "@/components/algo/TradingModeToggle";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

export function TopBar() {
  const ticker        = useUIStore((s) => s.ticker);
  const timeframe     = useUIStore((s) => s.timeframe);
  const setTimeframe  = useUIStore((s) => s.setTimeframe);
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const wsConnected   = useUIStore((s) => s.wsConnected);

  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const user          = useAuthStore((s) => s.user);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const signOut       = useAuthStore((s) => s.signOut);

  const livePrice = useUIStore((s) => s.livePrice);
  const priceOpen = useUIStore((s) => s.priceOpen);
  const high24h   = useUIStore((s) => s.high24h);
  const low24h    = useUIStore((s) => s.low24h);
  const volume24h = useUIStore((s) => s.volume24h);

  const change        = livePrice != null && priceOpen ? livePrice - priceOpen : null;
  const changePercent = change != null && priceOpen    ? (change / priceOpen) * 100 : null;
  const isUp = (changePercent ?? 0) >= 0;

  return (
    <header className="glass-bright flex items-center justify-between px-4 h-14 shrink-0 border-b border-white/5 z-30">
      {/* LEFT: Logo + Ticker info */}
      <div className="flex items-center gap-3 sm:gap-6">
        {/* Hamburger — mobile only */}
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 select-none">
          <div className="size-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-900/40">
            <span className="text-xs font-black text-white">PA</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground/80 hidden sm:block">
            Predictive<span className="text-emerald-400">Alpha</span>
          </span>
        </div>

        {/* Ticker button */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass hover:bg-white/5 transition-colors group"
        >
          <span className="text-sm font-bold text-foreground">{ticker}</span>
          <Search className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>

        {/* Price */}
        <div className="hidden md:flex items-center gap-3">
          <span className="text-lg font-mono font-semibold text-foreground tabular-nums">
            {livePrice != null ? `$${formatPrice(livePrice)}` : <span className="text-zinc-600 text-sm">—</span>}
          </span>
          {changePercent != null && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-sm font-medium tabular-nums",
                isUp ? "text-emerald-400" : "text-red-400"
              )}
            >
              {isUp ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              {formatPercent(Math.abs(changePercent))}
            </span>
          )}
        </div>

        {/* OHLC stats */}
        <div className="hidden lg:flex items-center gap-4 text-xs text-muted-foreground">
          {high24h   != null && <Stat label="H" value={`$${formatPrice(high24h)}`} />}
          {low24h    != null && <Stat label="L" value={`$${formatPrice(low24h)}`} />}
          {volume24h != null && (
            <Stat label="Vol" value={volume24h >= 1e9
              ? `${(volume24h / 1e9).toFixed(2)}B`
              : volume24h >= 1e6
              ? `${(volume24h / 1e6).toFixed(2)}M`
              : volume24h.toFixed(0)
            } />
          )}
        </div>
      </div>

      {/* CENTER: Timeframe selector */}
      <div className="flex items-center gap-1 glass rounded-xl px-1 py-1">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
              timeframe === tf
                ? "bg-emerald-500/20 text-emerald-400 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* RIGHT: Controls */}
      <div className="flex items-center gap-2">
        {/* Paper / Live trading mode toggle */}
        <div className="hidden sm:block">
          <TradingModeToggle />
        </div>

        {/* WS status */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors",
            wsConnected
              ? "text-emerald-400 bg-emerald-500/10"
              : "text-muted-foreground bg-muted/50"
          )}
        >
          {wsConnected ? (
            <Wifi className="size-3.5" />
          ) : (
            <WifiOff className="size-3.5" />
          )}
          <span className="hidden sm:block">
            {wsConnected ? "Live" : "Offline"}
          </span>
          {wsConnected && (
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </div>

        <ThemeToggle />

        <button className="p-2 rounded-lg hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors relative">
          <Bell className="size-4" />
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-emerald-400" />
        </button>

        <button className="p-2 rounded-lg hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors">
          <Settings className="size-4" />
        </button>

        {/* User auth indicator */}
        {user ? (
          <div className="flex items-center gap-1.5 glass rounded-lg px-2.5 py-1.5 border border-white/10">
            <User className="size-3.5 text-emerald-400 shrink-0" />
            <span className="hidden sm:block text-xs font-mono text-zinc-300 max-w-[100px] truncate">
              {user.email?.split("@")[0]}
            </span>
            <button
              onClick={() => signOut()}
              title="Sign out"
              className="text-zinc-500 hover:text-zinc-200 transition-colors ml-0.5"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={openAuthModal}
            className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium text-zinc-300 hover:text-white border border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all"
          >
            <LogIn className="size-3.5" />
            <span className="hidden sm:block">Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-muted-foreground">{label} </span>
      <span className="text-foreground/70 font-mono">{value}</span>
    </span>
  );
}
