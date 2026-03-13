"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";
import {
  Search,
  X,
  Bitcoin,
  BarChart2,
  Loader2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AssetResult {
  symbol:      string;
  name:        string;
  asset_class: "equity" | "crypto";
  exchange:    string;
}


const ICON: Record<AssetResult["asset_class"], React.ElementType> = {
  crypto: Bitcoin,
  equity: BarChart2,
};

const TYPE_COLOR: Record<AssetResult["asset_class"], string> = {
  crypto: "text-amber-400 bg-amber-500/10",
  equity: "text-blue-400 bg-blue-500/10",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Fallback catalog shown when backend is unreachable
const POPULAR_FALLBACK: AssetResult[] = [
  { symbol: "AAPL",    name: "Apple Inc.",                  asset_class: "equity", exchange: "NASDAQ" },
  { symbol: "NVDA",    name: "NVIDIA Corp.",                asset_class: "equity", exchange: "NASDAQ" },
  { symbol: "TSLA",    name: "Tesla Inc.",                  asset_class: "equity", exchange: "NASDAQ" },
  { symbol: "MSFT",    name: "Microsoft Corp.",             asset_class: "equity", exchange: "NASDAQ" },
  { symbol: "AMZN",    name: "Amazon.com Inc.",             asset_class: "equity", exchange: "NASDAQ" },
  { symbol: "GOOGL",   name: "Alphabet Inc.",               asset_class: "equity", exchange: "NASDAQ" },
  { symbol: "META",    name: "Meta Platforms Inc.",         asset_class: "equity", exchange: "NASDAQ" },
  { symbol: "SPY",     name: "SPDR S&P 500 ETF",           asset_class: "equity", exchange: "NYSE"   },
  { symbol: "QQQ",     name: "Invesco QQQ Trust",           asset_class: "equity", exchange: "NASDAQ" },
  { symbol: "BTC/USD", name: "Bitcoin",                     asset_class: "crypto", exchange: "CRYPTO" },
  { symbol: "ETH/USD", name: "Ethereum",                    asset_class: "crypto", exchange: "CRYPTO" },
  { symbol: "SOL/USD", name: "Solana",                      asset_class: "crypto", exchange: "CRYPTO" },
];

export function TickerSearch() {
  const open        = useUIStore((s) => s.searchOpen);
  const setOpen     = useUIStore((s) => s.setSearchOpen);
  const setTicker   = useUIStore((s) => s.setTicker);
  const currentTicker = useUIStore((s) => s.ticker);

  const [query, setQuery]             = useState("");
  const [results, setResults]         = useState<AssetResult[]>([]);
  const [loading, setLoading]         = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef     = useRef<AbortController | null>(null);
  const popularRef   = useRef<AssetResult[]>([]);

  // ─── Fetch popular on first open ───────────────────────────────────────────
  useEffect(() => {
    if (!open || popularRef.current.length > 0) return;
    setLoading(true);
    const ctrl = new AbortController();
    fetch(`${API_URL}/api/v1/market/popular`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data: AssetResult[] | null) => {
        const list = data && data.length > 0 ? data : POPULAR_FALLBACK;
        popularRef.current = list;
        if (!query.trim()) setResults(list);
      })
      .catch(() => {
        popularRef.current = POPULAR_FALLBACK;
        if (!query.trim()) setResults(POPULAR_FALLBACK);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ─── Fetch from API with debounce ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      abortRef.current?.abort();
      setResults(popularRef.current);
      setLoading(false);
      return;
    }

    setLoading(true);

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const res = await fetch(
          `${API_URL}/api/v1/market/search?q=${encodeURIComponent(query.trim())}&limit=12`,
          { signal: abortRef.current.signal }
        );
        if (res.ok) {
          const data: AssetResult[] = await res.json();
          if (data.length > 0) {
            setResults(data);
          } else {
            // Backend returned empty — filter fallback catalog locally
            const q = query.trim().toUpperCase();
            setResults(POPULAR_FALLBACK.filter(a => a.symbol.includes(q) || a.name.toUpperCase().includes(q)));
          }
        } else {
          // Non-OK — filter fallback locally
          const q = query.trim().toUpperCase();
          setResults(POPULAR_FALLBACK.filter(a => a.symbol.includes(q) || a.name.toUpperCase().includes(q)));
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        // Network error — filter fallback locally
        const q = query.trim().toUpperCase();
        setResults(POPULAR_FALLBACK.filter(a => a.symbol.includes(q) || a.name.toUpperCase().includes(q)));
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      setQuery("");
      setResults(popularRef.current);
      setActiveIndex(0);
    }
  }, [open]);

  const select = useCallback(
    (asset: AssetResult) => {
      setTicker(asset.symbol);
      setOpen(false);
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
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && results[activeIndex]) {
        select(results[activeIndex]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, activeIndex, results, select]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

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
            {loading ? (
              <Loader2 className="size-4 text-zinc-500 shrink-0 animate-spin" />
            ) : (
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto py-2">
            {!loading && results.length === 0 ? (
              <div className="text-center py-10 text-zinc-600 text-sm">
                No assets found for &ldquo;{query}&rdquo;
              </div>
            ) : (
              results.map((asset, i) => {
                const Icon     = ICON[asset.asset_class];
                const isActive  = i === activeIndex;
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
                        TYPE_COLOR[asset.asset_class]
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

                    {/* Exchange badge */}
                    {asset.exchange && (
                      <span className="text-[10px] font-mono text-zinc-600 shrink-0 bg-zinc-800/60 px-1.5 py-0.5 rounded">
                        {asset.exchange}
                      </span>
                    )}
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
            <span>{loading ? "searching…" : `${results.length} results`}</span>
          </div>
        </div>
      </div>
    </>
  );
}
