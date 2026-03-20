"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, TrendingUp, TrendingDown, BarChart3, Zap,
  Droplets, ChevronUp, ChevronDown, RefreshCw, Loader2,
  FlaskConical, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useScreenerData, type ScreenerCategory, type ScreenerStock } from "@/hooks/useScreenerData";
import { useUIStore } from "@/store/useUIStore";

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES: {
  id: ScreenerCategory;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}[] = [
  { id: "gainers",       label: "Top Gainers",          icon: TrendingUp,    color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/25" },
  { id: "losers",        label: "Top Losers",           icon: TrendingDown,  color: "text-red-400",     bg: "bg-red-500/10 border-red-500/25" },
  { id: "volume",        label: "High Volume",          icon: BarChart3,     color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/25" },
  { id: "volatility",   label: "Unusual Volatility",   icon: Zap,           color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/25" },
  { id: "liquidity",    label: "Liquidity",             icon: Droplets,      color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/25" },
  { id: "trending_up",   label: "Trending Up",          icon: ChevronUp,     color: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/25" },
  { id: "trending_down", label: "Trending Down",        icon: ChevronDown,   color: "text-red-300",     bg: "bg-red-500/10 border-red-500/25" },
  { id: "new_high",      label: "New High",             icon: Activity,      color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/25" },
  { id: "new_low",       label: "New Low",              icon: Activity,      color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/25" },
];

// ─── Formatters ───────────────────────────────────────────────────────────────

const priceFmt = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

function fmtVolume(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function fmtDollarVol(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(0)}M`;
  return `$${(v / 1_000).toFixed(0)}K`;
}

// ─── Stock row ────────────────────────────────────────────────────────────────

function StockRow({
  stock,
  rank,
  category,
  onClick,
}: {
  stock: ScreenerStock;
  rank: number;
  category: ScreenerCategory;
  onClick: () => void;
}) {
  const isPos = stock.changePercent >= 0;

  const subStat = () => {
    switch (category) {
      case "volume":
      case "liquidity":     return { label: "Vol", value: fmtVolume(stock.volume) };
      case "volatility":    return { label: "Range", value: `${stock.volatility.toFixed(1)}%` };
      case "new_high":      return { label: "High", value: priceFmt.format(stock.high) };
      case "new_low":       return { label: "Low",  value: priceFmt.format(stock.low)  };
      default:              return { label: "Vol", value: fmtVolume(stock.volume) };
    }
  };

  const sub = subStat();

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors text-left group"
    >
      {/* Rank */}
      <span className="w-5 text-[10px] font-mono text-muted-foreground/70 shrink-0 text-right">
        {rank}
      </span>

      {/* Symbol + Name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-foreground tracking-wide font-mono">
            {stock.symbol}
          </span>
          {stock.sector && (
            <span className="hidden sm:inline text-[9px] font-medium text-muted-foreground/70 uppercase tracking-wider">
              {stock.sector}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{stock.name}</p>
      </div>

      {/* Sub stat */}
      <div className="text-right shrink-0 hidden sm:block">
        <p className="text-[9px] text-muted-foreground/70 uppercase tracking-wide">{sub.label}</p>
        <p className="text-[11px] font-mono text-muted-foreground">{sub.value}</p>
      </div>

      {/* Price */}
      <div className="text-right shrink-0 min-w-[72px]">
        <p className="text-[13px] font-mono font-semibold text-foreground">
          {priceFmt.format(stock.price)}
        </p>
        <p className="text-[10px] font-mono text-muted-foreground">
          {fmtDollarVol(stock.dollarVolume)}
        </p>
      </div>

      {/* Change % */}
      <div className={cn(
        "shrink-0 min-w-[58px] text-right px-2 py-1 rounded-lg",
        isPos ? "bg-emerald-500/12" : "bg-red-500/12",
      )}>
        <span className={cn(
          "text-[13px] font-mono font-bold",
          isPos ? "dark:text-emerald-400 text-emerald-600" : "dark:text-red-400 text-red-600",
        )}>
          {isPos ? "+" : ""}{stock.changePercent.toFixed(2)}%
        </span>
        <p className={cn(
          "text-[9px] font-mono",
          isPos ? "dark:text-emerald-400/60 text-emerald-600/60" : "dark:text-red-400/60 text-red-600/60",
        )}>
          {isPos ? "+" : ""}{priceFmt.format(stock.changeDollar)}
        </p>
      </div>

      {/* Arrow hint */}
      <ChevronRight className="size-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
    </button>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyCategory({ category }: { category: ScreenerCategory }) {
  const msgs: Partial<Record<ScreenerCategory, string>> = {
    new_high:      "No stocks hit a new intraday high today.",
    new_low:       "No stocks hit a new intraday low today.",
    trending_up:   "No stocks are trending up ≥ 1.5% today.",
    trending_down: "No stocks are trending down ≤ −1.5% today.",
  };
  return (
    <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground/70">
      <Activity className="size-6 opacity-40" />
      <p className="text-sm">{msgs[category] ?? "No data for this category."}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScreenerPage() {
  const router    = useRouter();
  const setTicker = useUIStore((s) => s.setTicker);
  const [activeCategory, setActiveCategory] = useState<ScreenerCategory>("gainers");
  const { data, loading, isMock, refresh } = useScreenerData();
  const [refreshing, setRefreshing] = useState(false);

  const activeCfg = CATEGORIES.find((c) => c.id === activeCategory)!;
  const stocks: ScreenerStock[] = data ? data[activeCategory] : [];

  async function handleRefresh() {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }

  function handleStockClick(symbol: string) {
    setTicker(symbol);
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 glass border-b border-border px-4 py-3 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
          title="Back to Dashboard"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-emerald-500" />
          <span className="text-sm font-semibold text-foreground">Stock Screener</span>
        </div>

        {isMock && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 text-[10px] font-semibold">
            <FlaskConical className="size-3" />
            Demo Data
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/70 hidden sm:block">
            {data ? `${data.all.length} stocks` : ""}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={cn("size-4", (refreshing || loading) && "animate-spin")} />
          </button>
        </div>
      </header>

      {/* ── Category tabs ────────────────────────────────────────────── */}
      <div className="sticky top-[53px] z-20 glass border-b border-border">
        <div className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-none">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = cat.id === activeCategory;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all border",
                  isActive
                    ? cn(cat.bg, cat.color)
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/50",
                )}
              >
                <Icon className="size-3 shrink-0" />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-0 sm:px-4 py-4">

        {/* Category header */}
        <div className="flex items-center gap-2 px-4 sm:px-0 mb-3">
          <activeCfg.icon className={cn("size-4 shrink-0", activeCfg.color)} />
          <h2 className="text-sm font-semibold text-foreground/80">{activeCfg.label}</h2>
          {!loading && stocks.length > 0 && (
            <span className="text-[10px] text-muted-foreground/70 font-mono">
              {stocks.length} results
            </span>
          )}
        </div>

        {/* Column headers */}
        {stocks.length > 0 && (
          <div className="flex items-center gap-3 px-4 pb-1 text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">
            <span className="w-5 text-right">#</span>
            <span className="flex-1">Symbol / Name</span>
            <span className="hidden sm:block w-16 text-right">Stat</span>
            <span className="w-[72px] text-right">Price</span>
            <span className="w-[58px] text-right">Change</span>
            <span className="w-[14px]" />
          </div>
        )}

        {/* Stock list */}
        <div className="glass rounded-xl sm:rounded-2xl border border-border overflow-hidden divide-y divide-border">
          {loading ? (
            <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              <p className="text-sm">Loading market data…</p>
            </div>
          ) : stocks.length === 0 ? (
            <EmptyCategory category={activeCategory} />
          ) : (
            stocks.map((stock, i) => (
              <StockRow
                key={stock.symbol}
                stock={stock}
                rank={i + 1}
                category={activeCategory}
                onClick={() => handleStockClick(stock.symbol)}
              />
            ))
          )}
        </div>

        {/* Footer hint */}
        {!loading && stocks.length > 0 && (
          <p className="text-center text-[10px] text-muted-foreground/60 mt-4 pb-6">
            Click any stock to open its candlestick chart →{" "}
            {isMock && "Connect Alpaca credentials for live market data"}
          </p>
        )}
      </div>
    </main>
  );
}
