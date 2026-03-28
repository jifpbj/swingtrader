"use client";

import { useUIStore } from "@/store/useUIStore";
import { UNIVERSE_MAP } from "@/lib/screenerUniverse";
import { formatPrice, formatPercent } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Search, ChevronUp, ChevronDown, Menu, Crosshair } from "lucide-react";
import Link from "next/link";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { UserDropdown } from "@/components/ui/UserDropdown";

export function TopBar() {
  const ticker       = useUIStore((s) => s.ticker);
  const setSearchOpen   = useUIStore((s) => s.setSearchOpen);
  const toggleSidebar   = useUIStore((s) => s.toggleSidebar);

  const livePrice = useUIStore((s) => s.livePrice);
  const priceOpen = useUIStore((s) => s.priceOpen);
  const high24h   = useUIStore((s) => s.high24h);
  const low24h    = useUIStore((s) => s.low24h);
  const volume24h = useUIStore((s) => s.volume24h);

  const change        = livePrice != null && priceOpen ? livePrice - priceOpen : null;
  const changePercent = change != null && priceOpen    ? (change / priceOpen) * 100 : null;
  const isUp = (changePercent ?? 0) >= 0;

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

  return (
    <header className="glass-bright relative flex items-center justify-between px-4 h-14 shrink-0 border-b border-white/5 sticky top-0 z-30">
        {/* LEFT: Hamburger + Logo + Nav */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Hamburger — mobile only */}
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors md:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>

          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 select-none hover:opacity-80 transition-opacity">
            <div className="size-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-900/40">
              <Crosshair className="size-4 text-white stroke-[2.5]" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground/80 hidden sm:block">
              Predict<span className="text-emerald-400">Alpha</span>
            </span>
          </Link>

          {/* Nav links — large screens only (center search bar needs space on md) */}
          <div className="hidden lg:flex items-center gap-3">
            <Link href="/#pricing" className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors font-medium">
              Pricing
            </Link>
            <Link href="/portfolio" className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors font-medium">
              Portfolio
            </Link>
            <Link href="/screener" className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors font-medium">
              Screener
            </Link>
          </div>
        </div>

        {/* CENTER: Prominent search bar — absolutely centered */}
        <button
          onClick={() => setSearchOpen(true)}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2",
            "flex items-center gap-2.5 px-3.5 py-2 rounded-xl",
            "w-48 sm:w-56 md:w-64",
            "bg-amber-500/12 border border-amber-500/30",
            "hover:bg-amber-500/20 hover:border-amber-500/50",
            "transition-all duration-200 group cursor-pointer",
          )}
        >
          <Search className="size-4 text-amber-400/80 group-hover:text-amber-300 transition-colors shrink-0" />
          <span className="text-sm font-bold text-amber-100/90 group-hover:text-amber-50 transition-colors truncate">
            {ticker}
          </span>
          {/* Company name inline — only on larger screens */}
          {(() => {
            const entry = UNIVERSE_MAP[ticker];
            const name  = entry?.name
              ?? (ticker.includes("/") ? ticker.replace("/", " / ") : null);
            return name ? (
              <span className="hidden lg:block text-xs text-amber-200/30 font-medium truncate">
                {name}
              </span>
            ) : null;
          })()}
          <kbd className="ml-auto shrink-0 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/20 text-[10px] font-mono text-amber-400/60 font-medium">
            {isMac ? "\u2318" : "Ctrl"}K
          </kbd>
        </button>

        {/* RIGHT: Price + Notifications + User dropdown */}
        <div className="flex items-center gap-3">
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

          <NotificationBell />
          <UserDropdown />
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
