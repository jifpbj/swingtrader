"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Check,
  Zap,
  Bot,
  BrainCircuit,
  BarChart2,
  Crown,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Stripe Payment Link URLs — set these in .env.local:
     NEXT_PUBLIC_STRIPE_BASIC_LINK=https://buy.stripe.com/...
     NEXT_PUBLIC_STRIPE_PREMIUM_LINK=https://buy.stripe.com/...
   Falls back to "#" in dev so buttons never hard-break.
───────────────────────────────────────────────────────────── */
const STRIPE_BASIC   = process.env.NEXT_PUBLIC_STRIPE_BASIC_LINK   ?? "#";
const STRIPE_PREMIUM = process.env.NEXT_PUBLIC_STRIPE_PREMIUM_LINK ?? "#";

/* ── Tier feature lists ──────────────────────────────────────── */
const FREE_FEATURES = [
  "Backtest all 6 indicators — EMA, RSI, MACD, Bollinger Bands, TD Sequential & multi-indicator",
  "Free AI analysis of every indicator signal",
  "Set up and save unlimited strategies",
  "Browser notifications when it's time to trade",
  "Email, text & mobile app alerts coming soon to free tier",
];

const BASIC_FEATURES = [
  "Everything in Free",
  "Register & connect your own Alpaca brokerage account",
  "Paper Trading — automated, zero-risk practice",
  "Live Trading (coming soon)",
  "24/7 set-it-and-forget-it robo / algo trading engine",
  "Server-side execution — trades run even when your tab is closed",
];

const EXEC_FEATURES = [
  "Everything in Basic",
  "Real AI trading signals (not rule-based heuristics)",
  "Temporal Fusion Transformer (TFT) predictive models",
  "Long Short-Term Memory (LSTM) deep learning models",
  "Momentum & mean-reversion strategy templates",
  "Sentiment-driven algorithmic trading",
  "Monte Carlo risk simulations",
  "Kelly Criterion position sizing",
  "Priority Customer Support — < 4h response",
];

/* ── Try-Now CTA button with cycling witty labels ───────────── */
const TRY_NOW_LABELS = [
  "Start Making Money →",
  "Let the Algo Do It →",
  "Launch the Dashboard →",
  "Put Your Money to Work →",
  "Trade Smarter, Not Harder →",
  "See the Signals Live →",
  "Automate Your Alpha →",
  "Beat the Market Today →",
  "Your Bot Is Waiting →",
  "Free Money (almost) →",
];

function TryNowButton() {
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIdx((i) => (i + 1) % TRY_NOW_LABELS.length);
        setFading(false);
      }, 500);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex justify-center mb-14">
      {/* soft outer halo — large blur, very low opacity, slow pulse */}
      <div className="relative">
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            boxShadow:
              "0 0 40px 18px rgba(52,211,153,0.22), 0 0 100px 40px rgba(52,211,153,0.09)",
            animation: "tryCTAPulse 4s ease-in-out infinite",
          }}
        />
        <style>{`
          @keyframes tryCTAPulse {
            0%, 100% { opacity: 0.7; }
            50%       { opacity: 1;   }
          }
        `}</style>
        <Link
          href="/dashboard"
          className={cn(
            "relative inline-flex items-center justify-center px-8 py-3.5 rounded-2xl",
            "text-sm font-bold text-white tracking-wide",
            "bg-emerald-500 hover:bg-emerald-400 transition-colors duration-300",
            // tight inner glow on the button itself — feathered, not harsh
            "shadow-[0_0_18px_8px_rgba(52,211,153,0.28),0_0_50px_18px_rgba(52,211,153,0.10)]",
            "hover:shadow-[0_0_24px_10px_rgba(52,211,153,0.38),0_0_70px_24px_rgba(52,211,153,0.14)]",
          )}
        >
          <span
            className="relative transition-opacity duration-500"
            style={{ opacity: fading ? 0 : 1 }}
          >
            {TRY_NOW_LABELS[idx]}
          </span>
        </Link>
      </div>
    </div>
  );
}

/* ── Reusable check-mark list ────────────────────────────────── */
function FeatureList({ items, accent }: { items: string[]; accent: string }) {
  return (
    <ul className="flex flex-col gap-2.5 flex-1">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-xs text-zinc-300 leading-relaxed">
          <Check className={cn("size-3.5 shrink-0 mt-0.5", accent)} />
          {item}
        </li>
      ))}
    </ul>
  );
}

/* ── Main page ───────────────────────────────────────────────── */
export default function HomePage() {
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const [annual, setAnnual] = useState(false);

  const basicPrice = annual ? "7.20" : "9";
  const execPrice  = annual ? "112"  : "150";

  return (
    /* h-screen + overflow-y-auto: body is h-screen overflow-hidden, so the child
       needs a fixed height (not min-height) to create a scrollable inner container */
    <main className="h-screen overflow-y-auto scroll-smooth bg-zinc-950 text-zinc-100">

      {/* ── Marketing nav ── */}
      <header className="sticky top-0 z-30 glass-bright border-b border-white/5 px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2 select-none">
          <div className="size-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-900/40">
            <span className="text-xs font-black text-white">PA</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-zinc-200">
            Predictive<span className="text-emerald-400">Alpha</span>
          </span>
        </div>
        {/* Nav links */}
        <div className="flex items-center gap-4">
          <a
            href="#pricing"
            className="hidden md:block text-xs text-zinc-400 hover:text-zinc-100 transition-colors font-medium"
          >
            Pricing
          </a>
          <Link
            href="/dashboard"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-400 shadow-sm shadow-emerald-500/30 transition-all"
          >
            Open Dashboard →
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6">

        {/* ══════════════════════════════════════════
            HERO
        ══════════════════════════════════════════ */}
        <section className="pt-20 pb-16 text-center">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass-sm border border-emerald-500/30 text-emerald-400 text-xs font-medium mb-6">
            <Zap className="size-3 fill-emerald-400" />
            Algorithmic Trading, Simplified
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05] text-zinc-100 mb-5">
            Trade Smarter.<br />
            <span className="text-emerald-400">Not Harder.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-base md:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed mb-8">
            Predictive Alpha pairs AI-driven signals with battle-tested indicators and fully automated
            robo-trading — so you configure a strategy once and let the algorithms work around the
            clock. No finance degree, no babysitting required.
          </p>

          {/* CTA button */}
          <TryNowButton />

          {/* Value-prop bullets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-16 text-left">
            {[
              {
                icon: <Bot className="size-5 text-emerald-400" />,
                bg: "bg-emerald-500/10 border-emerald-500/20",
                title: "Set It & Forget It",
                body: "Configure a strategy once. Our engine monitors markets 24/7 and executes trades automatically through your Alpaca brokerage — even when your browser is closed.",
              },
              {
                icon: <BarChart2 className="size-5 text-amber-400" />,
                bg: "bg-amber-500/10 border-amber-500/20",
                title: "Backtest Before You Risk",
                body: "Validate every indicator combination against months of real historical data before going live. Win rate, P/L, and max drawdown — right in the dashboard.",
              },
              {
                icon: <BrainCircuit className="size-5 text-violet-400" />,
                bg: "bg-violet-500/10 border-violet-500/20",
                title: "Real AI. Not Buzzwords.",
                body: "Executive users get access to trained Temporal Fusion Transformer and LSTM models — the same deep-learning architectures used by quantitative hedge funds.",
              },
            ].map(({ icon, bg, title, body }) => (
              <div key={title} className={cn("glass-sm rounded-2xl p-5 border", bg)}>
                <div className="mb-3">{icon}</div>
                <h3 className="text-sm font-bold text-zinc-100 mb-1.5">{title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>

          {/* ── Feature showcase (mock UI tiles) ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3 text-left mb-1">
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">
                See it in action
              </span>
            </div>

            {/* Tile A — AI Confidence Gauge
                SCREENSHOT PLACEHOLDER:
                Drop a screenshot at /public/screenshots/ai-gauge.png then replace
                the mock below with:
                  <Image src="/screenshots/ai-gauge.png" alt="AI Gauge" fill className="object-cover rounded-2xl" />
            */}
            <div className="glass rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden">
              <div className="flex items-center gap-2">
                <BrainCircuit className="size-4 text-emerald-400" />
                <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">
                  AI Confidence
                </span>
              </div>
              <div className="flex-1 flex items-center justify-center py-4 relative">
                <div
                  className="size-32 rounded-full flex items-center justify-center relative"
                  style={{ background: "conic-gradient(#22c55e 0% 72%, rgba(255,255,255,0.04) 72% 100%)" }}
                >
                  <div className="size-24 rounded-full bg-zinc-950 flex flex-col items-center justify-center gap-0.5">
                    <span className="text-3xl font-black font-mono text-emerald-400 leading-none">72</span>
                    <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider">Bullish</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-zinc-600 font-mono px-1">
                <span>BEAR · 0</span>
                <span>BULL · 100</span>
              </div>
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 size-24 rounded-full bg-emerald-500/15 blur-2xl pointer-events-none" />
            </div>

            {/* Tile B — Backtest Results
                SCREENSHOT PLACEHOLDER: /public/screenshots/backtest.png
            */}
            <div className="glass rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden">
              <div className="flex items-center gap-2">
                <BarChart2 className="size-4 text-amber-400" />
                <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">
                  Backtest Results
                </span>
              </div>
              <div className="flex flex-col gap-2.5 flex-1 justify-center">
                {[
                  { period: "1 Month", ret: "+18.4%", win: "67%", positive: true },
                  { period: "3 Month", ret: "+31.2%", win: "71%", positive: true },
                  { period: "6 Month", ret: "+52.7%", win: "63%", positive: true },
                  { period: "1 Year",  ret: "−4.1%",  win: "48%", positive: false },
                ].map((r) => (
                  <div key={r.period} className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 w-14 shrink-0">{r.period}</span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400/60 rounded-full" style={{ width: r.win }} />
                    </div>
                    <span className={cn("text-[11px] font-mono tabular-nums w-12 text-right", r.positive ? "text-emerald-400" : "text-red-400")}>
                      {r.ret}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <span className="text-[10px] text-zinc-600">Win Rate</span>
                <span className="text-[10px] font-mono text-amber-400">67% avg</span>
              </div>
              <div className="absolute -bottom-4 right-0 size-20 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />
            </div>

            {/* Tile C — Active Strategy Card
                SCREENSHOT PLACEHOLDER: /public/screenshots/strategy-card.png
            */}
            <div className="glass rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-violet-400" />
                <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">
                  Active Strategy
                </span>
                <span className="ml-auto px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold uppercase tracking-wide">
                  Live
                </span>
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-100">AAPL · RSI + EMA Cross</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">15 min · Alpaca Paper</p>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 text-[10px] font-medium">RSI</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-medium">EMA</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[
                  { label: "Trades",    value: "7",    color: "text-zinc-200" },
                  { label: "Win Rate",  value: "71%",  color: "text-emerald-400" },
                  { label: "P/L Today", value: "+$84", color: "text-emerald-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-zinc-600">{label}</span>
                    <span className={cn("text-sm font-bold font-mono", color)}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="absolute -top-3 -right-3 size-20 rounded-full bg-violet-500/10 blur-xl pointer-events-none" />
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            PRICING (anchor target)
        ══════════════════════════════════════════ */}
        <section id="pricing" className="pb-24 scroll-mt-16">

          <div className="text-center mb-2">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Plans &amp; Pricing</span>
          </div>

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-4 py-8">
            <span className={cn("text-sm font-medium transition-colors", !annual ? "text-zinc-100" : "text-zinc-500")}>
              Monthly
            </span>
            <button
              onClick={() => setAnnual((v) => !v)}
              className={cn(
                "relative w-12 h-6 rounded-full transition-colors border",
                annual ? "bg-emerald-500/30 border-emerald-500/50" : "bg-zinc-800 border-white/10"
              )}
              aria-label="Toggle billing period"
            >
              <span
                className={cn(
                  "absolute top-0.5 size-5 rounded-full bg-white transition-transform shadow",
                  annual ? "translate-x-[26px]" : "translate-x-0.5"
                )}
              />
            </button>
            <span className={cn("text-sm font-medium transition-colors flex items-center gap-2", annual ? "text-zinc-100" : "text-zinc-500")}>
              Annual
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                SAVE 20%+
              </span>
            </span>
          </div>

          {/* Pricing cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">

            {/* ── FREE ── */}
            <div className="glass rounded-2xl p-6 flex flex-col gap-4 animate-fade-up" style={{ animationDelay: "0ms" }}>
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-zinc-800/80 border border-white/5 flex items-center justify-center">
                  <Zap className="size-4 text-zinc-400" />
                </div>
                <div>
                  <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-semibold">Free</p>
                  <p className="text-[10px] text-zinc-600">No credit card needed</p>
                </div>
              </div>
              <div className="flex items-end gap-1.5">
                <span className="text-5xl font-black text-zinc-100 font-mono leading-none">$0</span>
                <span className="text-zinc-500 text-sm mb-1">/mo</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Everything you need to learn algorithmic trading and validate strategies — before risking a single dollar of real capital.
              </p>
              <FeatureList items={FREE_FEATURES} accent="text-zinc-500" />
              <button
                onClick={openAuthModal}
                className="mt-auto w-full py-3 rounded-xl text-sm font-semibold text-zinc-200 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all"
              >
                Get Started Free
              </button>
            </div>

            {/* ── BASIC (Featured) ── */}
            <div
              className="relative glass-bright rounded-2xl p-6 flex flex-col gap-4 animate-fade-up ring-1 ring-emerald-500/40 shadow-2xl shadow-emerald-500/10 md:scale-[1.02]"
              style={{ animationDelay: "80ms" }}
            >
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-emerald-500/40 whitespace-nowrap">
                Most Popular
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="size-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <Bot className="size-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-[11px] text-emerald-400 uppercase tracking-widest font-semibold">Basic</p>
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/25 text-amber-400 text-[9px] font-bold uppercase tracking-wide">
                    Limited-time beta price
                  </span>
                </div>
              </div>
              <div>
                <div className="flex items-end gap-1.5">
                  <span className="text-5xl font-black text-zinc-100 font-mono leading-none">${basicPrice}</span>
                  <span className="text-zinc-500 text-sm mb-1">/mo</span>
                </div>
                {annual
                  ? <p className="text-[11px] text-zinc-500 mt-1">$86.40 billed annually</p>
                  : <p className="text-[11px] text-zinc-500 mt-1">or $86.40/yr — save 20%</p>
                }
                <p className="text-[11px] text-amber-400/70 italic mt-1.5">
                  Moving to $29/mo after beta. Grandfathered in at $9 while subscribed.
                </p>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Connect your Alpaca brokerage and let the algorithm trade for you, 24 hours a day — no screen time required.
              </p>
              <FeatureList items={BASIC_FEATURES} accent="text-emerald-500" />
              <a
                href={STRIPE_BASIC}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto w-full py-3 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-400/40 transition-all text-center block"
              >
                Start Trading →
              </a>
            </div>

            {/* ── EXECUTIVE ── */}
            <div
              className="glass rounded-2xl p-6 flex flex-col gap-4 animate-fade-up ring-1 ring-amber-500/25 shadow-xl shadow-amber-500/5"
              style={{ animationDelay: "160ms" }}
            >
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Crown className="size-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-[11px] text-amber-400 uppercase tracking-widest font-semibold">Executive</p>
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400/80 text-[9px] font-bold uppercase tracking-wide">
                    Grandfathered pricing
                  </span>
                </div>
              </div>
              <div>
                <div className="flex items-end gap-1.5">
                  <span className="text-5xl font-black text-zinc-100 font-mono leading-none">${execPrice}</span>
                  <span className="text-zinc-500 text-sm mb-1">/mo</span>
                </div>
                {annual
                  ? <p className="text-[11px] text-zinc-500 mt-1">$1,350 billed annually — save 25%</p>
                  : <p className="text-[11px] text-zinc-500 mt-1">or $1,350/yr — save 25%</p>
                }
                <p className="text-[11px] text-amber-400/70 italic mt-1.5">
                  Price locked for active subscribers as the platform grows.
                </p>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Real trained AI models, institutional-grade risk tools, and white-glove support — for traders who take alpha seriously.
              </p>
              <FeatureList items={EXEC_FEATURES} accent="text-amber-400" />
              <a
                href={STRIPE_PREMIUM}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto w-full py-3 rounded-xl text-sm font-semibold text-zinc-900 bg-amber-400 hover:bg-amber-300 shadow-lg shadow-amber-400/20 hover:shadow-amber-300/30 transition-all text-center block"
              >
                Go Executive →
              </a>
            </div>
          </div>

          {/* Legal disclaimer */}
          <p className="text-center text-[11px] text-zinc-600 mt-12 leading-relaxed max-w-2xl mx-auto">
            All prices in USD. Cancel anytime — no lock-in. Live Trading requires a funded Alpaca brokerage account.
            Beta pricing is locked for active subscribers for the lifetime of their subscription.
            Predictive Alpha is not a registered investment adviser. All trading involves risk of loss.
          </p>
        </section>

      </div>
    </main>
  );
}
