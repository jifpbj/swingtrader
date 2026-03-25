"use client";

import { useState } from "react";
import { useBrokerStore } from "@/store/useBrokerStore";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/lib/utils";
import type { ACHBankAccountType } from "@/types/broker";
import { X, Loader2, AlertCircle, Landmark } from "lucide-react";

interface ACHFormModalProps {
  onClose: () => void;
}

export function ACHFormModal({ onClose }: ACHFormModalProps) {
  const user = useAuthStore((s) => s.user);
  const { createACHRelationship, loading, error, clearError } = useBrokerStore();

  const [form, setForm] = useState({
    account_owner_name: "",
    bank_account_type: "CHECKING" as ACHBankAccountType,
    bank_routing_number: "",
    bank_account_number: "",
    bank_account_number_confirm: "",
    nickname: "",
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setValidationError(null);
    clearError();
  };

  const validate = (): string | null => {
    if (!form.account_owner_name.trim()) return "Account owner name is required.";
    if (!/^\d{9}$/.test(form.bank_routing_number)) return "Routing number must be 9 digits.";
    if (form.bank_account_number.replace(/\D/g, "").length < 6) return "Account number must be at least 6 digits.";
    if (form.bank_account_number !== form.bank_account_number_confirm) return "Account numbers do not match.";
    return null;
  };

  const handleSubmit = async () => {
    if (!user) return;
    const err = validate();
    if (err) { setValidationError(err); return; }

    try {
      await createACHRelationship(user.uid, {
        account_owner_name: form.account_owner_name.trim(),
        bank_account_type: form.bank_account_type,
        bank_routing_number: form.bank_routing_number,
        bank_account_number: form.bank_account_number,
        nickname: form.nickname.trim() || undefined,
      });
      setSuccess(true);
      setTimeout(() => onClose(), 1200);
    } catch {
      // error shown via store
    }
  };

  const inputCls = "w-full bg-zinc-800/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all";
  const labelCls = "block text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass w-full max-w-md rounded-2xl border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
          <Landmark className="size-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-zinc-100">Add Bank Account</h2>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-all">
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Account Owner Name *</label>
            <input className={inputCls} placeholder="Jane Doe"
              value={form.account_owner_name}
              onChange={(e) => setField("account_owner_name", e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Account Type *</label>
            <div className="flex gap-3">
              {(["CHECKING", "SAVINGS"] as ACHBankAccountType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setField("bank_account_type", type)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all",
                    form.bank_account_type === type
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-zinc-800/50 border-white/10 text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  {type.charAt(0) + type.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Routing Number *</label>
            <input className={inputCls} placeholder="9-digit routing number"
              value={form.bank_routing_number} inputMode="numeric" maxLength={9}
              onChange={(e) => setField("bank_routing_number", e.target.value.replace(/\D/g, "").slice(0, 9))} />
          </div>

          <div>
            <label className={labelCls}>Account Number *</label>
            <input className={inputCls} placeholder="Bank account number"
              value={form.bank_account_number} inputMode="numeric"
              onChange={(e) => setField("bank_account_number", e.target.value.replace(/\D/g, ""))} />
          </div>

          <div>
            <label className={labelCls}>Confirm Account Number *</label>
            <input className={inputCls} placeholder="Re-enter account number"
              value={form.bank_account_number_confirm} inputMode="numeric"
              onChange={(e) => setField("bank_account_number_confirm", e.target.value.replace(/\D/g, ""))} />
          </div>

          <div>
            <label className={labelCls}>Nickname (optional)</label>
            <input className={inputCls} placeholder="e.g. Chase Checking"
              value={form.nickname}
              onChange={(e) => setField("nickname", e.target.value)} />
          </div>

          {(validationError || error) && !success && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="size-4 shrink-0" />
              {validationError ?? error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              Bank account added successfully.
            </div>
          )}

          <p className="text-[11px] text-zinc-600 leading-relaxed">
            Bank account numbers are submitted directly to Alpaca and are not stored on Predict Alpha servers.
            ACH relationships are subject to Alpaca&apos;s verification process.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || success}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <><Loader2 className="size-3.5 animate-spin" /> Adding…</> : "Add Bank Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
