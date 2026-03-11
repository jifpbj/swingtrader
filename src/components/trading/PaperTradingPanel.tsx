"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link2,
  Link2Off,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  X,
  AlertCircle,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { useUIStore } from "@/store/useUIStore";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { toAlpacaSymbol, isCrypto } from "@/lib/alpaca";
import type { PlaceOrderRequest } from "@/types/market";

type Tab = "trade" | "positions" | "orders";
type OrderSide = "buy" | "sell";
type OrderType = "market" | "limit";

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConnectForm() {
  const { apiKey, secretKey, loading, error, connect, setCredentials } = useAlpacaStore();
  const [localKey, setLocalKey] = useState(apiKey);
  const [localSecret, setLocalSecret] = useState(secretKey);
  const [showSecret, setShowSecret] = useState(false);
  const [credsSaved, setCredsSaved] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    connect(localKey.trim(), localSecret.trim());
  }

  function handleSaveCredentials() {
    setCredentials(localKey.trim(), localSecret.trim());
    setCredsSaved(true);
    setTimeout(() => setCredsSaved(false), 2000);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="size-6 rounded-md bg-amber-400/10 flex items-center justify-center">
          <Link2 className="size-3.5 text-amber-400" />
        </div>
        <span className="text-xs font-semibold text-zinc-200">
          Connect Alpaca Paper Trading
        </span>
      </div>

      <p className="text-[11px] text-zinc-500 leading-relaxed">
        Enter your{" "}
        <span className="text-zinc-400">paper trading</span> API credentials.
        Keys are saved locally and never stored on our servers.
      </p>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
          API Key
        </label>
        <input
          type="text"
          value={localKey}
          onChange={(e) => setLocalKey(e.target.value)}
          placeholder="PK…"
          required
          spellCheck={false}
          className="bg-zinc-800/80 border border-zinc-700/60 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/20 transition-all"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
          Secret Key
        </label>
        <div className="relative">
          <input
            type={showSecret ? "text" : "password"}
            value={localSecret}
            onChange={(e) => setLocalSecret(e.target.value)}
            placeholder="••••••••••••••••"
            required
            spellCheck={false}
            className="w-full bg-zinc-800/80 border border-zinc-700/60 rounded-lg px-3 py-2 pr-8 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/20 transition-all"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowSecret((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
          >
            {showSecret ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2">
        {/* Save credentials without connecting */}
        <button
          type="button"
          onClick={handleSaveCredentials}
          disabled={!localKey || !localSecret}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold border border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {credsSaved ? "Saved!" : "Save"}
        </button>

        {/* Connect + verify */}
        <button
          type="submit"
          disabled={loading || !localKey || !localSecret}
          className="flex-[2] flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold bg-amber-400 hover:bg-amber-300 text-zinc-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-amber-400/20"
        >
          {loading ? (
            <span className="size-3.5 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
          ) : (
            <Link2 className="size-3.5" />
          )}
          {loading ? "Connecting…" : "Connect"}
        </button>
      </div>
    </form>
  );
}

function AccountBar() {
  const { account, positions, disconnect, refresh } = useAlpacaStore();
  const [refreshing, setRefreshing] = useState(false);

  const equity = account?.equity ?? 0;
  const portfolioStart = 100_000; // Alpaca paper default
  const totalPnl = equity - portfolioStart;
  const isUp = totalPnl >= 0;

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  return (
    <div className="px-4 pt-3 pb-2 border-b border-white/5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
            Paper Trading · Live
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            title="Refresh"
            className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <RefreshCw
              className={cn("size-3", refreshing && "animate-spin")}
            />
          </button>
          <button
            onClick={disconnect}
            title="Disconnect"
            className="p-1 rounded text-zinc-600 hover:text-red-400 transition-colors"
          >
            <Link2Off className="size-3" />
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Equity" value={account == null ? "—" : formatCurrency(account.equity)} />
        <Stat label="Buying Power" value={account == null ? "—" : formatCurrency(account.buying_power)} />
        <Stat
          label="Unrealized P&L"
          value={formatCurrency(positions.reduce((s, p) => s + p.unrealized_pl, 0))}
          className={
            positions.reduce((s, p) => s + p.unrealized_pl, 0) >= 0
              ? "text-emerald-400"
              : "text-red-400"
          }
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-zinc-500 uppercase tracking-wider">
        {label}
      </span>
      <span className={cn("text-xs font-mono font-semibold text-zinc-200", className)}>
        {value}
      </span>
    </div>
  );
}

// ─── Trade form ───────────────────────────────────────────────────────────────

function TradeForm() {
  const ticker = useUIStore((s) => s.ticker);
  const livePrice = useUIStore((s) => s.livePrice);
  const { placeOrder } = useAlpacaStore();

  const [side, setSide] = useState<OrderSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [qty, setQty] = useState("1");
  const [limitPrice, setLimitPrice] = useState(
    livePrice ? livePrice.toFixed(2) : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const crypto = isCrypto(ticker);
  const symbol = toAlpacaSymbol(ticker);
  const tif = crypto ? "gtc" : "day";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    const req: PlaceOrderRequest = {
      symbol,
      qty: parseFloat(qty),
      side,
      type: orderType,
      time_in_force: tif,
      ...(orderType === "limit" && limitPrice
        ? { limit_price: parseFloat(limitPrice) }
        : {}),
    };

    try {
      const order = await placeOrder(req);
      setResult({
        ok: true,
        msg: `Order submitted · ${order.id.slice(0, 8)}…`,
      });
      setQty("1");
    } catch (e) {
      setResult({ ok: false, msg: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 px-4 py-3">
      {/* Symbol + direction */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Symbol
          </span>
          <span className="text-sm font-mono font-bold text-zinc-100">
            {symbol}
          </span>
        </div>

        {/* Buy / Sell toggle */}
        <div className="flex gap-1 bg-zinc-800/60 rounded-lg p-0.5">
          {(["buy", "sell"] as OrderSide[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-bold transition-all",
                side === s
                  ? s === "buy"
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "bg-red-500 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Order type */}
      <div className="flex gap-1 bg-zinc-800/40 rounded-lg p-0.5">
        {(["market", "limit"] as OrderType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setOrderType(t)}
            className={cn(
              "flex-1 py-1 rounded-md text-[11px] font-medium transition-all capitalize",
              orderType === t
                ? "bg-zinc-700 text-zinc-100 shadow-sm"
                : "text-zinc-500 hover:text-zinc-400",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Qty + limit price */}
      <div className={cn("grid gap-2", orderType === "limit" ? "grid-cols-2" : "grid-cols-1")}>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Quantity
          </label>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            min="0.0001"
            step="any"
            required
            className="bg-zinc-800/80 border border-zinc-700/60 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/20 transition-all"
          />
        </div>
        {orderType === "limit" && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">
              Limit Price
            </label>
            <input
              type="number"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              min="0"
              step="any"
              required
              className="bg-zinc-800/80 border border-zinc-700/60 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/20 transition-all"
            />
          </div>
        )}
      </div>

      {/* Live price hint */}
      {livePrice != null && (
        <div className="text-[11px] text-zinc-600 font-mono">
          Last: ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(livePrice)}
          {" · "}
          <span className="text-zinc-500">{tif.toUpperCase()}</span>
        </div>
      )}

      {/* Result toast */}
      {result && (
        <div
          className={cn(
            "flex items-center gap-2 text-[11px] rounded-lg px-3 py-2 border",
            result.ok
              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
              : "text-red-400 bg-red-500/10 border-red-500/20",
          )}
        >
          <AlertCircle className="size-3.5 shrink-0" />
          {result.msg}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className={cn(
          "flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md",
          side === "buy"
            ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20"
            : "bg-red-500 hover:bg-red-400 text-white shadow-red-500/20",
        )}
      >
        {submitting ? (
          <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : side === "buy" ? (
          <TrendingUp className="size-4" />
        ) : (
          <TrendingDown className="size-4" />
        )}
        {submitting
          ? "Placing…"
          : `${side === "buy" ? "Buy" : "Sell"} ${symbol}`}
      </button>
    </form>
  );
}

// ─── Positions tab ────────────────────────────────────────────────────────────

function PositionsTab() {
  const positions = useAlpacaStore((s) => s.positions);
  const { placeOrder } = useAlpacaStore();

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [qty, setQty] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleSelect(symbol: string, posQty: number) {
    if (selectedSymbol === symbol) {
      setSelectedSymbol(null);
      setResult(null);
    } else {
      setSelectedSymbol(symbol);
      setQty(String(posQty));
      setOrderType("market");
      setLimitPrice("");
      setResult(null);
    }
  }

  async function handleSell(e: React.FormEvent, symbol: string, currentPrice: number | null) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    const crypto = isCrypto(symbol);
    const req: PlaceOrderRequest = {
      symbol: toAlpacaSymbol(symbol),
      qty: parseFloat(qty),
      side: "sell",
      type: orderType,
      time_in_force: crypto ? "gtc" : "day",
      ...(orderType === "limit" && limitPrice
        ? { limit_price: parseFloat(limitPrice) }
        : {}),
    };
    try {
      const order = await placeOrder(req);
      setResult({ ok: true, msg: `Sell order placed · ${order.id.slice(0, 8)}…` });
      setSelectedSymbol(null);
    } catch (err) {
      setResult({ ok: false, msg: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-zinc-600 text-xs gap-1">
        <TrendingUp className="size-5 opacity-40" />
        No open positions
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-3 py-2">
      {positions.map((p) => {
        const isProfit = p.unrealized_pl >= 0;
        const isSelected = selectedSymbol === p.symbol;
        return (
          <div key={p.symbol} className="flex flex-col rounded-lg overflow-hidden">
            {/* Position row — clickable to expand sell form */}
            <button
              type="button"
              onClick={() => handleSelect(p.symbol, p.qty)}
              className={cn(
                "flex items-center justify-between px-3 py-2.5 w-full text-left transition-colors",
                isSelected
                  ? "bg-zinc-700/60"
                  : "bg-zinc-800/40 hover:bg-zinc-800/70",
              )}
            >
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold text-zinc-100">
                    {p.symbol}
                  </span>
                  <span className="text-[9px] text-zinc-500 font-medium">
                    {isSelected ? "▲" : "▼"}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {p.qty} · avg {formatCurrency(p.avg_entry_price)}
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span
                  className={cn(
                    "text-xs font-mono font-semibold",
                    isProfit ? "text-emerald-400" : "text-red-400",
                  )}
                >
                  {formatCurrency(p.unrealized_pl)}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-mono",
                    isProfit ? "text-emerald-500/70" : "text-red-500/70",
                  )}
                >
                  {formatPercent(p.unrealized_plpc * 100)}
                </span>
              </div>
            </button>

            {/* Inline sell form */}
            {isSelected && (
              <form
                onSubmit={(e) => handleSell(e, p.symbol, p.current_price)}
                className="bg-zinc-800/60 border-t border-white/5 px-3 py-3 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">
                    Close Position
                  </span>
                  {p.current_price != null && (
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Last: {formatCurrency(p.current_price)}
                    </span>
                  )}
                </div>

                {/* Order type toggle */}
                <div className="flex gap-1 bg-zinc-900/40 rounded-lg p-0.5">
                  {(["market", "limit"] as OrderType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setOrderType(t)}
                      className={cn(
                        "flex-1 py-1 rounded-md text-[11px] font-medium transition-all capitalize",
                        orderType === t
                          ? "bg-zinc-700 text-zinc-100 shadow-sm"
                          : "text-zinc-500 hover:text-zinc-400",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {/* Qty + limit price */}
                <div
                  className={cn(
                    "grid gap-2",
                    orderType === "limit" ? "grid-cols-2" : "grid-cols-1",
                  )}
                >
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">
                      Qty
                    </label>
                    <input
                      type="number"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      min="0.0001"
                      step="any"
                      required
                      className="bg-zinc-900/60 border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-red-400/60 focus:ring-1 focus:ring-red-400/20 transition-all"
                    />
                  </div>
                  {orderType === "limit" && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider">
                        Limit Price
                      </label>
                      <input
                        type="number"
                        value={limitPrice}
                        onChange={(e) => setLimitPrice(e.target.value)}
                        min="0"
                        step="any"
                        required
                        placeholder={
                          p.current_price != null
                            ? p.current_price.toFixed(2)
                            : ""
                        }
                        className="bg-zinc-900/60 border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-red-400/60 focus:ring-1 focus:ring-red-400/20 transition-all"
                      />
                    </div>
                  )}
                </div>

                {result && (
                  <div
                    className={cn(
                      "flex items-center gap-2 text-[11px] rounded-lg px-3 py-2 border",
                      result.ok
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        : "text-red-400 bg-red-500/10 border-red-500/20",
                    )}
                  >
                    <AlertCircle className="size-3.5 shrink-0" />
                    {result.msg}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSymbol(null);
                      setResult(null);
                    }}
                    className="flex-1 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 border border-white/10 hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-[2] flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold bg-red-500 hover:bg-red-400 text-white shadow-md shadow-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <TrendingDown className="size-3.5" />
                    )}
                    {submitting
                      ? "Placing…"
                      : `Sell ${orderType === "market" ? "at Market" : "Limit"}`}
                  </button>
                </div>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Orders tab ───────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  filled: "text-emerald-400",
  partially_filled: "text-amber-400",
  new: "text-blue-400",
  accepted: "text-blue-400",
  pending_new: "text-zinc-400",
  canceled: "text-zinc-600",
  expired: "text-zinc-600",
  rejected: "text-red-400",
};

function OrdersTab() {
  const orders = useAlpacaStore((s) => s.orders);
  const cancelOrder = useAlpacaStore((s) => s.cancelOrder);
  const cancelAllOrders = useAlpacaStore((s) => s.cancelAllOrders);

  const openOrders = orders.filter((o) =>
    ["new", "accepted", "pending_new", "partially_filled"].includes(o.status),
  );

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-zinc-600 text-xs gap-1">
        <ChevronDown className="size-5 opacity-40" />
        No recent orders
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-3 py-2">
      {openOrders.length > 1 && (
        <button
          onClick={cancelAllOrders}
          className="text-[10px] text-red-400/70 hover:text-red-400 text-right mb-1 transition-colors"
        >
          Cancel all open
        </button>
      )}
      {orders.slice(0, 20).map((o) => {
        const canCancel = ["new", "accepted", "pending_new"].includes(o.status);
        const qty = o.qty != null ? o.qty : o.notional != null ? `$${o.notional}` : "—";
        return (
          <div
            key={o.id}
            className="flex items-center justify-between rounded-lg px-3 py-2.5 bg-zinc-800/40 hover:bg-zinc-800/60 transition-colors"
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono font-bold text-zinc-100">
                  {o.symbol}
                </span>
                <span
                  className={cn(
                    "text-[9px] uppercase font-bold",
                    o.side === "buy" ? "text-emerald-400" : "text-red-400",
                  )}
                >
                  {o.side}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono truncate">
                {qty} · {o.order_type} ·{" "}
                <span className={STATUS_COLOR[o.status] ?? "text-zinc-400"}>
                  {o.status}
                </span>
              </span>
            </div>
            {canCancel && (
              <button
                onClick={() => cancelOrder(o.id)}
                title="Cancel order"
                className="ml-2 p-1 rounded text-zinc-600 hover:text-red-400 transition-colors shrink-0"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function PaperTradingPanel() {
  const connected = useAlpacaStore((s) => s.account !== null);
  const positions = useAlpacaStore((s) => s.positions);
  const orders = useAlpacaStore((s) => s.orders);
  const [tab, setTab] = useState<Tab>("trade");
  const [collapsed, setCollapsed] = useState(false);

  // Auto-refresh every 15s when connected
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refresh = useAlpacaStore((s) => s.refresh);

  useEffect(() => {
    if (!connected) return;
    refreshRef.current = setInterval(() => void refresh(), 15_000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [connected, refresh]);

  const openCount = orders.filter((o) =>
    ["new", "accepted", "pending_new", "partially_filled"].includes(o.status),
  ).length;

  return (
    <div className="glass rounded-2xl overflow-hidden shrink-0">
      {/* Panel header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-300">
            Paper Trading
          </span>
          {connected && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-medium border border-emerald-500/20">
              Connected
            </span>
          )}
        </div>
        {collapsed ? (
          <ChevronDown className="size-3.5 text-zinc-500" />
        ) : (
          <ChevronUp className="size-3.5 text-zinc-500" />
        )}
      </button>

      {!collapsed && (
        <>
          {!connected ? (
            <ConnectForm />
          ) : (
            <>
              <AccountBar />

              {/* Tab bar */}
              <div className="flex gap-0 border-b border-white/5">
                {(
                  [
                    { id: "trade", label: "Trade" },
                    {
                      id: "positions",
                      label: `Positions${positions.length > 0 ? ` (${positions.length})` : ""}`,
                    },
                    {
                      id: "orders",
                      label: `Orders${openCount > 0 ? ` (${openCount})` : ""}`,
                    },
                  ] as { id: Tab; label: string }[]
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={cn(
                      "flex-1 py-2 text-[11px] font-medium transition-all",
                      tab === id
                        ? "text-zinc-100 border-b-2 border-amber-400 -mb-px"
                        : "text-zinc-500 hover:text-zinc-300",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "trade" && <TradeForm />}
              {tab === "positions" && <PositionsTab />}
              {tab === "orders" && <OrdersTab />}
            </>
          )}
        </>
      )}
    </div>
  );
}
