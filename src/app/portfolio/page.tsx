"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Wallet, TrendingUp, TrendingDown, Activity, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { useStrategyStore } from "@/store/useStrategyStore";
import { PositionsTable } from "@/components/portfolio/PositionsTable";
import { TradeHistoryTable } from "@/components/portfolio/TradeHistoryTable";
import { EquityChart } from "@/components/portfolio/EquityChart";
import { PnLChart } from "@/components/portfolio/PnLChart";
import { TimePeriodSelector, periodToStartMs, type TimePeriod } from "@/components/portfolio/TimePeriodSelector";

const currFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Map our TimePeriod to Alpaca's period param */
function periodToAlpaca(period: TimePeriod): string {
  switch (period) {
    case "1W":  return "1W";
    case "30D": return "1M";
    case "90D": return "3M";
    case "6M":  return "6M";
    case "1Y":  return "1A";
    case "YTD": return "1A"; // filter client-side to Jan 1
  }
}

export default function PortfolioPage() {
  const user              = useAuthStore((s) => s.user);
  const account           = useAlpacaStore((s) => s.account);
  const positions         = useAlpacaStore((s) => s.positions);
  const orders            = useAlpacaStore((s) => s.orders);
  const portfolioHistory  = useAlpacaStore((s) => s.portfolioHistory);
  const fetchPositions    = useAlpacaStore((s) => s.fetchPositions);
  const fetchPortfolioHistory = useAlpacaStore((s) => s.fetchPortfolioHistory);
  const strategies        = useStrategyStore((s) => s.strategies);
  const [period, setPeriod] = useState<TimePeriod>("30D");
  const [refreshing, setRefreshing] = useState(false);

  // Fetch portfolio history when period changes (or on mount)
  useEffect(() => {
    if (!account) return;
    void fetchPortfolioHistory(periodToAlpaca(period));
  }, [account, period, fetchPortfolioHistory]);

  // For YTD, filter portfolio history client-side to Jan 1 of current year
  const filteredHistory = useMemo(() => {
    if (!portfolioHistory) return null;
    if (period !== "YTD") return portfolioHistory;
    const jan1 = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
    const startIdx = portfolioHistory.timestamp.findIndex((ts) => ts >= jan1);
    if (startIdx <= 0) return portfolioHistory;
    return {
      ...portfolioHistory,
      timestamp: portfolioHistory.timestamp.slice(startIdx),
      equity: portfolioHistory.equity.slice(startIdx),
      profit_loss: portfolioHistory.profit_loss.slice(startIdx),
      profit_loss_pct: portfolioHistory.profit_loss_pct.slice(startIdx),
    };
  }, [portfolioHistory, period]);

  // Filter orders by selected time period
  const filteredOrders = useMemo(() => {
    const cutoff = periodToStartMs(period);
    return orders.filter((o) => new Date(o.created_at).getTime() >= cutoff);
  }, [orders, period]);

  const unrealPnl = positions.reduce((s, p) => s + p.unrealized_pl, 0);

  // Derive P/L and return from portfolio history
  const periodPnl = filteredHistory && filteredHistory.profit_loss.length > 0
    ? filteredHistory.profit_loss[filteredHistory.profit_loss.length - 1]
    : null;
  const periodReturn = filteredHistory && filteredHistory.profit_loss_pct.length > 0
    ? filteredHistory.profit_loss_pct[filteredHistory.profit_loss_pct.length - 1]
    : null;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([fetchPositions(), fetchPortfolioHistory(periodToAlpaca(period))]);
    } finally { setRefreshing(false); }
  }

  // Not logged in
  if (!user) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Please sign in to view your portfolio.</p>
          <Link href="/dashboard" className="text-emerald-400 hover:text-emerald-300 text-sm underline">
            Go to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 glass border-b border-border px-4 py-3 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
          title="Back to Dashboard"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-emerald-500" />
          <span className="text-sm font-semibold text-foreground">Portfolio</span>
        </div>
        {account && (
          <div className="ml-auto flex items-center gap-4 text-[11px]">
            <div className="text-right">
              <p className="text-muted-foreground">Equity</p>
              <p className="font-mono font-bold text-foreground">{currFmt.format(account.equity)}</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground">Buying Power</p>
              <p className="font-mono font-bold text-foreground">{currFmt.format(account.buying_power)}</p>
            </div>
          </div>
        )}
        {!account && (
          <p className="ml-auto text-[11px] text-muted-foreground/70">
            Connect Alpaca in the dashboard to see live positions
          </p>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-8">

        {/* ── Summary cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass rounded-2xl p-4 flex flex-col gap-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Open Positions</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{positions.length}</p>
          </div>
          <div className="glass rounded-2xl p-4 flex flex-col gap-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Unrealized P/L</p>
            <p className={cn(
              "text-2xl font-bold tabular-nums font-mono",
              unrealPnl >= 0 ? "dark:text-emerald-400 text-emerald-600" : "dark:text-red-400 text-red-600",
            )}>
              {unrealPnl >= 0 ? "+" : ""}{currFmt.format(unrealPnl)}
            </p>
          </div>
          <div className="glass rounded-2xl p-4 flex flex-col gap-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              P/L ({period})
            </p>
            <div className="flex items-center gap-1.5">
              {(periodPnl ?? 0) >= 0
                ? <TrendingUp className="size-4 dark:text-emerald-400 text-emerald-600 shrink-0" />
                : <TrendingDown className="size-4 dark:text-red-400 text-red-600 shrink-0" />}
              <p className={cn(
                "text-2xl font-bold tabular-nums font-mono",
                (periodPnl ?? 0) >= 0 ? "dark:text-emerald-400 text-emerald-600" : "dark:text-red-400 text-red-600",
              )}>
                {periodPnl != null ? `${periodPnl >= 0 ? "+" : ""}${currFmt.format(periodPnl)}` : "—"}
              </p>
            </div>
          </div>
          <div className="glass rounded-2xl p-4 flex flex-col gap-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              Return ({period})
            </p>
            <div className="flex items-center gap-1.5">
              <Activity className="size-4 text-muted-foreground shrink-0" />
              <p className={cn(
                "text-2xl font-bold tabular-nums font-mono",
                (periodReturn ?? 0) >= 0 ? "dark:text-emerald-400 text-emerald-600" : "dark:text-red-400 text-red-600",
              )}>
                {periodReturn != null ? `${periodReturn >= 0 ? "+" : ""}${(periodReturn * 100).toFixed(2)}%` : "—"}
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground/70 font-mono">
              {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""} in period
            </p>
          </div>
        </div>

        {/* ── Active Positions ────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Active Positions</h2>
            <button
              onClick={handleRefresh}
              disabled={refreshing || !account}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-transparent hover:border-border transition-all disabled:opacity-40"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              Refresh
            </button>
          </div>
          <PositionsTable positions={positions} />
        </section>

        {/* ── Trade History ───────────────────────────────────────────── */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-semibold text-foreground">Trade History</h2>
            <TimePeriodSelector value={period} onChange={setPeriod} />
          </div>

          {/* Equity Chart */}
          <div className="glass rounded-2xl p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-3">
              Account Value — {period}
            </p>
            <EquityChart history={filteredHistory} />
          </div>

          {/* P/L Chart */}
          <div className="glass rounded-2xl p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-3">
              Profit / Loss — {period}
            </p>
            <PnLChart history={filteredHistory} />
          </div>

          {/* Order table */}
          <TradeHistoryTable orders={filteredOrders} strategies={strategies} period={period} />
        </section>
      </div>
    </main>
  );
}
