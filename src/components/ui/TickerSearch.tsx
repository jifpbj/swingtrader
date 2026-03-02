"use client";

import { useEffect, useCallback, useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import { cn, formatPrice, formatPercent } from "@/lib/utils";
import type { Asset } from "@/types/market";
import {
  Search,
  X,
  TrendingUp,
  TrendingDown,
  Star,
  Bitcoin,
  BarChart2,
} from "lucide-react";

// ─── Mock asset list ──────────────────────────────────────────────────────────
const ASSETS: Asset[] = [
  { symbol: "BTC/USDT", name: "Bitcoin", price: 67843.21, change24h: 1243.5, changePercent24h: 1.86, volume24h: 42_300_000_000, type: "crypto" },
  { symbol: "ETH/USDT", name: "Ethereum", price: 3812.44, change24h: -82.3, changePercent24h: -2.11, volume24h: 18_200_000_000, type: "crypto" },
  { symbol: "SOL/USDT", name: "Solana", price: 178.92, change24h: 8.14, changePercent24h: 4.77, volume24h: 4_100_000_000, type: "crypto" },
  { symbol: "BNB/USDT", name: "BNB", price: 612.3, change24h: -11.2, changePercent24h: -1.8, volume24h: 2_800_000_000, type: "crypto" },
  { symbol: "AVAX/USDT", name: "Avalanche", price: 38.74, change24h: 1.92, changePercent24h: 5.22, volume24h: 890_000_000, type: "crypto" },
  { symbol: "AAPL", name: "Apple Inc.", price: 192.53, change24h: 2.14, changePercent24h: 1.12, volume24h: 68_000_000, type: "equity" },
  { symbol: "TSLA", name: "Tesla Inc.", price: 247.88, change24h: -8.34, changePercent24h: -3.25, volume24h: 92_000_000, type: "equity" },
  { symbol: "NVDA", name: "NVIDIA Corp.", price: 875.22, change24h: 22.8, changePercent24h: 2.68, volume24h: 45_000_000, type: "equity" },
  { symbol: "EUR/USD", name: "Euro / US Dollar", price: 1.0862, change24h: 0.0034, changePercent24h: 0.31, volume24h: 0, type: "forex" },
  { symbol: "GBP/USD", name: "British Pound", price: 1.2713, change24h: -0.0021, changePercent24h: -0.16, volume24h: 0, type: "forex" },
];

const ASSET_ICONS: Record<Asset["type"], React.ElementType> = {
  crypto: Bitcoin,
  equity: BarChart2,
  forex: TrendingUp,
};

const TYPE_COLORS: Record<Asset["type"], string> = {
  crypto: "text-amber-400 bg-amber-500/10",
  equity: "text-blue-400 bg-blue-500/10",
  forex: "text-violet-400 bg-violet-500/10",
};

export function TickerSearch() {
  const open = useUIStore((s) => s.searchOpen);
  const setOpen = useUIStore((s) => s.setSearchOpen);
  const setTicker = useUIStore((s) => s.setTicker);
  const currentTicker = useUIStore((s) => s.ticker);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = ASSETS.filter(
    (a) =>
      a.symbol.toLowerCase().includes(query.toLowerCase()) ||
      a.name.toLowerCase().includes(query.toLowerCase())
  );

  const select = useCallback(
    (asset: Asset) => {
      setTicker(asset.symbol);
      setOpen(false);
      setQuery("");
    },
    [setTicker, setOpen]
  );

  // ─── Keyboard shortcut ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpen]);

  // ─── Arrow key navigation ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && filtered[activeIndex]) {
        select(filtered[activeIndex]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, activeIndex, filtered, select]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-x-0 top-24 mx-auto max-w-xl z-50 px-4">
        <div className="glass-bright rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-fade-up">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
            <Search className="size-4 text-zinc-500 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticker or asset name…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none"
            />
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto py-2">
            {filtered.length === 0 ? (
              <div className="text-center py-10 text-zinc-600 text-sm">
                No assets found for &ldquo;{query}&rdquo;
              </div>
            ) : (
              filtered.map((asset, i) => {
                const Icon = ASSET_ICONS[asset.type];
                const isUp = asset.changePercent24h >= 0;
                const isActive = i === activeIndex;
                const isCurrent = asset.symbol === currentTicker;

                return (
                  <button
                    key={asset.symbol}
                    onClick={() => select(asset)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left",
                      isActive ? "bg-white/5" : "hover:bg-white/5"
                    )}
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        "size-8 rounded-lg flex items-center justify-center shrink-0",
                        TYPE_COLORS[asset.type]
                      )}
                    >
                      <Icon className="size-4" />
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          {asset.symbol}
                        </span>
                        {isCurrent && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500 truncate block">
                        {asset.name}
                      </span>
                    </div>

                    {/* Price */}
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-sm font-mono text-white tabular-nums">
                        {asset.type === "forex"
                          ? asset.price.toFixed(4)
                          : `$${formatPrice(asset.price)}`}
                      </span>
                      <span
                        className={cn(
                          "flex items-center gap-0.5 text-xs font-mono tabular-nums",
                          isUp ? "text-emerald-400" : "text-red-400"
                        )}
                      >
                        {isUp ? (
                          <TrendingUp className="size-3" />
                        ) : (
                          <TrendingDown className="size-3" />
                        )}
                        {formatPercent(asset.changePercent24h)}
                      </span>
                    </div>

                    {/* Star placeholder */}
                    <Star className="size-3.5 text-zinc-700 shrink-0" />
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-600">
            <div className="flex items-center gap-3">
              <span><kbd className="font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono">↵</kbd> select</span>
              <span><kbd className="font-mono">Esc</kbd> close</span>
            </div>
            <span>{filtered.length} assets</span>
          </div>
        </div>
      </div>
    </>
  );
}
