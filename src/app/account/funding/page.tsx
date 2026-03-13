"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { useBrokerStore } from "@/store/useBrokerStore";
import { ACHFormModal } from "@/components/broker/ACHFormModal";
import { TransferModal } from "@/components/broker/TransferModal";
import { cn } from "@/lib/utils";
import type { ACHRelationship, Transfer } from "@/types/broker";
import {
  Landmark,
  Plus,
  Trash2,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  TrendingUp,
  Wallet,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";

function formatCurrency(v: string | undefined): string {
  const n = parseFloat(v ?? "0");
  if (isNaN(n)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const ACH_STATUS_COLORS: Record<string, string> = {
  QUEUED: "text-amber-400",
  APPROVED: "text-emerald-400",
  PENDING: "text-amber-400",
  CANCELED: "text-red-400",
};

const TRANSFER_STATUS_COLORS: Record<string, string> = {
  QUEUED: "text-amber-400",
  PENDING: "text-amber-400",
  SENT_TO_CLEARING: "text-blue-400",
  APPROVED: "text-emerald-400",
  COMPLETE: "text-emerald-400",
  REJECTED: "text-red-400",
  CANCELED: "text-red-400",
  RETURNED: "text-red-400",
  FAILED: "text-red-400",
};

const TRANSFER_STATUS_ICONS: Record<string, typeof Clock> = {
  COMPLETE: CheckCircle2,
  APPROVED: CheckCircle2,
  QUEUED: Clock,
  PENDING: Clock,
  SENT_TO_CLEARING: Clock,
};

export default function FundingPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const {
    account,
    tradingAccount,
    achRelationships,
    transfers,
    loading,
    error,
    fetchTradingAccount,
    fetchACHRelationships,
    fetchTransfers,
    deleteACHRelationship,
  } = useBrokerStore();

  const [showACHForm, setShowACHForm] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!account?.alpacaAccountId) {
      router.push("/account/onboard");
      return;
    }
    void fetchTradingAccount(user.uid);
    void fetchACHRelationships(user.uid);
    void fetchTransfers(user.uid);
  }, [user, account]);

  const handleRefresh = async () => {
    if (!user) return;
    setRefreshing(true);
    await Promise.all([
      fetchTradingAccount(user.uid),
      fetchACHRelationships(user.uid),
      fetchTransfers(user.uid),
    ]);
    setRefreshing(false);
  };

  const handleDeleteACH = async (rel: ACHRelationship) => {
    if (!user) return;
    setDeletingId(rel.id);
    try {
      await deleteACHRelationship(user.uid, rel.id);
    } finally {
      setDeletingId(null);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400">
        Please sign in to continue.
      </div>
    );
  }

  const cardCls = "glass rounded-2xl border border-white/8 p-6";

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 to-zinc-900 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Account Funding</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Manage your brokerage balance and bank connections
              {account?.status && (
                <span className={cn(
                  "ml-2 text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full",
                  account.status === "ACTIVE"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-amber-500/15 text-amber-400",
                )}>
                  {account.status}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-white/8 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* Account Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Buying Power", value: tradingAccount?.buying_power, icon: DollarSign, color: "text-emerald-400" },
            { label: "Portfolio Value", value: tradingAccount?.portfolio_value, icon: TrendingUp, color: "text-blue-400" },
            { label: "Cash", value: tradingAccount?.cash, icon: Wallet, color: "text-amber-400" },
            { label: "Equity", value: tradingAccount?.equity, icon: TrendingUp, color: "text-purple-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={cardCls}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn("size-4", color)} />
                <span className="text-[11px] text-zinc-500 uppercase tracking-widest font-semibold">{label}</span>
              </div>
              {tradingAccount ? (
                <p className="text-xl font-bold text-zinc-100">{formatCurrency(value)}</p>
              ) : (
                <div className="h-7 w-24 bg-zinc-800 rounded animate-pulse" />
              )}
            </div>
          ))}
        </div>

        {/* Bank Accounts */}
        <div className={cardCls}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Landmark className="size-5 text-emerald-400" />
              <h2 className="text-base font-semibold text-zinc-100">Bank Accounts</h2>
            </div>
            <div className="flex items-center gap-2">
              {achRelationships.length > 0 && (
                <button
                  onClick={() => setShowTransfer(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
                >
                  <DollarSign className="size-3.5" /> Transfer Funds
                </button>
              )}
              <button
                onClick={() => setShowACHForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-zinc-300 hover:text-zinc-100 hover:bg-white/5 border border-white/10 transition-all"
              >
                <Plus className="size-3.5" /> Add Bank
              </button>
            </div>
          </div>

          {achRelationships.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-3 text-zinc-500">
              <Landmark className="size-8 opacity-30" />
              <p className="text-sm">No bank accounts linked yet.</p>
              <button
                onClick={() => setShowACHForm(true)}
                className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Add your first bank account →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {achRelationships.map((rel) => (
                <div key={rel.id} className="flex items-center gap-4 p-4 bg-zinc-800/40 rounded-xl border border-white/5">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-zinc-700/50">
                    <Landmark className="size-4 text-zinc-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200">
                      {rel.nickname ?? `${rel.bank_account_type.charAt(0) + rel.bank_account_type.slice(1).toLowerCase()} Account`}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {rel.bank_account_type} ···{rel.bank_account_number.slice(-4)} ·
                      Routing: {rel.bank_routing_number}
                    </p>
                  </div>
                  <span className={cn(
                    "text-[11px] font-semibold uppercase tracking-wider",
                    ACH_STATUS_COLORS[rel.status] ?? "text-zinc-500",
                  )}>
                    {rel.status}
                  </span>
                  <button
                    onClick={() => handleDeleteACH(rel)}
                    disabled={deletingId === rel.id}
                    className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-40"
                  >
                    {deletingId === rel.id
                      ? <Loader2 className="size-4 animate-spin" />
                      : <Trash2 className="size-4" />
                    }
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transfer History */}
        <div className={cardCls}>
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-base font-semibold text-zinc-100">Transfer History</h2>
          </div>

          {transfers.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">No transfers yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-zinc-500 uppercase tracking-widest border-b border-white/5">
                    <th className="text-left py-2 pb-3 font-semibold">Direction</th>
                    <th className="text-left py-2 pb-3 font-semibold">Amount</th>
                    <th className="text-left py-2 pb-3 font-semibold">Status</th>
                    <th className="text-left py-2 pb-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {transfers.map((t) => {
                    const StatusIcon = TRANSFER_STATUS_ICONS[t.status] ?? AlertCircle;
                    return (
                      <tr key={t.id} className="group">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            {t.direction === "INCOMING" ? (
                              <ArrowDownCircle className="size-4 text-emerald-400" />
                            ) : (
                              <ArrowUpCircle className="size-4 text-red-400" />
                            )}
                            <span className="text-zinc-300">
                              {t.direction === "INCOMING" ? "Deposit" : "Withdrawal"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 font-semibold text-zinc-100">
                          {t.direction === "OUTGOING" && "−"}
                          {formatCurrency(t.amount)}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <StatusIcon className={cn("size-3.5", TRANSFER_STATUS_COLORS[t.status] ?? "text-zinc-500")} />
                            <span className={cn("text-[12px] font-medium", TRANSFER_STATUS_COLORS[t.status] ?? "text-zinc-500")}>
                              {t.status.replace(/_/g, " ")}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-zinc-500 text-[12px]">
                          {new Date(t.created_at).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="size-4 shrink-0" /> {error}
          </div>
        )}
      </div>

      {showACHForm && <ACHFormModal onClose={() => { setShowACHForm(false); handleRefresh(); }} />}
      {showTransfer && <TransferModal onClose={() => { setShowTransfer(false); handleRefresh(); }} />}
    </div>
  );
}
