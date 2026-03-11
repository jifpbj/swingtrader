"use client";

import { useState } from "react";
import {
  Trash2, TrendingUp, TrendingDown, Loader2, Bot, PowerOff,
  ChevronDown, ChevronUp, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/utils";
import { useStrategyStore } from "@/store/useStrategyStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useUIStore } from "@/store/useUIStore";
import { useTradeStore } from "@/store/useTradeStore";
import type { SavedStrategy, IndicatorType } from "@/types/strategy";
import type { Timeframe } from "@/types/market";

const INDICATOR_COLORS: Record<IndicatorType, string> = {
  EMA:  "bg-amber-500/15  text-amber-400  border-amber-500/20",
  BB:   "bg-sky-500/15    text-sky-400    border-sky-500/20",
  RSI:  "bg-violet-500/15 text-violet-400 border-violet-500/20",
  MACD: "bg-rose-500/15   text-rose-400   border-rose-500/20",
  TD9:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
};

const currFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

interface Props {
  strategy: SavedStrategy;
}

export function StrategyCard({ strategy }: Props) {
  const user               = useAuthStore((s) => s.user);
  const { activeStrategyId, setActiveStrategy, updateStrategy, deleteStrategy } = useStrategyStore();
  const { setTicker, setTimeframe, setActiveIndicatorTab, setEmaPeriod, setBbPeriod, setBbStdDev,
          setRsiPeriod, setRsiOverbought, setRsiOversold, setMacdFastPeriod, setMacdSlowPeriod,
          setMacdSignalPeriod } = useUIStore();
  const getTradesForStrategy = useTradeStore((s) => s.getTradesForStrategy);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toggling, setToggling]           = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [expanded, setExpanded]           = useState(false);

  const isActive = activeStrategyId === strategy.id;
  const pctColor = strategy.bestStrategyReturn >= 0 ? "text-emerald-400" : "text-red-400";
  const indicatorStyle = INDICATOR_COLORS[strategy.indicator] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";

  // Actual trade performance
  const trades = getTradesForStrategy(strategy.id);
  const actualPnlDollars = trades.reduce((sum, t) => sum + t.pnlDollars, 0);
  const totalCapital = strategy.lotSizeDollars ?? 1_000;
  const actualPnlPct = totalCapital > 0 ? actualPnlDollars / totalCapital : 0;
  const actualWins = trades.filter((t) => t.pnlDollars > 0).length;
  const actualWinRate = trades.length > 0 ? actualWins / trades.length : null;
  const hasActualTrades = trades.length > 0;

  /** Load this strategy into the main chart view */
  function loadStrategy() {
    setActiveStrategy(strategy.id);
    setTicker(strategy.ticker);
    setTimeframe(strategy.timeframe as Timeframe);
    setActiveIndicatorTab(strategy.indicator === "TD9" ? "TD9" : strategy.indicator);
    setEmaPeriod(strategy.params.emaPeriod);
    setBbPeriod(strategy.params.bbPeriod);
    setBbStdDev(strategy.params.bbStdDev);
    setRsiPeriod(strategy.params.rsiPeriod);
    setRsiOverbought(strategy.params.rsiOverbought);
    setRsiOversold(strategy.params.rsiOversold);
    setMacdFastPeriod(strategy.params.macdFast);
    setMacdSlowPeriod(strategy.params.macdSlow);
    setMacdSignalPeriod(strategy.params.macdSignal);
  }

  /** Toggle auto-trade on/off */
  async function handleToggleAutoTrade(e: React.MouseEvent) {
    e.stopPropagation();
    if (!user || toggling) return;
    setToggling(true);
    try {
      await updateStrategy(strategy.id, { autoTrade: !strategy.autoTrade }, user.uid);
    } finally {
      setToggling(false);
    }
  }

  /** Delete strategy with confirmation */
  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setDeleting(true);
    try {
      await deleteStrategy(strategy.id, user.uid);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      onClick={loadStrategy}
      className={cn(
        "group relative flex flex-col gap-1.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all",
        "border-l-2",
        isActive
          ? "border-l-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15"
          : "border-l-white/5 bg-white/3 hover:bg-white/6",
      )}
    >
      {/* ── Top row: name + auto indicator ─────────────────────────── */}
      <div className="flex items-start justify-between gap-1">
        <p className={cn(
          "text-[11px] font-semibold truncate max-w-[130px]",
          isActive ? "text-emerald-300" : "text-zinc-200",
        )}>
          {strategy.name}
        </p>
        {strategy.autoTrade && (
          <span
            className="mt-0.5 size-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"
            title="Auto-trading active"
          />
        )}
      </div>

      {/* ── Meta row: indicator badge + backtested return ────────────── */}
      <div className="flex items-center justify-between gap-2">
        <span className={cn(
          "px-1.5 py-0.5 rounded text-[9px] font-semibold border",
          indicatorStyle,
        )}>
          {strategy.indicator}
        </span>
        <div className="flex items-center gap-1" title="Backtested return">
          {strategy.bestStrategyReturn >= 0
            ? <TrendingUp className="size-2.5 text-emerald-400 shrink-0" />
            : <TrendingDown className="size-2.5 text-red-400 shrink-0" />}
          <span className={cn("text-[10px] font-mono font-bold tabular-nums", pctColor)}>
            {formatPercent(strategy.bestStrategyReturn * 100)}
          </span>
          <span className="text-[9px] text-zinc-600">bt</span>
        </div>
      </div>

      {/* ── Actual P/L row (if any trades) ─────────────────────────── */}
      {hasActualTrades && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] text-zinc-600">Actual</span>
          <div className="flex items-center gap-1">
            <Target className="size-2.5 text-zinc-500 shrink-0" />
            <span className={cn(
              "text-[10px] font-mono font-bold tabular-nums",
              actualPnlDollars >= 0 ? "text-emerald-400" : "text-red-400",
            )}>
              {actualPnlDollars >= 0 ? "+" : ""}{currFmt.format(actualPnlDollars)}
            </span>
          </div>
        </div>
      )}

      {/* ── Ticker + timeframe row ──────────────────────────────────── */}
      <p className="text-[9px] text-zinc-600 font-mono">
        {strategy.ticker} · {strategy.timeframe.toUpperCase()} · {strategy.bestPeriodKey}
        {strategy.lotSizeDollars
          ? ` · $${strategy.lotSizeDollars.toLocaleString()} lot`
          : ""}
      </p>

      {/* ── Action buttons ──────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mt-0.5">
        {/* Auto-trade toggle */}
        <button
          onClick={handleToggleAutoTrade}
          disabled={toggling}
          title={strategy.autoTrade ? "Disable auto-trading" : "Enable auto-trading"}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-semibold transition-all border",
            strategy.autoTrade
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30"
              : "bg-white/5 text-zinc-500 border-white/10 hover:text-zinc-300 hover:bg-white/10",
            toggling && "opacity-50 cursor-not-allowed",
          )}
        >
          {toggling ? (
            <Loader2 className="size-2.5 animate-spin" />
          ) : strategy.autoTrade ? (
            <><Bot className="size-2.5" /> On</>
          ) : (
            <><PowerOff className="size-2.5" /> Off</>
          )}
        </button>

        {/* Expand/collapse performance */}
        {hasActualTrades && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            title="Show trade history"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent transition-all"
          >
            {expanded ? <ChevronUp className="size-2.5" /> : <ChevronDown className="size-2.5" />}
            {trades.length} trades
          </button>
        )}

        {/* Delete button */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          title={confirmDelete ? "Click again to confirm" : "Delete strategy"}
          className={cn(
            "ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-semibold transition-all border",
            confirmDelete
              ? "bg-red-500/20 text-red-400 border-red-500/30"
              : "bg-white/3 text-zinc-600 border-transparent hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20",
            deleting && "opacity-50 cursor-not-allowed",
          )}
        >
          {deleting ? (
            <Loader2 className="size-2.5 animate-spin" />
          ) : (
            <>
              <Trash2 className="size-2.5" />
              {confirmDelete ? "Confirm?" : ""}
            </>
          )}
        </button>
      </div>

      {/* ── Expandable: performance summary + trade list ─────────────── */}
      {expanded && hasActualTrades && (
        <div
          className="mt-1 flex flex-col gap-2 border-t border-white/8 pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-1 text-[9px]">
            <div className="flex flex-col gap-0.5">
              <span className="text-zinc-600 uppercase tracking-wide">Actual P/L</span>
              <span className={cn("font-mono font-bold tabular-nums", actualPnlDollars >= 0 ? "text-emerald-400" : "text-red-400")}>
                {actualPnlDollars >= 0 ? "+" : ""}{formatPercent(actualPnlPct * 100)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-zinc-600 uppercase tracking-wide">Win rate</span>
              <span className="font-mono font-bold text-zinc-300 tabular-nums">
                {actualWinRate !== null ? `${(actualWinRate * 100).toFixed(0)}%` : "—"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-zinc-600 uppercase tracking-wide">Backtest</span>
              <span className={cn("font-mono font-bold tabular-nums", strategy.bestStrategyReturn >= 0 ? "text-emerald-400/60" : "text-red-400/60")}>
                {formatPercent(strategy.bestStrategyReturn * 100)}
              </span>
            </div>
          </div>

          {/* Trade list */}
          <div className="flex flex-col gap-1">
            {trades.slice(0, 8).map((trade) => (
              <div key={trade.id} className="flex items-center justify-between gap-1 text-[9px]">
                <span className="text-zinc-600 font-mono shrink-0">
                  {dateFmt.format(new Date(trade.entryTime * 1000))}
                  {" → "}
                  {dateFmt.format(new Date(trade.exitTime * 1000))}
                </span>
                <span className={cn(
                  "font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded",
                  trade.pnlDollars >= 0
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-red-500/15 text-red-400",
                )}>
                  {trade.pnlDollars >= 0 ? "+" : ""}{currFmt.format(trade.pnlDollars)}
                </span>
              </div>
            ))}
            {trades.length > 8 && (
              <p className="text-[9px] text-zinc-600 text-center">+{trades.length - 8} more — see Portfolio</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
