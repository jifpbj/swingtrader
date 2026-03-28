"use client";

import { useEffect, useState, useRef } from "react";
import { useStrategyStore } from "@/store/useStrategyStore";
import { useUIStore } from "@/store/useUIStore";

const WITTY_PHRASES = [
  "Simulating 10,000 scenarios…",
  "Testing strategy permutations…",
  "Backtesting through market chaos…",
  "Running Monte Carlo simulations…",
  "Consulting the crystal ball…",
  "Bribing the market gods…",
  "Whispering to the algorithm…",
  "Decoding chart hieroglyphics…",
  "Summoning the quant overlords…",
  "Asking the robots nicely…",
  "Reverse-engineering alpha…",
  "Crunching numbers, hold tight…",
  "Channeling Warren Buffett…",
  "Optimizing for maximum gains…",
  "Stress-testing your portfolio…",
];

const INDICATOR_DISPLAYS = [
  "EMA(21)",
  "RSI(14)",
  "MACD(12,26,9)",
  "BB(20, 2.0)",
  "TD Sequential",
  "EMA(50)",
  "RSI(7)",
  "MACD(8,21,5)",
  "BB(14, 1.5)",
  "EMA(9)",
  "RSI(21)",
  "MACD(5,35,5)",
  "BB(30, 2.5)",
];

export function AIAnalyzeAnimation() {
  const analyzing = useStrategyStore((s) => s.analyzing);
  const [currentPhrase, setCurrentPhrase] = useState(0);
  const [currentIndicator, setCurrentIndicator] = useState(0);
  const [scrambleValues, setScrambleValues] = useState({ strat: "0.0%", hold: "0.0%", trades: "0" });
  const phraseInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const indicatorInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrambleInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!analyzing) {
      // Clean up intervals
      if (phraseInterval.current) clearInterval(phraseInterval.current);
      if (indicatorInterval.current) clearInterval(indicatorInterval.current);
      if (scrambleInterval.current) clearInterval(scrambleInterval.current);
      return;
    }

    // Cycle witty phrases every 2.5 seconds
    phraseInterval.current = setInterval(() => {
      setCurrentPhrase((p) => (p + 1) % WITTY_PHRASES.length);
    }, 2500);

    // Cycle indicators every 200ms
    indicatorInterval.current = setInterval(() => {
      setCurrentIndicator((i) => (i + 1) % INDICATOR_DISPLAYS.length);
    }, 200);

    // Scramble numbers every 300ms
    scrambleInterval.current = setInterval(() => {
      setScrambleValues({
        strat: `${(Math.random() * 60 - 10).toFixed(1)}%`,
        hold: `${(Math.random() * 40 - 5).toFixed(1)}%`,
        trades: String(Math.floor(Math.random() * 50) + 1),
      });
    }, 300);

    return () => {
      if (phraseInterval.current) clearInterval(phraseInterval.current);
      if (indicatorInterval.current) clearInterval(indicatorInterval.current);
      if (scrambleInterval.current) clearInterval(scrambleInterval.current);
    };
  }, [analyzing]);

  if (!analyzing) return null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl overflow-hidden">
      {/* Semi-transparent backdrop — kept light so chart + sliders show through */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[3px]" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-4">
        {/* Indicator cycling — rapidly switching indicator names */}
        <div className="text-amber-400/60 font-mono text-sm tracking-wider animate-indicator-cycle" key={currentIndicator}>
          {INDICATOR_DISPLAYS[currentIndicator]}
        </div>

        {/* Main witty phrase */}
        <div className="text-2xl md:text-3xl font-black text-white text-center animate-fade-up" key={currentPhrase}>
          {WITTY_PHRASES[currentPhrase]}
        </div>

        {/* Scrambling numbers */}
        <div className="flex items-center gap-6 mt-2">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Strategy</span>
            <span className="text-xl font-black font-mono text-amber-400 animate-number-scramble" key={`s-${scrambleValues.strat}`}>
              {scrambleValues.strat}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Hold</span>
            <span className="text-xl font-black font-mono text-zinc-400 animate-number-scramble" key={`h-${scrambleValues.hold}`}>
              {scrambleValues.hold}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Trades</span>
            <span className="text-xl font-black font-mono text-zinc-300 animate-number-scramble" key={`t-${scrambleValues.trades}`}>
              {scrambleValues.trades}
            </span>
          </div>
        </div>

        {/* Spinning loader */}
        <div className="mt-4 size-8 border-3 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
      </div>
    </div>
  );
}
