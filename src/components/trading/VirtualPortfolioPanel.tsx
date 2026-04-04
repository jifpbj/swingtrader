"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  YAxis,
} from "recharts";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Bell,
  BellOff,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useVirtualPortfolioStore } from "@/store/useVirtualPortfolioStore";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";

const currFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const currFmtSmall = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function VirtualPortfolioPanel() {
  const account = useVirtualPortfolioStore((s) => s.account);
  const positions = useVirtualPortfolioStore((s) => s.positions);
  const trades = useVirtualPortfolioStore((s) => s.trades);
  const equityHistory = useVirtualPortfolioStore((s) => s.equityHistory);
  const notificationsEnabled = useVirtualPortfolioStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useVirtualPortfolioStore((s) => s.setNotificationsEnabled);
  const recordEquitySnapshot = useVirtualPortfolioStore((s) => s.recordEquitySnapshot);
  const updatePositionPrices = useVirtualPortfolioStore((s) => s.updatePositionPrices);
  const reset = useVirtualPortfolioStore((s) => s.reset);

  const livePrice = useUIStore((s) => s.livePrice);
  const ticker = useUIStore((s) => s.ticker);

  const [showTrades, setShowTrades] = useState(false);

  // Update position prices with live data
  useEffect(() => {
    if (livePrice != null && ticker) {
      updatePositionPrices({ [ticker]: livePrice });
    }
  }, [livePrice, ticker, updatePositionPrices]);

  // Record equity snapshot every 5 minutes
  useEffect(() => {
    recordEquitySnapshot();
    const id = setInterval(recordEquitySnapshot, 5 * 60_000);
    return () => clearInterval(id);
  }, [recordEquitySnapshot]);

  const totalPnl = account.equity - 100_000;
  const totalPnlPct = (totalPnl / 100_000) * 100;
  const isPositive = totalPnl >= 0;

  const recentTrades = useMemo(() => trades.slice(0, 8), [trades]);

  // Equity chart data
  const chartData = useMemo(() => {
    if (equityHistory.length < 2) {
      // Generate a flat line if no history
      return [
        { t: 0, eq: 100_000 },
        { t: 1, eq: account.equity },
      ];
    }
    return equityHistory.map((e, i) => ({ t: i, eq: e.equity }));
  }, [equityHistory, account.equity]);

  const eqMin = Math.min(...chartData.map((d) => d.eq));
  const eqMax = Math.max(...chartData.map((d) => d.eq));
  const eqPad = Math.max((eqMax - eqMin) * 0.1, 100);

  async function handleNotificationToggle() {
    if (!notificationsEnabled) {
      if (typeof Notification !== "undefined") {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
          setNotificationsEnabled(true);
        }
      }
    } else {
      setNotificationsEnabled(false);
    }
  }

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-emerald-400" />
          <span className="text-xs font-semibold text-zinc-200">Paper Trading</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNotificationToggle}
            title={notificationsEnabled ? "Disable notifications" : "Enable trade notifications"}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          >
            {notificationsEnabled
              ? <Bell className="size-3.5 text-emerald-400" />
              : <BellOff className="size-3.5" />
            }
          </button>
          <button
            onClick={reset}
            title="Reset to $100K"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Account Value */}
      <div className="px-4 pb-2">
        <div className="text-xl font-mono font-bold text-zinc-100 tabular-nums">
          {currFmt.format(account.equity)}
        </div>
        <div className={cn(
          "flex items-center gap-1 text-xs font-medium tabular-nums mt-0.5",
          isPositive ? "text-emerald-400" : "text-red-400",
        )}>
          {isPositive
            ? <TrendingUp className="size-3" />
            : <TrendingDown className="size-3" />
          }
          <span>{isPositive ? "+" : ""}{currFmt.format(totalPnl)}</span>
          <span className="text-zinc-600">·</span>
          <span>{isPositive ? "+" : ""}{totalPnlPct.toFixed(2)}%</span>
        </div>
      </div>

      {/* Mini Equity Chart */}
      <div className="px-2 pb-1">
        <ResponsiveContainer width="100%" height={60}>
          <AreaChart data={chartData} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
            <defs>
              <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isPositive ? "#34d399" : "#ef4444"} stopOpacity={0.3} />
                <stop offset="100%" stopColor={isPositive ? "#34d399" : "#ef4444"} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <YAxis domain={[eqMin - eqPad, eqMax + eqPad]} hide />
            <Area
              type="monotone"
              dataKey="eq"
              stroke={isPositive ? "#34d399" : "#ef4444"}
              strokeWidth={1.5}
              fill="url(#eqGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Account Stats Row */}
      <div className="grid grid-cols-2 gap-px bg-white/5 mx-4 rounded-lg overflow-hidden mb-3">
        <StatCell label="Cash" value={currFmt.format(account.cash)} />
        <StatCell label="Positions" value={String(positions.length)} />
      </div>

      {/* Active Positions */}
      {positions.length > 0 && (
        <div className="px-4 pb-3">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold mb-1.5">
            Open Positions
          </p>
          <div className="flex flex-col gap-1.5">
            {positions.map((p) => {
              const pnlPos = p.unrealizedPl >= 0;
              return (
                <div
                  key={`${p.strategyId}-${p.symbol}`}
                  className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/3"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-zinc-200">{p.symbol}</span>
                    <span className="text-[9px] text-zinc-500 font-mono">
                      {p.qty} @ {currFmtSmall.format(p.avgEntryPrice)}
                    </span>
                  </div>
                  <div className={cn(
                    "text-xs font-mono font-semibold tabular-nums",
                    pnlPos ? "text-emerald-400" : "text-red-400",
                  )}>
                    {pnlPos ? "+" : ""}{currFmtSmall.format(p.unrealizedPl)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trade History Toggle */}
      {trades.length > 0 && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setShowTrades(!showTrades)}
            className="flex items-center justify-between w-full py-1.5 text-[9px] uppercase tracking-wider text-zinc-500 font-semibold hover:text-zinc-300 transition-colors"
          >
            <span>Trade History ({trades.length})</span>
            {showTrades
              ? <ChevronUp className="size-3" />
              : <ChevronDown className="size-3" />
            }
          </button>

          {showTrades && (
            <div className="flex flex-col gap-1 mt-1 max-h-48 overflow-y-auto">
              {recentTrades.map((t) => {
                const pnlPos = t.pnlDollars >= 0;
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/3"
                  >
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold text-zinc-300">{t.ticker}</span>
                      <span className="text-[8px] text-zinc-600 font-mono">
                        {new Date(t.exitTime).toLocaleDateString()}
                      </span>
                    </div>
                    <div className={cn(
                      "text-[10px] font-mono font-semibold tabular-nums",
                      pnlPos ? "text-emerald-400" : "text-red-400",
                    )}>
                      {pnlPos ? "+" : ""}{currFmtSmall.format(t.pnlDollars)}
                      <span className="text-zinc-600 ml-1">
                        ({pnlPos ? "+" : ""}{(t.pnlPercent * 100).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {positions.length === 0 && trades.length === 0 && (
        <div className="px-4 pb-4 text-center">
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            Save a strategy with <span className="text-violet-400 font-semibold">AI Analyze</span> to start paper trading.
            Signals will be tracked and trades executed automatically.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center py-2 bg-white/2">
      <span className="text-[8px] uppercase tracking-wider text-zinc-500 font-semibold">
        {label}
      </span>
      <span className="text-xs font-mono font-semibold text-zinc-200 tabular-nums">
        {value}
      </span>
    </div>
  );
}
