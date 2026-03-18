"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Wifi,
  Crown,
  Zap,
  ArrowRight,
  XCircle,
} from "lucide-react";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useUIStore } from "@/store/useUIStore";
import { useSubscriptionStore, type Plan } from "@/store/useSubscriptionStore";
import { cn } from "@/lib/utils";

const STRIPE_BASIC_MONTHLY_LINK =
  process.env.NEXT_PUBLIC_STRIPE_BASIC_LINK ?? "https://buy.stripe.com/00waEZ64S3zWbAadqtbQY01";
const STRIPE_BASIC_ANNUAL_LINK =
  process.env.NEXT_PUBLIC_STRIPE_BASIC_ANNUAL_LINK ?? "https://buy.stripe.com/dRm4gBeBofiEdIiaehbQY02";

// ─── Plan badge config ─────────────────────────────────────────────────────────

function planConfig(plan: Plan, active: boolean) {
  if (!active && plan !== "free") {
    return {
      label: `${plan === "basic" ? "Basic" : "Executive"} Plan · Cancelled`,
      icon: <XCircle className="size-3.5" />,
      badge: "text-amber-400 bg-amber-500/15 border-amber-500/25",
      dot: "bg-amber-400",
    };
  }
  switch (plan) {
    case "basic":
      return {
        label: "Basic Plan · Active",
        icon: <Zap className="size-3.5" />,
        badge: "text-emerald-400 bg-emerald-500/15 border-emerald-500/25",
        dot: "bg-emerald-400",
      };
    case "executive":
      return {
        label: "Executive Plan · Active",
        icon: <Crown className="size-3.5" />,
        badge: "text-violet-400 bg-violet-500/15 border-violet-500/25",
        dot: "bg-violet-400",
      };
    default:
      return {
        label: "Free Plan",
        icon: null,
        badge: "text-zinc-400 bg-zinc-500/15 border-zinc-500/25",
        dot: "bg-zinc-500",
      };
  }
}

// ─── Subscription panel ────────────────────────────────────────────────────────

function SubscriptionPanel() {
  const plan        = useSubscriptionStore((s) => s.plan);
  const status      = useSubscriptionStore((s) => s.status);
  const cancelling  = useSubscriptionStore((s) => s.cancelling);
  const cancelError = useSubscriptionStore((s) => s.cancelError);
  const cancel      = useSubscriptionStore((s) => s.cancelSubscription);
  const user        = useAuthStore((s) => s.user);

  const [confirming, setConfirming] = useState(false);
  const [cancelled,  setCancelled]  = useState(false);
  const [annual,     setAnnual]     = useState(false);

  // Not logged in — nothing to show
  if (!user) return null;

  const isLoading  = status === "loading";
  const isActive   = status === "active";
  const isPaidPlan = plan === "basic" || plan === "executive";
  const cfg        = planConfig(plan, isActive);

  async function handleConfirmCancel() {
    try {
      await cancel();
      setCancelled(true);
      setConfirming(false);
    } catch {
      // error shown via cancelError from store
    }
  }

  // ── Cancel confirmation view ────────────────────────────────────────────────
  if (confirming) {
    return (
      <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
        <p className="text-xs font-medium text-red-400">Cancel subscription?</p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Your access continues until the end of the current billing period.
          Automatic renewals will stop immediately.
        </p>
        {cancelError && (
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertCircle className="size-3.5 shrink-0" />
            {cancelError}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleConfirmCancel}
            disabled={cancelling}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all",
              cancelling
                ? "bg-red-900/30 text-red-700 cursor-not-allowed"
                : "bg-red-600 hover:bg-red-500 text-white",
            )}
          >
            {cancelling ? (
              <><Loader2 className="size-3 animate-spin" /> Cancelling…</>
            ) : (
              "Yes, Cancel Plan"
            )}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={cancelling}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 border border-white/10 hover:bg-white/5 transition-all"
          >
            Keep Plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-white/8 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">Subscription</span>
        {isLoading && (
          <span className="flex items-center gap-1 text-xs text-zinc-600">
            <Loader2 className="size-3 animate-spin" /> Loading…
          </span>
        )}
        {!isLoading && (
          <span
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
              cfg.badge,
            )}
          >
            {cfg.icon}
            {cfg.label}
          </span>
        )}
      </div>

      {/* Post-cancel success */}
      {cancelled && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400">
          <CheckCircle2 className="size-3.5 shrink-0" />
          Subscription cancelled. Access continues until end of billing period.
        </div>
      )}

      {/* Free plan → billing toggle + upgrade CTA */}
      {!isLoading && plan === "free" && (
        <div className="space-y-2.5">
          {/* Monthly / Annual toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Billing</span>
            <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-zinc-800/80 border border-white/5">
              <button
                onClick={() => setAnnual(false)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                  !annual
                    ? "bg-zinc-600 text-white shadow"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                  annual
                    ? "bg-zinc-600 text-white shadow"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                Annual
                <span className={cn(
                  "text-[10px] font-semibold px-1 py-0.5 rounded",
                  annual ? "bg-emerald-500/30 text-emerald-300" : "bg-zinc-700 text-zinc-500",
                )}>
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          <a
            href={annual ? STRIPE_BASIC_ANNUAL_LINK : STRIPE_BASIC_MONTHLY_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg text-xs font-medium",
              "bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-900/30",
            )}
          >
            <Zap className="size-3.5" />
            Upgrade to Basic{annual ? " · Annual" : ""}
            <ArrowRight className="size-3.5 ml-auto" />
          </a>
        </div>
      )}

      {/* Paid + active → cancel button */}
      {!isLoading && isPaidPlan && isActive && !cancelled && (
        <button
          onClick={() => setConfirming(true)}
          className="text-xs text-zinc-600 hover:text-red-400 transition-colors underline underline-offset-2 w-full text-left"
        >
          Cancel subscription
        </button>
      )}
    </div>
  );
}

// ─── Main modal ────────────────────────────────────────────────────────────────

export function ApiKeyModal() {
  const settingsOpen    = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const user            = useAuthStore((s) => s.user);

  const apiKey       = useAlpacaStore((s) => s.apiKey);
  const secretKey    = useAlpacaStore((s) => s.secretKey);
  const account      = useAlpacaStore((s) => s.account);
  const loading      = useAlpacaStore((s) => s.loading);
  const error        = useAlpacaStore((s) => s.error);
  const dbSaving     = useAlpacaStore((s) => s.dbSaving);
  const dbSaved      = useAlpacaStore((s) => s.dbSaved);

  const connect              = useAlpacaStore((s) => s.connect);
  const disconnect           = useAlpacaStore((s) => s.disconnect);
  const saveCredentialsToDb  = useAlpacaStore((s) => s.saveCredentialsToDb);

  // Local form state (so edits don't immediately clobber the store)
  const [draftKey, setDraftKey]       = useState(apiKey);
  const [draftSecret, setDraftSecret] = useState(secretKey);
  const [showKey, setShowKey]         = useState(false);
  const [showSecret, setShowSecret]   = useState(false);
  const [tested, setTested]           = useState(false);

  function handleOpen(open: boolean) {
    if (open) {
      // Sync draft from store when opening
      setDraftKey(apiKey);
      setDraftSecret(secretKey);
      setTested(false);
    }
    setSettingsOpen(open);
  }

  async function handleTest() {
    setTested(false);
    await connect(draftKey.trim(), draftSecret.trim());
    setTested(true);
  }

  async function handleSave() {
    if (!user) return;
    // Ensure store has the draft values before saving
    await connect(draftKey.trim(), draftSecret.trim());
    await saveCredentialsToDb(user.uid);
  }

  function handleDisconnect() {
    disconnect();
    setDraftKey("");
    setDraftSecret("");
    setTested(false);
  }

  const isConnected = !!account;
  const hasEdits    = draftKey !== apiKey || draftSecret !== secretKey;
  const canTest     = draftKey.trim().length > 0 && draftSecret.trim().length > 0;

  return (
    <Dialog.Root open={settingsOpen} onOpenChange={handleOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in-0" />

        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50",
            "w-full max-w-md glass-bright border border-white/10 rounded-2xl shadow-2xl",
            "p-6 animate-in fade-in-0 zoom-in-95",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Key className="size-4 text-emerald-400" />
              </div>
              <div>
                <Dialog.Title className="text-sm font-semibold text-foreground">
                  Account Settings
                </Dialog.Title>
                <p className="text-xs text-muted-foreground">Subscription & API credentials</p>
              </div>
            </div>
            <Dialog.Close className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          {/* Subscription status panel (logged-in users only) */}
          <SubscriptionPanel />

          {/* Not logged in warning */}
          {!user && (
            <div className="mb-4 flex items-start gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg p-3">
              <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
              <span>Sign in to save your API keys to your account and use them across devices.</span>
            </div>
          )}

          {/* Connected status banner */}
          {isConnected && (
            <div className="mb-4 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg p-3">
              <Wifi className="size-3.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-medium">Connected — </span>
                <span className="text-emerald-300/80">
                  paper account
                  {account?.buying_power != null
                    ? ` · $${account.buying_power.toLocaleString(undefined, { maximumFractionDigits: 2 })} buying power`
                    : ""}
                </span>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-xs text-zinc-600 flex items-center gap-1.5">
              <Key className="size-3" /> Alpaca Paper Trading
            </span>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          {/* Form */}
          <div className="space-y-4">
            <Field
              label="API Key"
              value={draftKey}
              onChange={setDraftKey}
              show={showKey}
              onToggleShow={() => setShowKey((v) => !v)}
              placeholder="PK••••••••••••••••••••"
            />
            <Field
              label="Secret Key"
              value={draftSecret}
              onChange={setDraftSecret}
              show={showSecret}
              onToggleShow={() => setShowSecret((v) => !v)}
              placeholder="••••••••••••••••••••••••••••••••••••••••"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mt-3 flex items-start gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-3">
              <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Test success */}
          {tested && !error && !loading && isConnected && !hasEdits && (
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg p-3">
              <CheckCircle2 className="size-3.5 shrink-0" />
              <span>Connection successful! Your paper trading account is ready.</span>
            </div>
          )}

          {/* DB saved confirmation */}
          {dbSaved && (
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg p-3">
              <ShieldCheck className="size-3.5 shrink-0" />
              <span>Keys saved to your account — they&apos;ll load automatically on sign-in.</span>
            </div>
          )}

          {/* Actions */}
          <div className="mt-5 flex flex-col gap-2">
            {/* Test */}
            <button
              onClick={handleTest}
              disabled={!canTest || loading}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                canTest && !loading
                  ? "bg-zinc-700 hover:bg-zinc-600 text-white border border-white/10"
                  : "bg-zinc-800/50 text-zinc-600 border border-white/5 cursor-not-allowed",
              )}
            >
              {loading ? (
                <><Loader2 className="size-3.5 animate-spin" /> Testing…</>
              ) : (
                <><Wifi className="size-3.5" /> Test Connection</>
              )}
            </button>

            {/* Save to DB (only when logged in) */}
            {user && (
              <button
                onClick={handleSave}
                disabled={!canTest || loading || dbSaving}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                  canTest && !loading && !dbSaving
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40"
                    : "bg-emerald-900/30 text-emerald-700 cursor-not-allowed",
                )}
              >
                {dbSaving ? (
                  <><Loader2 className="size-3.5 animate-spin" /> Saving…</>
                ) : dbSaved ? (
                  <><CheckCircle2 className="size-3.5" /> Saved!</>
                ) : (
                  <><ShieldCheck className="size-3.5" /> Save to Account</>
                )}
              </button>
            )}

            {/* Disconnect */}
            {isConnected && (
              <button
                onClick={handleDisconnect}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/40 transition-all"
              >
                Disconnect
              </button>
            )}
          </div>

          {/* Footer */}
          <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-zinc-600">
            <span className="flex items-center gap-1">
              <ShieldCheck className="size-3" />
              Paper trading only — no real money
            </span>
            <a
              href="https://app.alpaca.markets/paper/dashboard/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-zinc-400 transition-colors"
            >
              Get API keys <ExternalLink className="size-3" />
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Reusable masked input field ───────────────────────────────────────────────
function Field({
  label,
  value,
  onChange,
  show,
  onToggleShow,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-400">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            "w-full bg-zinc-900/60 border border-white/10 rounded-xl px-3.5 py-2.5",
            "text-sm font-mono text-foreground placeholder:text-zinc-600",
            "focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/40",
            "pr-10 transition-all",
          )}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}
