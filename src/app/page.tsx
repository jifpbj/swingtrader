"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Zap,
  Bot,
  BrainCircuit,
  BarChart2,
  Crosshair,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   DISABLED in demo/beta mode — Stripe payment links hidden.
   Re-enable by uncommenting when subscriptions are live.
───────────────────────────────────────────────────────────── */
// const STRIPE_BASIC        = process.env.NEXT_PUBLIC_STRIPE_BASIC_LINK        ?? "#";
// const STRIPE_BASIC_ANNUAL = process.env.NEXT_PUBLIC_STRIPE_BASIC_ANNUAL_LINK ?? "#";
// const STRIPE_PREMIUM      = process.env.NEXT_PUBLIC_STRIPE_PREMIUM_LINK      ?? "#";

/* ── Tier feature lists — kept for reference, not rendered in beta ── */
// const FREE_FEATURES = [ ... ];
// const BASIC_FEATURES = [ ... ];
// const EXEC_FEATURES = [ ... ];

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
          className="absolute inset-0 rounded-2xl pointer-events-none animate-cta-pulse"
          style={{
            boxShadow:
              "0 0 40px 18px rgba(52,211,153,0.22), 0 0 100px 40px rgba(52,211,153,0.09)",
          }}
        />
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


/* ── Main page ───────────────────────────────────────────────── */
export default function HomePage() {
  // const [annual, setAnnual] = useState(false);  // DISABLED — pricing hidden in beta
  // const basicPrice = annual ? "7.20" : "9";
  // const execPrice  = annual ? "112"  : "150";

  return (
    /* h-screen + overflow-y-auto: body is h-screen overflow-hidden, so the child
       needs a fixed height (not min-height) to create a scrollable inner container */
    <main className="min-h-screen scroll-smooth bg-zinc-950 text-zinc-100">

      {/* ── Marketing nav ── */}
      <header className="sticky top-0 z-30 glass-bright border-b border-white/5 px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 select-none hover:opacity-80 transition-opacity">
          <div className="size-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-900/40">
            <Crosshair className="size-4 text-white stroke-[2.5]" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-zinc-200">
            Predict<span className="text-emerald-400">Alpha</span>
          </span>
        </Link>
        {/* Nav links */}
        <div className="flex items-center gap-4">
          {/* Pricing link hidden in beta */}
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
            Predict Alpha pairs AI-driven signals with battle-tested indicators and fully automated
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
            PRICING — hidden in demo/beta mode
            Re-enable this section when subscriptions go live.
        ══════════════════════════════════════════ */}

      </div>
    </main>
  );
}
