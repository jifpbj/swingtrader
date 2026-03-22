"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { X, Bell, BellOff, CheckCircle2, Loader2, Mail } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/store/useAuthStore";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";

// ─── Notification preference shape ────────────────────────────────────────────

interface NotifPrefs {
  emailEnabled:        boolean;
  emailOnBuy:          boolean;
  emailOnSell:         boolean;
  emailOnTrailingStop: boolean;
  emailOnSignal:       boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  emailEnabled:        false,
  emailOnBuy:          true,
  emailOnSell:         true,
  emailOnTrailingStop: true,
  emailOnSignal:       true,
};

// ─── Checkbox row ──────────────────────────────────────────────────────────────

function CheckRow({
  label,
  sublabel,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  sublabel: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 py-2.5 px-3 rounded-lg cursor-pointer transition-colors",
        disabled
          ? "opacity-40 cursor-not-allowed"
          : "hover:bg-white/5",
      )}
    >
      <div className="mt-0.5 shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => !disabled && onChange(e.target.checked)}
        />
        <div
          className={cn(
            "size-4 rounded flex items-center justify-center border transition-colors",
            checked && !disabled
              ? "bg-emerald-500 border-emerald-500"
              : "border-white/20 bg-white/5",
          )}
        >
          {checked && (
            <svg viewBox="0 0 12 12" className="size-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 6 4.5 9.5 11 2" />
            </svg>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-200">{label}</p>
        <p className="text-[10px] text-zinc-500 mt-0.5">{sublabel}</p>
      </div>
    </label>
  );
}

// ─── Main modal ────────────────────────────────────────────────────────────────

export function NotificationSettingsModal() {
  const open    = useUIStore((s) => s.notificationSettingsOpen);
  const setOpen = useUIStore((s) => s.setNotificationSettingsOpen);
  const user    = useAuthStore((s) => s.user);

  const [prefs, setPrefs]       = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // ── Load prefs when modal opens ──────────────────────────────────────────────
  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    setError(null);
    setSaved(false);

    const ref = doc(db, `users/${user.uid}/settings/notifications`);
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          setPrefs({ ...DEFAULT_PREFS, ...(snap.data() as Partial<NotifPrefs>) });
        } else {
          setPrefs(DEFAULT_PREFS);
        }
      })
      .catch(() => setError("Failed to load preferences. Try again."))
      .finally(() => setLoading(false));
  }, [open, user]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const ref = doc(db, `users/${user.uid}/settings/notifications`);
      await setDoc(ref, prefs, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function patch(key: keyof NotifPrefs, value: boolean) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  const checkboxDisabled = !prefs.emailEnabled;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-full max-w-md",
            "glass-bright border border-white/10 rounded-2xl shadow-2xl shadow-black/60",
            "p-6 focus:outline-none",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <Bell className="size-4 text-emerald-400 shrink-0" />
              <Dialog.Title className="text-sm font-semibold text-white">
                Notification Settings
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="size-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Not signed in */}
          {!user && (
            <p className="text-xs text-zinc-400 text-center py-6">
              Sign in to manage email notification preferences.
            </p>
          )}

          {/* Loading */}
          {user && loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 text-zinc-500 animate-spin" />
            </div>
          )}

          {/* Content */}
          {user && !loading && (
            <div className="space-y-4">
              {/* Email address display */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/8">
                <Mail className="size-3.5 text-zinc-500 shrink-0" />
                <span className="text-xs text-zinc-400 truncate">{user.email}</span>
              </div>

              {/* Master toggle */}
              <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-white/5 border border-white/8">
                <div>
                  <p className="text-xs font-semibold text-white">Email Notifications</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {prefs.emailEnabled ? "Active — emails will be sent" : "Disabled — no emails will be sent"}
                  </p>
                </div>
                <button
                  onClick={() => patch("emailEnabled", !prefs.emailEnabled)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
                    "transition-colors duration-200 ease-in-out focus:outline-none",
                    prefs.emailEnabled ? "bg-emerald-500" : "bg-zinc-600",
                  )}
                  role="switch"
                  aria-checked={prefs.emailEnabled}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block size-5 rounded-full bg-white shadow-lg",
                      "transform transition duration-200 ease-in-out",
                      prefs.emailEnabled ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </button>
              </div>

              {/* Divider + subtitle */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-white/8" />
                <span className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">
                  Notify me when
                </span>
                <div className="flex-1 h-px bg-white/8" />
              </div>

              {/* Event checkboxes */}
              <div className="rounded-xl border border-white/8 overflow-hidden divide-y divide-white/5">
                <CheckRow
                  label="Buy executed"
                  sublabel="Auto-trade placed a buy order for a strategy"
                  checked={prefs.emailOnBuy}
                  disabled={checkboxDisabled}
                  onChange={(v) => patch("emailOnBuy", v)}
                />
                <CheckRow
                  label="Sell executed"
                  sublabel="Auto-trade closed a position — includes P&L breakdown"
                  checked={prefs.emailOnSell}
                  disabled={checkboxDisabled}
                  onChange={(v) => patch("emailOnSell", v)}
                />
                <CheckRow
                  label="Trailing stop triggered"
                  sublabel="A trailing stop automatically sold a position"
                  checked={prefs.emailOnTrailingStop}
                  disabled={checkboxDisabled}
                  onChange={(v) => patch("emailOnTrailingStop", v)}
                />
                <CheckRow
                  label="Signal alerts"
                  sublabel="A strategy without auto-trade detected a buy or sell signal"
                  checked={prefs.emailOnSignal}
                  disabled={checkboxDisabled}
                  onChange={(v) => patch("emailOnSignal", v)}
                />
              </div>

              {/* Error */}
              {error && (
                <p className="text-xs text-red-400 text-center">{error}</p>
              )}

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={saving}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                  saved
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-emerald-500 hover:bg-emerald-400 text-white",
                  saving && "opacity-70 cursor-not-allowed",
                )}
              >
                {saving ? (
                  <><Loader2 className="size-4 animate-spin" /> Saving…</>
                ) : saved ? (
                  <><CheckCircle2 className="size-4" /> Saved</>
                ) : (
                  <>
                    {prefs.emailEnabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
                    Save Preferences
                  </>
                )}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
