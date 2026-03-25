"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuthStore } from "@/store/useAuthStore";
import { X, LogIn, UserPlus, Chrome } from "lucide-react";
import { cn } from "@/lib/utils";

const FRIENDLY: Record<string, string> = {
  "auth/user-not-found":       "No account found with that email.",
  "auth/wrong-password":       "Incorrect password.",
  "auth/invalid-credential":   "Email or password is incorrect.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password":        "Password must be at least 6 characters.",
  "auth/invalid-email":        "Please enter a valid email address.",
  "auth/popup-closed-by-user": "Sign-in popup was closed.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
};

function friendlyError(code: string): string {
  return FRIENDLY[code] ?? "Something went wrong. Please try again.";
}

export function AuthModal() {
  const authModalOpen = useAuthStore(s => s.authModalOpen);
  const closeAuthModal = useAuthStore(s => s.closeAuthModal);

  const [tab, setTab]           = useState<"signin" | "signup">("signin");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);

  function reset() {
    setEmail(""); setPassword(""); setConfirm(""); setError(null); setBusy(false);
  }

  function switchTab(t: "signin" | "signup") {
    setTab(t); setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (tab === "signup" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      if (tab === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", cred.user.uid), {
          email,
          createdAt: serverTimestamp(),
        });
      }
      reset();
      closeAuthModal();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      setError(friendlyError(code));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      reset();
      closeAuthModal();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      setError(friendlyError(code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={authModalOpen}
      onOpenChange={(open) => { if (!open) { reset(); closeAuthModal(); } }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm glass-bright rounded-2xl p-6 shadow-2xl border border-zinc-700/60 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">

          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-base font-semibold text-zinc-100">
              {tab === "signin" ? "Sign in to Predict Alpha" : "Create your account"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-700/50">
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 bg-zinc-800/60 rounded-xl p-1 mb-5">
            <button
              onClick={() => switchTab("signin")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                tab === "signin"
                  ? "bg-amber-400 text-zinc-900 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <LogIn className="size-3" /> Sign In
            </button>
            <button
              onClick={() => switchTab("signup")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                tab === "signup"
                  ? "bg-amber-400 text-zinc-900 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <UserPlus className="size-3" /> Create Account
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="bg-zinc-800/80 border border-zinc-700/60 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/30 transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={tab === "signin" ? "current-password" : "new-password"}
                placeholder="••••••••"
                className="bg-zinc-800/80 border border-zinc-700/60 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/30 transition-all"
              />
            </div>

            {tab === "signup" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">Confirm Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="bg-zinc-800/80 border border-zinc-700/60 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/30 transition-all"
                />
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 mt-1 rounded-xl py-2.5 text-sm font-bold bg-amber-400 hover:bg-amber-300 text-zinc-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-400/20"
            >
              {busy ? (
                <span className="inline-block size-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
              ) : tab === "signin" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-zinc-700/60" />
            <span className="text-[11px] text-zinc-500">or</span>
            <div className="flex-1 h-px bg-zinc-700/60" />
          </div>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2.5 rounded-xl py-2.5 text-sm font-medium bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Chrome className="size-4 text-zinc-400" />
            Continue with Google
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
