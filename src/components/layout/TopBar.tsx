"use client";

import { useUIStore } from "@/store/useUIStore";
import { formatPrice, formatPercent, getChangeColor } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Wifi,
  WifiOff,
  Search,
  Settings,
  Bell,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

// Mock ticker stats (replace with TanStack Query in production)
const MOCK_STATS = {
  price: 67_843.21,
  change: 1_243.5,
  changePercent: 1.86,
  high24h: 68_950.0,
  low24h: 65_120.0,
  volume24h: 42_300_000_000,
};

export function TopBar() {
  const ticker = useUIStore((s) => s.ticker);
  const timeframe = useUIStore((s) => s.timeframe);
  const setTimeframe = useUIStore((s) => s.setTimeframe);
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const wsConnected = useUIStore((s) => s.wsConnected);

  const isUp = MOCK_STATS.changePercent >= 0;

  return (
    <header className="glass-bright flex items-center justify-between px-4 h-14 shrink-0 border-b border-white/5 z-30">
      {/* LEFT: Logo + Ticker info */}
      <div className="flex items-center gap-6">
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
            ${formatPrice(MOCK_STATS.price)}
          </span>
          <span
            className={cn(
              "flex items-center gap-0.5 text-sm font-medium tabular-nums",
              isUp ? "text-emerald-400" : "text-red-400"
            )}
          >
            {isUp ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {formatPercent(MOCK_STATS.changePercent)}
          </span>
        </div>

        {/* OHLC stats */}
        <div className="hidden lg:flex items-center gap-4 text-xs text-muted-foreground">
          <Stat label="H" value={`$${formatPrice(MOCK_STATS.high24h)}`} />
          <Stat label="L" value={`$${formatPrice(MOCK_STATS.low24h)}`} />
          <Stat
            label="Vol"
            value={`${(MOCK_STATS.volume24h / 1e9).toFixed(1)}B`}
          />
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

        <button
          onClick={() => setSearchOpen(true)}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 glass rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Search className="size-3.5" />
          <span>Search</span>
          <kbd className="ml-1 px-1.5 py-0.5 rounded bg-white/5 text-[10px] font-mono">⌘K</kbd>
        </button>
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
