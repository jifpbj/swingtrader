"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Trash2, TrendingUp, TrendingDown, Loader2, Bot, PowerOff,
  ChevronDown, ChevronUp, ExternalLink, BarChart3, ShieldAlert,
  DollarSign, Percent, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/utils";
import { useStrategyStore } from "@/store/useStrategyStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useUIStore } from "@/store/useUIStore";
import { useTradeStore } from "@/store/useTradeStore";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import type { SavedStrategy, IndicatorType } from "@/types/strategy";
import type { Timeframe } from "@/types/market";

// ─── Label helpers ────────────────────────────────────────────────────────────

const INDICATOR_FULL: Record<IndicatorType, string> = {
  EMA:  "Exponential Moving Average",
  BB:   "Bollinger Bands",
  RSI:  "Relative Strength Index",
  MACD: "MACD Crossover",
  TD9:  "TD Sequential",
};

const INDICATOR_COLORS: Record<IndicatorType, string> = {
  EMA:  "bg-amber-500/20  text-amber-300  border-amber-500/35",
  BB:   "bg-sky-500/20    text-sky-300    border-sky-500/35",
  RSI:  "bg-violet-500/20 text-violet-300 border-violet-500/35",
  MACD: "bg-rose-500/20   text-rose-300   border-rose-500/35",
  TD9:  "bg-emerald-500/20 text-emerald-300 border-emerald-500/35",
};

const PERIOD_FULL: Record<string, string> = {
  "1M": "1 Month",  "3M": "3 Months", "6M": "6 Months",
  "YTD": "Year to Date", "1Y": "1 Year", "2Y": "2 Years",
};

const TIMEFRAME_FULL: Record<string, string> = {
  "1m": "1 Minute", "5m": "5 Minutes", "15m": "15 Minutes",
  "30m": "30 Minutes", "1h": "1 Hour", "4h": "4 Hours",
  "1d": "Daily", "1w": "Weekly",
};

function expandPeriod(key: string) { return PERIOD_FULL[key] ?? key; }
function expandTimeframe(tf: string) { return TIMEFRAME_FULL[tf] ?? tf.toUpperCase(); }

// ─── Formatters ───────────────────────────────────────────────────────────────

const currFmt   = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dateFmtSh = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const dateFmtLg = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

interface Props { strategy: SavedStrategy }

export function StrategyCard({ strategy }: Props) {
  const user = useAuthStore((s) => s.user);
  const { activeStrategyId, setActiveStrategy, updateStrategy, deleteStrategy } = useStrategyStore();
  const {
    setTicker, setTimeframe, setActiveIndicatorTab, setEmaPeriod, setBbPeriod, setBbStdDev,
    setRsiPeriod, setRsiOverbought, setRsiOversold, setMacdFastPeriod, setMacdSlowPeriod,
    setMacdSignalPeriod,
  } = useUIStore();
  const getTradesForStrategy = useTradeStore((s) => s.getTradesForStrategy);
  const alpacaAccount = useAlpacaStore((s) => s.account);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toggling,      setToggling]      = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [expanded,      setExpanded]      = useState(false);
  const [showCash,      setShowCash]      = useState(false);   // % vs $ toggle

  // Editable lot size
  const [lotSizeDollars, setLotSizeDollars] = useState(strategy.lotSizeDollars ?? 1_000);
  const [lotSizeMode,    setLotSizeMode]    = useState<"dollars" | "units">(strategy.lotSizeMode ?? "dollars");
  const [savingLot,      setSavingLot]      = useState(false);

  async function handleLotSave(mode: "dollars" | "units", amount: number) {
    if (!user) return;
    setSavingLot(true);
    try {
      await updateStrategy(strategy.id, {
        lotSizeMode: mode, lotSizeDollars: amount,
        orderQty: mode === "units" ? amount : 1,
      }, user.uid);
    } finally { setSavingLot(false); }
  }

  // ── Derived data ─────────────────────────────────────────────────────────
  const isActive       = activeStrategyId === strategy.id;
  const indicatorStyle = INDICATOR_COLORS[strategy.indicator] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
  const capital        = strategy.lotSizeDollars ?? 1_000;
  const startDate      = new Date(strategy.createdAt);

  // Actual trade performance
  const trades          = getTradesForStrategy(strategy.id);
  const actualPnlDollars = trades.reduce((sum, t) => sum + t.pnlDollars, 0);
  const actualPnlPct     = capital > 0 ? actualPnlDollars / capital : 0;
  const actualWins       = trades.filter((t) => t.pnlDollars > 0).length;
  const actualWinRate    = trades.length > 0 ? actualWins / trades.length : null;
  const hasActualTrades  = trades.length > 0;

  // Backtest reference
  const btReturn    = strategy.bestStrategyReturn;   // decimal
  const btDrawdown  = strategy.bestMaxDrawdown;      // decimal ≤ 0
  const btPnlDollar = btReturn * capital;
  const ddDollar    = btDrawdown * capital;

  // Beating backtest?
  const beatingBacktest = hasActualTrades && actualPnlPct > btReturn;

  // Lot size vs. account purchasing power / equity warning (only for $ mode)
  const lotWarning: "buying_power" | "equity" | null = (() => {
    if (lotSizeMode !== "dollars" || !alpacaAccount) return null;
    if (lotSizeDollars > alpacaAccount.buying_power) return "buying_power";
    if (lotSizeDollars > alpacaAccount.equity) return "equity";
    return null;
  })();

  // ── Actions ───────────────────────────────────────────────────────────────
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

  async function handleToggleAutoTrade(e: React.MouseEvent) {
    e.stopPropagation();
    if (!user || toggling) return;
    setToggling(true);
    try { await updateStrategy(strategy.id, { autoTrade: !strategy.autoTrade }, user.uid); }
    finally { setToggling(false); }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setDeleting(true);
    try { await deleteStrategy(strategy.id, user.uid); }
    finally { setDeleting(false); setConfirmDelete(false); }
  }

  // ── Helper: render a value as % or $ based on toggle ─────────────────────
  function fmtValue(pct: number, dollar: number) {
    return showCash ? currFmt.format(dollar) : formatPercent(pct * 100);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={loadStrategy}
      className={cn(
        "group relative flex flex-col gap-0 rounded-2xl cursor-pointer transition-all duration-200",
        "border",
        isActive
          ? "border-emerald-500/50 bg-emerald-500/10 shadow-lg shadow-emerald-900/20"
          : "border-white/12 bg-white/5 hover:bg-white/8 hover:border-white/20",
      )}
    >
      {/* ── Active stripe ───────────────────────────────────────────────── */}
      {isActive && (
        <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-emerald-400" />
      )}

      {/* ════ HEADER ════════════════════════════════════════════════════════ */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          {/* Strategy name */}
          <div className="flex items-center gap-2">
            {strategy.autoTrade && (
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" title="Auto-trading active" />
            )}
            <p className={cn(
              "text-sm font-bold truncate leading-tight",
              isActive ? "text-emerald-300" : "text-zinc-100",
            )}>
              {strategy.ticker}
            </p>
            <span className={cn(
              "px-1.5 py-0.5 rounded-md text-[10px] font-semibold border shrink-0",
              indicatorStyle,
            )}>
              {strategy.indicator}
            </span>
          </div>

          {/* Indicator full name */}
          <p className="text-[10px] text-zinc-400 font-medium">
            {INDICATOR_FULL[strategy.indicator] ?? strategy.indicator}
          </p>

          {/* Timeframe + period + start date */}
          <p className="text-[10px] text-zinc-400 mt-0.5">
            {expandTimeframe(strategy.timeframe)}
            {strategy.bestPeriodKey ? ` · ${expandPeriod(strategy.bestPeriodKey)} backtest` : ""}
          </p>
          <p className="text-[10px] text-zinc-500">
            Started {dateFmtLg.format(startDate)}
          </p>
        </div>

        {/* % / $ toggle + delete */}
        <div className="flex items-center gap-1 shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
          {/* % / $ toggle */}
          <button
            onClick={() => setShowCash((v) => !v)}
            title={showCash ? "Show as percentage" : "Show as dollar value"}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/8 transition-colors"
          >
            {showCash
              ? <Percent className="size-3" />
              : <DollarSign className="size-3" />}
          </button>
          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            title={confirmDelete ? "Click again to confirm" : "Delete strategy"}
            className={cn(
              "p-1.5 rounded-lg text-[9px] font-semibold transition-all",
              confirmDelete
                ? "bg-red-500/20 text-red-400"
                : "text-zinc-400 hover:text-red-400 hover:bg-red-500/10",
              deleting && "opacity-50 cursor-not-allowed",
            )}
          >
            {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
          </button>
        </div>
      </div>

      {/* ════ MAIN P/L DISPLAY ══════════════════════════════════════════════ */}
      <div className="px-4 pb-3">
        {hasActualTrades ? (
          /* ── Actual P/L (large, prominent) ─────────────────────────── */
          <div className={cn(
            "rounded-xl px-3 py-2.5 border transition-all",
            actualPnlDollars >= 0
              ? beatingBacktest
                ? "bg-emerald-500/12 border-emerald-500/30"
                : "bg-emerald-500/8 border-emerald-500/20"
              : "bg-red-500/10 border-red-500/20",
          )}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[9px] text-zinc-300 uppercase tracking-wider font-semibold mb-0.5">
                  Total P/L
                </p>
                <div className="flex items-baseline gap-1.5">
                  {actualPnlDollars >= 0
                    ? <TrendingUp className="size-4 text-emerald-400 shrink-0" />
                    : <TrendingDown className="size-4 text-red-400 shrink-0" />}
                  <span className={cn(
                    "text-2xl font-black tabular-nums tracking-tight leading-none",
                    actualPnlDollars >= 0 ? "text-emerald-400" : "text-red-400",
                  )}>
                    {actualPnlDollars >= 0 ? "+" : ""}
                    {fmtValue(actualPnlPct, actualPnlDollars)}
                  </span>
                </div>
              </div>

              {/* Beating backtest badge */}
              {beatingBacktest && (
                <span className="px-2 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold uppercase tracking-wide shrink-0">
                  Beating backtest
                </span>
              )}
            </div>

            {/* vs. backtest target */}
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-[9px] text-zinc-400">vs. backtest target</span>
              <span className={cn(
                "text-[9px] font-mono font-semibold tabular-nums",
                btReturn >= 0 ? "text-zinc-300" : "text-red-400/80",
              )}>
                {btReturn >= 0 ? "+" : ""}
                {fmtValue(btReturn, btPnlDollar)}
              </span>
            </div>
          </div>
        ) : (
          /* ── No trades yet — show backtested projection ──────────────── */
          <div className="rounded-xl px-3 py-2.5 bg-zinc-800/50 border border-white/15">
            <p className="text-[9px] text-zinc-300 uppercase tracking-wider font-semibold mb-0.5">
              Backtested projection
            </p>
            <div className="flex items-baseline gap-1.5">
              {btReturn >= 0
                ? <TrendingUp className="size-4 text-emerald-400/50 shrink-0" />
                : <TrendingDown className="size-4 text-red-400/50 shrink-0" />}
              <span className={cn(
                "text-2xl font-black tabular-nums tracking-tight leading-none opacity-60",
                btReturn >= 0 ? "text-emerald-400" : "text-red-400",
              )}>
                {btReturn >= 0 ? "+" : ""}
                {fmtValue(btReturn, btPnlDollar)}
              </span>
            </div>
            <p className="text-[9px] text-zinc-400 mt-1">No live trades yet</p>
          </div>
        )}
      </div>

      {/* ════ STATS GRID ════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-4 gap-px mx-4 mb-3 rounded-xl overflow-hidden border border-white/15 bg-white/8">
        {/* Win rate */}
        <div className="flex flex-col gap-0.5 px-2.5 py-2 bg-zinc-900/70">
          <span className="text-[8px] text-zinc-400 uppercase tracking-wide font-semibold">Win Rate</span>
          <span className="text-[11px] font-bold tabular-nums text-zinc-100">
            {actualWinRate !== null ? `${(actualWinRate * 100).toFixed(0)}%` : "—"}
          </span>
        </div>

        {/* Trades */}
        <div className="flex flex-col gap-0.5 px-2.5 py-2 bg-zinc-900/70">
          <span className="text-[8px] text-zinc-400 uppercase tracking-wide font-semibold">Trades</span>
          <span className="text-[11px] font-bold tabular-nums text-zinc-100">
            {trades.length > 0 ? trades.length : "—"}
          </span>
        </div>

        {/* Max Drawdown */}
        <div className="flex flex-col gap-0.5 px-2.5 py-2 bg-zinc-900/70">
          <span className="text-[8px] text-zinc-400 uppercase tracking-wide font-semibold flex items-center gap-0.5">
            <ShieldAlert className="size-2 shrink-0" />Max DD
          </span>
          <span className="text-[11px] font-bold tabular-nums text-red-400">
            {fmtValue(btDrawdown, ddDollar)}
          </span>
        </div>

        {/* Backtest */}
        <div className="flex flex-col gap-0.5 px-2.5 py-2 bg-zinc-900/70">
          <span className="text-[8px] text-zinc-400 uppercase tracking-wide font-semibold flex items-center gap-0.5">
            <BarChart3 className="size-2 shrink-0" />Backtest
          </span>
          <span className={cn(
            "text-[11px] font-bold tabular-nums",
            btReturn >= 0 ? "text-emerald-400" : "text-red-400",
          )}>
            {btReturn >= 0 ? "+" : ""}{fmtValue(btReturn, btPnlDollar)}
          </span>
        </div>
      </div>

      {/* ════ LOT SIZE + ACTIONS ════════════════════════════════════════════ */}
      <div
        className="flex flex-col gap-1.5 px-4 pb-3"
        onClick={(e) => e.stopPropagation()}
      >
      <div className="flex items-center gap-2">
        {/* Lot size row */}
        <div className="flex items-center gap-1 text-[9px] flex-1 min-w-0">
          <span className="text-zinc-300 shrink-0 font-medium">Lot</span>
          <div className="flex items-center gap-0.5 glass rounded-md px-0.5 py-0.5 shrink-0">
            <button
              onClick={() => { setLotSizeMode("dollars"); handleLotSave("dollars", lotSizeDollars); }}
              className={cn(
                "px-1.5 py-0.5 rounded font-semibold transition-all",
                lotSizeMode === "dollars" ? "bg-amber-500/20 text-amber-300" : "text-zinc-400 hover:text-zinc-200",
              )}
            >$</button>
            <button
              onClick={() => { setLotSizeMode("units"); handleLotSave("units", lotSizeDollars); }}
              className={cn(
                "px-1.5 py-0.5 rounded font-semibold transition-all",
                lotSizeMode === "units" ? "bg-amber-500/20 text-amber-300" : "text-zinc-400 hover:text-zinc-200",
              )}
            >qty</button>
          </div>
          {lotSizeMode === "dollars" && <span className="text-zinc-400 font-mono shrink-0">$</span>}
          <input
            type="number"
            min={1}
            step={lotSizeMode === "dollars" ? 100 : 1}
            value={lotSizeDollars}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) setLotSizeDollars(v);
            }}
            onBlur={() => handleLotSave(lotSizeMode, lotSizeDollars)}
            className={cn(
              "min-w-0 flex-1 rounded border bg-black/30 px-1.5 py-0.5 text-right font-mono tabular-nums text-zinc-200 outline-none focus:border-amber-500/50 transition-colors",
              lotWarning ? "border-amber-500/50" : "border-white/15",
            )}
          />
          <span className="text-zinc-400 shrink-0">/trade</span>
          {savingLot && <Loader2 className="size-2.5 animate-spin text-zinc-400 shrink-0" />}
        </div>

        {/* Auto-trade toggle */}
        <button
          onClick={handleToggleAutoTrade}
          disabled={toggling}
          title={strategy.autoTrade ? "Disable auto-trading" : "Enable auto-trading"}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-semibold transition-all border shrink-0",
            strategy.autoTrade
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30"
              : "bg-white/8 text-zinc-300 border-white/15 hover:text-zinc-100 hover:bg-white/15",
            toggling && "opacity-50 cursor-not-allowed",
          )}
        >
          {toggling
            ? <Loader2 className="size-2.5 animate-spin" />
            : strategy.autoTrade
              ? <><Bot className="size-2.5" /> Server</>
              : <><PowerOff className="size-2.5" /> Off</>}
        </button>
      </div>

      {/* Lot size warning */}
      {lotWarning && (
        <div className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5">
          <AlertTriangle className="size-3 text-amber-400 shrink-0 mt-px" />
          <p className="text-[9px] text-amber-300 leading-snug">
            {lotWarning === "buying_power"
              ? <>Lot size exceeds your buying power ({currFmt.format(alpacaAccount!.buying_power)}). Orders may be rejected.</>
              : <>Lot size exceeds your account equity ({currFmt.format(alpacaAccount!.equity)}). Consider reducing the lot size.</>}
          </p>
        </div>
      )}
      </div>

      {/* ════ FOOTER ROW — history expand + portfolio link ══════════════════ */}
      <div
        className="flex items-center gap-1 px-4 pb-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Expand trade history */}
        {hasActualTrades && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] text-zinc-400 hover:text-zinc-100 hover:bg-white/8 border border-white/10 transition-all"
          >
            {expanded ? <ChevronUp className="size-2.5" /> : <ChevronDown className="size-2.5" />}
            {trades.length} trade{trades.length !== 1 ? "s" : ""}
          </button>
        )}

        {/* Portfolio link */}
        <Link
          href="/portfolio"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] text-zinc-300 hover:text-zinc-100 hover:bg-white/8 border border-white/10 transition-all"
        >
          Full history
          <ExternalLink className="size-2.5" />
        </Link>
      </div>

      {/* ════ EXPANDED TRADE LIST ═══════════════════════════════════════════ */}
      {expanded && hasActualTrades && (
        <div
          className="border-t border-white/15 px-4 pt-3 pb-3 flex flex-col gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[9px] text-zinc-400 uppercase tracking-wider font-semibold mb-1">
            Recent trades
          </p>
          {trades.slice(0, 6).map((trade) => (
            <div
              key={trade.id}
              className="flex items-center justify-between gap-2 text-[9px]"
            >
              <span className="text-zinc-400 font-mono shrink-0">
                {dateFmtSh.format(new Date(trade.entryTime * 1000))}
                {" → "}
                {dateFmtSh.format(new Date(trade.exitTime * 1000))}
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
          {trades.length > 6 && (
            <Link
              href="/portfolio"
              onClick={(e) => e.stopPropagation()}
              className="text-[9px] text-zinc-400 hover:text-zinc-200 text-center mt-0.5 transition-colors"
            >
              +{trades.length - 6} more trades — view in Portfolio →
            </Link>
          )}
        </div>
      )}

      {/* Confirm-delete overlay message */}
      {confirmDelete && (
        <div className="absolute inset-x-0 bottom-0 rounded-b-2xl bg-red-900/80 backdrop-blur-sm px-4 py-2 flex items-center justify-between text-[10px]">
          <span className="text-red-300 font-medium">Delete this strategy?</span>
          <button
            onClick={handleDelete}
            className="px-2 py-0.5 rounded bg-red-500 text-white font-semibold hover:bg-red-400 transition-colors"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}
