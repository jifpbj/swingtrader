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
} from "lucide-react";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";

// ─── Paper tab ─────────────────────────────────────────────────────────────────

function PaperTab() {
  const apiKey    = useAlpacaStore((s) => s.apiKey);
  const secretKey = useAlpacaStore((s) => s.secretKey);
  const account   = useAlpacaStore((s) => s.account);
  const loading   = useAlpacaStore((s) => s.loading);
  const error     = useAlpacaStore((s) => s.error);

  const connect    = useAlpacaStore((s) => s.connect);
  const disconnect = useAlpacaStore((s) => s.disconnect);

  const [draftKey, setDraftKey]       = useState(apiKey);
  const [draftSecret, setDraftSecret] = useState(secretKey);
  const [showKey, setShowKey]         = useState(false);
  const [showSecret, setShowSecret]   = useState(false);
  const [tested, setTested]           = useState(false);

  const isConnected = !!account;
  const hasEdits    = draftKey !== apiKey || draftSecret !== secretKey;
  const canTest     = draftKey.trim().length > 0 && draftSecret.trim().length > 0;

  async function handleTest() {
    setTested(false);
    await connect(draftKey.trim(), draftSecret.trim());
    setTested(true);
  }

  function handleDisconnect() {
    disconnect();
    setDraftKey("");
    setDraftSecret("");
    setTested(false);
  }

  return (
    <div className="space-y-4">
      {/* Connected status */}
      {isConnected && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg p-3">
          <Wifi className="size-3.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-medium">Connected — </span>
            <span className="text-emerald-300/80">
              paper account
              {account?.buying_power != null ? ` · $${account.buying_power.toLocaleString(undefined, { maximumFractionDigits: 2 })} buying power` : ""}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/5" />
        <span className="text-xs text-zinc-600 flex items-center gap-1.5">
          <Key className="size-3" /> Alpaca Paper Trading
        </span>
        <div className="flex-1 h-px bg-white/5" />
      </div>

      <Field label="API Key" value={draftKey} onChange={setDraftKey} show={showKey} onToggleShow={() => setShowKey((v) => !v)} placeholder="PK••••••••••••••••••••" />
      <Field label="Secret Key" value={draftSecret} onChange={setDraftSecret} show={showSecret} onToggleShow={() => setShowSecret((v) => !v)} placeholder="••••••••••••••••••••••••••••••••••••••••" />

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-3">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {tested && !error && !loading && isConnected && !hasEdits && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg p-3">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span>Connection successful! Your paper trading account is ready.</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={handleTest}
          disabled={!canTest || loading}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
            canTest && !loading
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40"
              : "bg-zinc-800/50 text-zinc-600 border border-white/5 cursor-not-allowed",
          )}
        >
          {loading ? <><Loader2 className="size-3.5 animate-spin" /> Connecting…</> : <><Wifi className="size-3.5" /> Connect</>}
        </button>

        {isConnected && (
          <button
            onClick={handleDisconnect}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/40 transition-all"
          >
            Disconnect
          </button>
        )}
      </div>

      <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs text-zinc-600">
        <span className="flex items-center gap-1">
          <ShieldCheck className="size-3" /> Stored in your browser only — never on our servers
        </span>
        <a href="https://app.alpaca.markets/paper/dashboard/overview" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-zinc-400 transition-colors">
          Get API keys <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

// ─── Main modal ────────────────────────────────────────────────────────────────

export function ApiKeyModal() {
  const settingsOpen    = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  return (
    <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
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
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Key className="size-4 text-emerald-400" />
              </div>
              <div>
                <Dialog.Title className="text-sm font-semibold text-foreground">API Keys</Dialog.Title>
                <p className="text-xs text-muted-foreground">Alpaca paper trading credentials</p>
              </div>
            </div>
            <Dialog.Close className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <PaperTab />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Reusable masked input field ───────────────────────────────────────────────
function Field({
  label, value, onChange, show, onToggleShow, placeholder,
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
