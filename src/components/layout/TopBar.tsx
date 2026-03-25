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

  return (
    <header className="glass-bright flex items-center justify-between px-4 h-14 shrink-0 border-b border-white/5 sticky top-0 z-30">
        {/* LEFT: Hamburger + Logo + Mode toggle (desktop) + Ticker + Price */}
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
          <div className="flex items-center gap-2 select-none">
            <div className="size-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-900/40">
              <Crosshair className="size-4 text-white stroke-[2.5]" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground/80 hidden sm:block">
              Predict<span className="text-emerald-400">Alpha</span>
            </span>
          </div>

          {/* Nav links — desktop only */}
          <div className="hidden md:flex items-center gap-3">
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

          {/* Ticker button */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass hover:bg-white/5 transition-colors group"
          >
            <span className="text-sm font-bold text-foreground">{ticker}</span>
            <Search className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>

          {/* Company name — desktop only */}
          {(() => {
            const entry = UNIVERSE_MAP[ticker];
            const name  = entry?.name
              ?? (ticker.includes("/") ? ticker.replace("/", " / ") : null);
            return name ? (
              <span className="hidden lg:block text-xs text-zinc-500 font-medium truncate max-w-[160px]" title={name}>
                {name}
              </span>
            ) : null;
          })()}

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

        {/* RIGHT: Notifications + User dropdown */}
        <div className="flex items-center gap-2">
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
