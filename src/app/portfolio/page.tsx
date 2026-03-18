"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Wallet, TrendingUp, TrendingDown, Activity, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { useTradeStore } from "@/store/useTradeStore";
import { PositionsTable } from "@/components/portfolio/PositionsTable";
import { TradeHistoryTable } from "@/components/portfolio/TradeHistoryTable";
import { PnLChart } from "@/components/portfolio/PnLChart";
import { TimePeriodSelector, periodToStartMs, type TimePeriod } from "@/components/portfolio/TimePeriodSelector";

const currFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function PortfolioPage() {
  const user        = useAuthStore((s) => s.user);
  const account     = useAlpacaStore((s) => s.account);
  const positions   = useAlpacaStore((s) => s.positions);
  const fetchPositions = useAlpacaStore((s) => s.fetchPositions);
  const trades      = useTradeStore((s) => s.trades);
  const [period, setPeriod] = useState<TimePeriod>("30D");
  const [refreshing, setRefreshing] = useState(false);

  // Filter trades for the selected period
  const filteredTrades = useMemo(() => {
    const cutoff = periodToStartMs(period);
    return trades.filter((t) => t.createdAt >= cutoff);
  }, [trades, period]);

  const totalPnl   = filteredTrades.reduce((s, t) => s + t.pnlDollars, 0);
  const winCount   = filteredTrades.filter((t) => t.pnlDollars > 0).length;
  const winRate    = filteredTrades.length > 0 ? winCount / filteredTrades.length : null;
  const unrealPnl  = positions.reduce((s, p) => s + p.unrealized_pl, 0);

  async function handleRefresh() {
    setRefreshing(true);
    try { await fetchPositions(); } finally { setRefreshing(false); }
  }

  // Not logged in
  if (!user) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">Please sign in to view your portfolio.</p>
          <Link href="/dashboard" className="text-emerald-400 hover:text-emerald-300 text-sm underline">
            Go to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 glass border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-all"
          title="Back to Dashboard"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-emerald-400" />
          <span className="text-sm font-semibold text-zinc-200">Portfolio</span>
        </div>
        {account && (
          <div className="ml-auto flex items-center gap-4 text-[11px]">
            <div className="text-right">
              <p className="text-zinc-500">Equity</p>
              <p className="font-mono font-bold text-zinc-200">{currFmt.format(account.equity)}</p>
            </div>
            <div className="text-right">
              <p className="text-zinc-500">Buying Power</p>
              <p className="font-mono font-bold text-zinc-200">{currFmt.format(account.buying_power)}</p>
            </div>
          </div>
        )}
        {!account && (
          <p className="ml-auto text-[11px] text-zinc-600">
            Connect Alpaca in the dashboard to see live positions
          </p>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-8">

        {/* ── Summary cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass rounded-2xl p-4 flex flex-col gap-1">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">Open Positions</p>
            <p className="text-2xl font-bold text-zinc-100 tabular-nums">{positions.length}</p>
          </div>
          <div className="glass rounded-2xl p-4 flex flex-col gap-1">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">Unrealized P/L</p>
            <p className={cn(
              "text-2xl font-bold tabular-nums font-mono",
              unrealPnl >= 0 ? "text-emerald-400" : "text-red-400",
            )}>
              {unrealPnl >= 0 ? "+" : ""}{currFmt.format(unrealPnl)}
            </p>
          </div>
          <div className="glass rounded-2xl p-4 flex flex-col gap-1">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">
              Realized P/L ({period})
            </p>
            <div className="flex items-center gap-1.5">
              {totalPnl >= 0
                ? <TrendingUp className="size-4 text-emerald-400 shrink-0" />
                : <TrendingDown className="size-4 text-red-400 shrink-0" />}
              <p className={cn(
                "text-2xl font-bold tabular-nums font-mono",
                totalPnl >= 0 ? "text-emerald-400" : "text-red-400",
              )}>
                {totalPnl >= 0 ? "+" : ""}{currFmt.format(totalPnl)}
              </p>
            </div>
          </div>
          <div className="glass rounded-2xl p-4 flex flex-col gap-1">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">Win Rate ({period})</p>
            <div className="flex items-center gap-1.5">
              <Activity className="size-4 text-zinc-500 shrink-0" />
              <p className="text-2xl font-bold tabular-nums font-mono text-zinc-200">
                {winRate !== null ? `${(winRate * 100).toFixed(0)}%` : "—"}
              </p>
            </div>
            {filteredTrades.length > 0 && (
              <p className="text-[10px] text-zinc-600 font-mono">
                {winCount}W / {filteredTrades.length - winCount}L ({filteredTrades.length} trades)
              </p>
            )}
          </div>
        </div>

        {/* ── Active Positions ────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Active Positions</h2>
            <button
              onClick={handleRefresh}
              disabled={refreshing || !account}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent hover:border-white/10 transition-all disabled:opacity-40"
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
            <h2 className="text-sm font-semibold text-zinc-200">Trade History</h2>
            <TimePeriodSelector value={period} onChange={setPeriod} />
          </div>

          {/* P/L Chart */}
          <div className="glass rounded-2xl p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium mb-3">
              Cumulative P/L — {period}
            </p>
            <PnLChart trades={filteredTrades} />
          </div>

          {/* Trade table */}
          <TradeHistoryTable trades={filteredTrades} period={period} />
        </section>
      </div>
    </main>
  );
}
