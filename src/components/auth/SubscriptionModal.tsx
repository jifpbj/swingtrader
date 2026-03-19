"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Crown,
  Zap,
  ArrowRight,
  XCircle,
  CreditCard,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useUIStore } from "@/store/useUIStore";
import { useSubscriptionStore, type Plan } from "@/store/useSubscriptionStore";
import { cn } from "@/lib/utils";

const STRIPE_BASIC_MONTHLY_LINK =
  process.env.NEXT_PUBLIC_STRIPE_BASIC_LINK ?? "https://buy.stripe.com/00waEZ64S3zWbAadqtbQY01";
const STRIPE_BASIC_ANNUAL_LINK =
  process.env.NEXT_PUBLIC_STRIPE_BASIC_ANNUAL_LINK ?? "https://buy.stripe.com/dRm4gBeBofiEdIiaehbQY02";

function planConfig(plan: Plan, active: boolean) {
  if (!active && plan !== "free") {
    return {
      label: `${plan === "basic" ? "Basic" : "Executive"} Plan · Cancelled`,
      icon: <XCircle className="size-3.5" />,
      badge: "text-amber-400 bg-amber-500/15 border-amber-500/25",
    };
  }
  switch (plan) {
    case "basic":
      return {
        label: "Basic Plan · Active",
        icon: <Zap className="size-3.5" />,
        badge: "text-emerald-400 bg-emerald-500/15 border-emerald-500/25",
      };
    case "executive":
      return {
        label: "Executive Plan · Active",
        icon: <Crown className="size-3.5" />,
        badge: "text-violet-400 bg-violet-500/15 border-violet-500/25",
      };
    default:
      return {
        label: "Free Plan",
        icon: null,
        badge: "text-zinc-400 bg-zinc-500/15 border-zinc-500/25",
      };
  }
}

export function SubscriptionModal() {
  const open    = useUIStore((s) => s.subscriptionModalOpen);
  const setOpen = useUIStore((s) => s.setSubscriptionModalOpen);
  const user    = useAuthStore((s) => s.user);

  const plan        = useSubscriptionStore((s) => s.plan);
  const status      = useSubscriptionStore((s) => s.status);
  const cancelling  = useSubscriptionStore((s) => s.cancelling);
  const cancelError = useSubscriptionStore((s) => s.cancelError);
  const cancel      = useSubscriptionStore((s) => s.cancelSubscription);

  const [confirming, setConfirming] = useState(false);
  const [cancelled,  setCancelled]  = useState(false);
  const [annual,     setAnnual]     = useState(false);

  async function handleConfirmCancel() {
    try {
      await cancel();
      setCancelled(true);
      setConfirming(false);
    } catch {
      // error shown via cancelError from store
    }
  }

  const isLoading  = status === "loading";
  const isActive   = status === "active";
  const isPaidPlan = plan === "basic" || plan === "executive";
  const cfg        = planConfig(plan, isActive);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
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
                <CreditCard className="size-4 text-emerald-400" />
              </div>
              <div>
                <Dialog.Title className="text-sm font-semibold text-foreground">
                  Subscription
                </Dialog.Title>
                <p className="text-xs text-muted-foreground">Manage your plan & billing</p>
              </div>
            </div>
            <Dialog.Close className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          {!user ? (
            <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg p-3">
              <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
              <span>Sign in to manage your subscription.</span>
            </div>
          ) : confirming ? (
            /* Cancel confirmation */
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
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
          ) : (
            <div className="space-y-4">
              {/* Current plan badge */}
              <div className="flex items-center justify-between rounded-xl border border-white/8 bg-zinc-900/40 p-4">
                <span className="text-xs font-medium text-zinc-400">Current Plan</span>
                {isLoading ? (
                  <span className="flex items-center gap-1 text-xs text-zinc-600">
                    <Loader2 className="size-3 animate-spin" /> Loading…
                  </span>
                ) : (
                  <span className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                    cfg.badge,
                  )}>
                    {cfg.icon}
                    {cfg.label}
                  </span>
                )}
              </div>

              {/* Post-cancel success */}
              {cancelled && (
                <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg p-3">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  Subscription cancelled. Access continues until end of billing period.
                </div>
              )}

              {/* Free plan → upgrade CTA */}
              {!isLoading && plan === "free" && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Billing</span>
                    <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-zinc-800/80 border border-white/5">
                      <button
                        onClick={() => setAnnual(false)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                          !annual ? "bg-zinc-600 text-white shadow" : "text-zinc-500 hover:text-zinc-300",
                        )}
                      >
                        Monthly
                      </button>
                      <button
                        onClick={() => setAnnual(true)}
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                          annual ? "bg-zinc-600 text-white shadow" : "text-zinc-500 hover:text-zinc-300",
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
                    className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-900/30"
                  >
                    <Zap className="size-3.5" />
                    Upgrade to Basic{annual ? " · Annual" : ""}
                    <ArrowRight className="size-3.5 ml-auto" />
                  </a>
                </div>
              )}

              {/* Paid + active → cancel */}
              {!isLoading && isPaidPlan && isActive && !cancelled && (
                <button
                  onClick={() => setConfirming(true)}
                  className="text-xs text-zinc-600 hover:text-red-400 transition-colors underline underline-offset-2 w-full text-left"
                >
                  Cancel subscription
                </button>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
