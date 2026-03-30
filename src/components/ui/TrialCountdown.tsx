"use client";

import { useEffect } from "react";
import { useTrialStore } from "@/store/useTrialStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useSubscriptionStore } from "@/store/useSubscriptionStore";
import { cn } from "@/lib/utils";
import { Clock, Sparkles } from "lucide-react";

export function TrialCountdown() {
  const user = useAuthStore((s) => s.user);
  const isPaid = useSubscriptionStore((s) => s.isPaid);
  const { daysRemaining, isExpired, initialized, initTrial, refreshTrial } =
    useTrialStore();

  // Init trial on mount
  useEffect(() => {
    if (!initialized) initTrial();
  }, [initialized, initTrial]);

  // Refresh every hour
  useEffect(() => {
    const id = setInterval(refreshTrial, 3_600_000);
    return () => clearInterval(id);
  }, [refreshTrial]);

  // Don't show for authenticated paid users
  if (user && isPaid()) return null;
  if (!initialized) return null;

  // Authenticated but free tier — show upgrade prompt instead
  if (user) {
    return (
      <button
        onClick={() => {
          const el = document.getElementById("pricing");
          if (el) el.scrollIntoView({ behavior: "smooth" });
          else window.location.href = "/#pricing";
        }}
        className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/15 border border-violet-500/25 hover:bg-violet-500/25 transition-all text-[10px] font-medium text-violet-300"
      >
        <Sparkles className="size-3 shrink-0" />
        Upgrade
      </button>
    );
  }

  // Unauthenticated — show trial countdown
  const color = daysRemaining > 7
    ? "emerald"
    : daysRemaining > 3
    ? "amber"
    : "red";

  const colorClasses = {
    emerald: "bg-emerald-500/15 border-emerald-500/25 text-emerald-300",
    amber: "bg-amber-500/15 border-amber-500/25 text-amber-300",
    red: "bg-red-500/15 border-red-500/25 text-red-300",
  }[color];

  const barColor = {
    emerald: "bg-emerald-400",
    amber: "bg-amber-400",
    red: "bg-red-400",
  }[color];

  const openAuthModal = useAuthStore.getState().openAuthModal;

  if (isExpired) {
    return (
      <button
        onClick={openAuthModal}
        className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/25 hover:bg-red-500/25 transition-all text-[10px] font-medium text-red-300"
      >
        <Clock className="size-3 shrink-0" />
        Trial ended — Sign up
      </button>
    );
  }

  return (
    <button
      onClick={openAuthModal}
      className={cn(
        "hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all hover:opacity-80",
        colorClasses,
      )}
      title="Sign up to continue trading after trial ends"
    >
      <Clock className="size-3 shrink-0" />
      <span className="text-[10px] font-medium whitespace-nowrap">
        {daysRemaining}d left
      </span>
      {/* Mini progress bar */}
      <div className="w-8 h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${(daysRemaining / 14) * 100}%` }}
        />
      </div>
    </button>
  );
}
