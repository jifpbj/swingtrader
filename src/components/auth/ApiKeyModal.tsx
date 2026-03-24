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
  ShieldAlert,
  Wifi,
} from "lucide-react";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";

// ─── Paper tab ─────────────────────────────────────────────────────────────────

function PaperTab() {
  const user   = useAuthStore((s) => s.user);

  const apiKey    = useAlpacaStore((s) => s.apiKey);
  const secretKey = useAlpacaStore((s) => s.secretKey);
  const account   = useAlpacaStore((s) => s.account);
  const loading   = useAlpacaStore((s) => s.loading);
  const error     = useAlpacaStore((s) => s.error);
  const dbSaving  = useAlpacaStore((s) => s.dbSaving);
  const dbSaved   = useAlpacaStore((s) => s.dbSaved);

  const connect             = useAlpacaStore((s) => s.connect);
  const disconnect          = useAlpacaStore((s) => s.disconnect);
  const saveCredentialsToDb = useAlpacaStore((s) => s.saveCredentialsToDb);

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

  async function handleSave() {
    if (!user) return;
    await connect(draftKey.trim(), draftSecret.trim());
    await saveCredentialsToDb(user.uid);
  }

  function handleDisconnect() {
    disconnect();
    setDraftKey("");
    setDraftSecret("");
    setTested(false);
  }

  return (
    <div className="space-y-4">
      {/* Not logged in warning */}
      {!user && (
        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg p-3">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
          <span>Sign in to save your API keys to your account and use them across devices.</span>
        </div>
      )}

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

      {dbSaved && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg p-3">
          <ShieldCheck className="size-3.5 shrink-0" />
          <span>Keys saved to your account — they&apos;ll load automatically on sign-in.</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
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
          {loading ? <><Loader2 className="size-3.5 animate-spin" /> Testing…</> : <><Wifi className="size-3.5" /> Test Connection</>}
        </button>

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
            {dbSaving ? <><Loader2 className="size-3.5 animate-spin" /> Saving…</> :
             dbSaved  ? <><CheckCircle2 className="size-3.5" /> Saved!</> :
             <><ShieldCheck className="size-3.5" /> Save to Account</>}
          </button>
        )}

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
          <ShieldCheck className="size-3" /> Paper trading only — no real money
        </span>
        <a href="https://app.alpaca.markets/paper/dashboard/overview" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-zinc-400 transition-colors">
          Get API keys <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

// ─── Live tab ──────────────────────────────────────────────────────────────────

function LiveTab() {
  const user = useAuthStore((s) => s.user);

  const liveApiKey    = useAlpacaStore((s) => s.liveApiKey);
  const liveSecretKey = useAlpacaStore((s) => s.liveSecretKey);
  const liveAccount   = useAlpacaStore((s) => s.liveAccount);
  const liveLoading   = useAlpacaStore((s) => s.liveLoading);
  const liveError     = useAlpacaStore((s) => s.liveError);
  const liveDbSaving  = useAlpacaStore((s) => s.liveDbSaving);
  const liveDbSaved   = useAlpacaStore((s) => s.liveDbSaved);

  const connectLive              = useAlpacaStore((s) => s.connectLive);
  const disconnectLive           = useAlpacaStore((s) => s.disconnectLive);
  const saveLiveCredentialsToDb  = useAlpacaStore((s) => s.saveLiveCredentialsToDb);

  const [draftKey, setDraftKey]       = useState(liveApiKey);
  const [draftSecret, setDraftSecret] = useState(liveSecretKey);
  const [showKey, setShowKey]         = useState(false);
  const [showSecret, setShowSecret]   = useState(false);
  const [tested, setTested]           = useState(false);

  const isConnected = !!liveAccount;
  const hasEdits    = draftKey !== liveApiKey || draftSecret !== liveSecretKey;
  const canTest     = draftKey.trim().length > 0 && draftSecret.trim().length > 0;

  async function handleTest() {
    setTested(false);
    await connectLive(draftKey.trim(), draftSecret.trim());
    setTested(true);
  }

  async function handleSave() {
    if (!user) return;
    await connectLive(draftKey.trim(), draftSecret.trim());
    await saveLiveCredentialsToDb(user.uid);
  }

  function handleDisconnect() {
    disconnectLive();
    setDraftKey("");
    setDraftSecret("");
    setTested(false);
  }

  return (
    <div className="space-y-4">
      {/* Real money warning */}
      <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg p-3">
        <ShieldAlert className="size-3.5 shrink-0 mt-0.5" />
        <span><strong>Live trading uses real money.</strong> Ensure you fully understand the risks before connecting.</span>
      </div>

      {/* Connected status */}
      {isConnected && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg p-3">
          <Wifi className="size-3.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-medium">Connected — </span>
            <span className="text-emerald-300/80">
              live account
              {liveAccount?.buying_power != null ? ` · $${liveAccount.buying_power.toLocaleString(undefined, { maximumFractionDigits: 2 })} buying power` : ""}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/5" />
        <span className="text-xs text-zinc-600 flex items-center gap-1.5">
          <Key className="size-3" /> Alpaca Live Trading
        </span>
        <div className="flex-1 h-px bg-white/5" />
      </div>

      <Field label="API Key" value={draftKey} onChange={setDraftKey} show={showKey} onToggleShow={() => setShowKey((v) => !v)} placeholder="AK••••••••••••••••••••" />
      <Field label="Secret Key" value={draftSecret} onChange={setDraftSecret} show={showSecret} onToggleShow={() => setShowSecret((v) => !v)} placeholder="••••••••••••••••••••••••••••••••••••••••" />

      {liveError && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-3">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
          <span>{liveError}</span>
        </div>
      )}

      {tested && !liveError && !liveLoading && isConnected && !hasEdits && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg p-3">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span>Connection successful! Your live trading account is ready.</span>
        </div>
      )}

      {liveDbSaved && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg p-3">
          <ShieldCheck className="size-3.5 shrink-0" />
          <span>Keys saved to your account — they&apos;ll load automatically on sign-in.</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={handleTest}
          disabled={!canTest || liveLoading}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
            canTest && !liveLoading
              ? "bg-zinc-700 hover:bg-zinc-600 text-white border border-white/10"
              : "bg-zinc-800/50 text-zinc-600 border border-white/5 cursor-not-allowed",
          )}
        >
          {liveLoading ? <><Loader2 className="size-3.5 animate-spin" /> Testing…</> : <><Wifi className="size-3.5" /> Test Connection</>}
        </button>

        {user && (
          <button
            onClick={handleSave}
            disabled={!canTest || liveLoading || liveDbSaving}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
              canTest && !liveLoading && !liveDbSaving
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40"
                : "bg-emerald-900/30 text-emerald-700 cursor-not-allowed",
            )}
          >
            {liveDbSaving ? <><Loader2 className="size-3.5 animate-spin" /> Saving…</> :
             liveDbSaved  ? <><CheckCircle2 className="size-3.5" /> Saved!</> :
             <><ShieldCheck className="size-3.5" /> Save to Account</>}
          </button>
        )}

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
          <ShieldAlert className="size-3" /> Real money — trade responsibly
        </span>
        <a href="https://app.alpaca.markets/brokerage/dashboard/overview" target="_blank" rel="noopener noreferrer"
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
  const tradingMode     = useAlpacaStore((s) => s.tradingMode);

  // Default tab to match current trading mode
  const [tab, setTab] = useState<"paper" | "live">(tradingMode === "live" ? "live" : "paper");

  function handleOpen(open: boolean) {
    if (open) setTab(tradingMode === "live" ? "live" : "paper");
    setSettingsOpen(open);
  }

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
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Key className="size-4 text-emerald-400" />
              </div>
              <div>
                <Dialog.Title className="text-sm font-semibold text-foreground">API Keys</Dialog.Title>
                <p className="text-xs text-muted-foreground">Alpaca trading credentials</p>
              </div>
            </div>
            <Dialog.Close className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 bg-zinc-800/60 rounded-xl p-1 mb-5">
            {(["paper", "live"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize",
                  tab === t
                    ? t === "live"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-zinc-600 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {t === "live" ? "🔴 Live" : "📄 Paper"}
              </button>
            ))}
          </div>

          {tab === "paper" && <PaperTab />}
          {tab === "live"  && <LiveTab />}
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
