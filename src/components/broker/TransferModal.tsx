"use client";

import { useState } from "react";
import { useBrokerStore } from "@/store/useBrokerStore";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/lib/utils";
import type { TransferDirection } from "@/types/broker";
import { X, Loader2, AlertCircle, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

interface TransferModalProps {
  onClose: () => void;
}

export function TransferModal({ onClose }: TransferModalProps) {
  const user = useAuthStore((s) => s.user);
  const { achRelationships, createTransfer, loading, error, clearError } = useBrokerStore();

  const [direction, setDirection] = useState<TransferDirection>("INCOMING");
  const [relationshipId, setRelationshipId] = useState(achRelationships[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validate = (): string | null => {
    if (!relationshipId) return "Please select a bank account.";
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return "Enter a valid amount greater than $0.";
    if (num > 1000000) return "Transfer amount cannot exceed $1,000,000.";
    return null;
  };

  const handleSubmit = async () => {
    if (!user) return;
    clearError();
    const err = validate();
    if (err) { setValidationError(err); return; }

    try {
      await createTransfer(user.uid, {
        transfer_type: "ach",
        relationship_id: relationshipId,
        amount: parseFloat(amount).toFixed(2),
        direction,
        timing: "immediate",
      });
      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    } catch {
      // error shown via store
    }
  };

  const inputCls = "w-full bg-zinc-800/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all";
  const labelCls = "block text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
          <h2 className="text-base font-semibold text-zinc-100">Fund Account</h2>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-all">
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Direction toggle */}
          <div>
            <label className={labelCls}>Transfer Direction</label>
            <div className="flex gap-2">
              {([
                { value: "INCOMING" as TransferDirection, label: "Deposit", Icon: ArrowDownCircle },
                { value: "OUTGOING" as TransferDirection, label: "Withdraw", Icon: ArrowUpCircle },
              ] as const).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => setDirection(value)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all",
                    direction === value
                      ? value === "INCOMING"
                        ? "bg-emerald-600 border-emerald-500 text-white"
                        : "bg-red-600/80 border-red-500 text-white"
                      : "bg-zinc-800/50 border-white/10 text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Bank account selector */}
          <div>
            <label className={labelCls}>From Bank Account</label>
            {achRelationships.length === 0 ? (
              <p className="text-sm text-zinc-500">No bank accounts linked. Add one first.</p>
            ) : (
              <select className={inputCls} value={relationshipId}
                onChange={(e) => { setRelationshipId(e.target.value); setValidationError(null); }}>
                {achRelationships.map((rel) => (
                  <option key={rel.id} value={rel.id}>
                    {rel.nickname ?? rel.bank_account_type} ···{rel.bank_account_number.slice(-4)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className={labelCls}>Amount (USD)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
              <input
                className={cn(inputCls, "pl-8")}
                placeholder="0.00"
                value={amount}
                inputMode="decimal"
                onChange={(e) => {
                  const val = e.target.value.replace(/[^\d.]/g, "");
                  setAmount(val);
                  setValidationError(null);
                }}
              />
            </div>
          </div>

          {(validationError || error) && !success && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="size-4 shrink-0" />
              {validationError ?? error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              Transfer initiated successfully.
            </div>
          )}

          <p className="text-[11px] text-zinc-600 leading-relaxed">
            ACH transfers typically settle in 1–3 business days.
            Sandbox transfers are virtual and do not move real funds.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || success || achRelationships.length === 0}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed",
              direction === "INCOMING" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600/80 hover:bg-red-500",
            )}
          >
            {loading ? (
              <><Loader2 className="size-3.5 animate-spin" /> Processing…</>
            ) : direction === "INCOMING" ? "Deposit" : "Withdraw"}
          </button>
        </div>
      </div>
    </div>
  );
}
