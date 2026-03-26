"use client";

import * as Slider from "@radix-ui/react-slider";
import { useUIStore } from "@/store/useUIStore";
import type { IndicatorTab } from "@/store/useUIStore";
import { cn } from "@/lib/utils";

const TABS: IndicatorTab[] = ["EMA", "BB", "RSI", "MACD", "TD9"];

const TAB_STYLE: Record<IndicatorTab, { active: string; track: string; thumb: string }> = {
  EMA:  { active: "bg-amber-400/15 text-amber-400 border-amber-400/30",   track: "bg-amber-400/60",   thumb: "bg-amber-400" },
  BB:   { active: "bg-sky-400/15 text-sky-400 border-sky-400/30",         track: "bg-sky-400/60",     thumb: "bg-sky-400" },
  RSI:  { active: "bg-violet-400/15 text-violet-400 border-violet-400/30",track: "bg-violet-400/60",  thumb: "bg-violet-400" },
  MACD: { active: "bg-rose-400/15 text-rose-400 border-rose-400/30",      track: "bg-rose-400/60",    thumb: "bg-rose-400" },
  TD9:  { active: "bg-emerald-400/15 text-emerald-400 border-emerald-400/30", track: "bg-emerald-400/60", thumb: "bg-emerald-400" },
};

function SliderRow({ label, value, min, max, step = 1, onChange, tab }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; tab: IndicatorTab;
}) {
  const s = TAB_STYLE[tab];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-base text-zinc-500">{label}</span>
        <span className="text-lg font-mono tabular-nums text-zinc-200">
          {Number.isInteger(step) ? value : value.toFixed(1)}
        </span>
      </div>
      <Slider.Root value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={max} step={step}
        className="relative flex items-center select-none touch-none w-full h-4">
        <Slider.Track className="bg-white/10 relative grow rounded-full h-1">
          <Slider.Range className={cn("absolute rounded-full h-full", s.track)} />
        </Slider.Track>
        <Slider.Thumb className={cn("block size-5 rounded-full shadow focus:outline-none", s.thumb)} />
      </Slider.Root>
    </div>
  );
}

// ─── Per-tab configs ──────────────────────────────────────────────────────────

function EMAConfig() {
  const emaPeriod         = useUIStore(s => s.emaPeriod);
  const setEmaPeriod      = useUIStore(s => s.setEmaPeriod);
  const showSignalMarkers = useUIStore(s => s.showSignalMarkers);
  const setShowSignalMarkers = useUIStore(s => s.setShowSignalMarkers);

  return (
    <div className="flex flex-col gap-3">
      <SliderRow label="Period" value={emaPeriod} min={5} max={200} onChange={setEmaPeriod} tab="EMA" />
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={showSignalMarkers} onChange={e => setShowSignalMarkers(e.target.checked)} className="accent-emerald-400 size-3" />
        <span className="text-lg text-zinc-300">Show BUY / SELL markers</span>
      </label>
    </div>
  );
}

function BBConfig() {
  const bbPeriod   = useUIStore(s => s.bbPeriod);
  const setBbPeriod = useUIStore(s => s.setBbPeriod);
  const bbStdDev   = useUIStore(s => s.bbStdDev);
  const setBbStdDev = useUIStore(s => s.setBbStdDev);
  const showSignalMarkers = useUIStore(s => s.showSignalMarkers);
  const setShowSignalMarkers = useUIStore(s => s.setShowSignalMarkers);

  return (
    <div className="flex flex-col gap-3">
      <SliderRow label="Period"  value={bbPeriod} min={5} max={100} onChange={setBbPeriod} tab="BB" />
      <SliderRow label="Std Dev" value={bbStdDev} min={1} max={4} step={0.1} onChange={setBbStdDev} tab="BB" />
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={showSignalMarkers} onChange={e => setShowSignalMarkers(e.target.checked)} className="accent-sky-400 size-3" />
        <span className="text-lg text-zinc-300">Show BUY / SELL markers</span>
      </label>
    </div>
  );
}

function RSIConfig() {
  const rsiPeriod      = useUIStore(s => s.rsiPeriod);
  const setRsiPeriod   = useUIStore(s => s.setRsiPeriod);
  const rsiOverbought  = useUIStore(s => s.rsiOverbought);
  const setRsiOverbought = useUIStore(s => s.setRsiOverbought);
  const rsiOversold    = useUIStore(s => s.rsiOversold);
  const setRsiOversold = useUIStore(s => s.setRsiOversold);
  const showSignalMarkers = useUIStore(s => s.showSignalMarkers);
  const setShowSignalMarkers = useUIStore(s => s.setShowSignalMarkers);

  return (
    <div className="flex flex-col gap-3">
      <SliderRow label="Period" value={rsiPeriod} min={2} max={50} onChange={setRsiPeriod} tab="RSI" />
      <div className="grid grid-cols-2 gap-3">
        <SliderRow label="Overbought" value={rsiOverbought} min={60} max={90} onChange={setRsiOverbought} tab="RSI" />
        <SliderRow label="Oversold"   value={rsiOversold}   min={10} max={40} onChange={setRsiOversold}   tab="RSI" />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={showSignalMarkers} onChange={e => setShowSignalMarkers(e.target.checked)} className="accent-violet-400 size-3" />
        <span className="text-lg text-zinc-300">Show BUY / SELL markers</span>
      </label>
    </div>
  );
}

function MACDConfig() {
  const macdFastPeriod   = useUIStore(s => s.macdFastPeriod);
  const setMacdFastPeriod = useUIStore(s => s.setMacdFastPeriod);
  const macdSlowPeriod   = useUIStore(s => s.macdSlowPeriod);
  const setMacdSlowPeriod = useUIStore(s => s.setMacdSlowPeriod);
  const macdSignalPeriod = useUIStore(s => s.macdSignalPeriod);
  const setMacdSignalPeriod = useUIStore(s => s.setMacdSignalPeriod);
  const showSignalMarkers = useUIStore(s => s.showSignalMarkers);
  const setShowSignalMarkers = useUIStore(s => s.setShowSignalMarkers);

  return (
    <div className="flex flex-col gap-3">
      <SliderRow label="Fast"   value={macdFastPeriod}   min={3}  max={50}  onChange={setMacdFastPeriod}   tab="MACD" />
      <SliderRow label="Slow"   value={macdSlowPeriod}   min={10} max={100} onChange={v => { if (v > macdFastPeriod) setMacdSlowPeriod(v); }} tab="MACD" />
      <SliderRow label="Signal" value={macdSignalPeriod} min={3}  max={20}  onChange={setMacdSignalPeriod} tab="MACD" />
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={showSignalMarkers} onChange={e => setShowSignalMarkers(e.target.checked)} className="accent-rose-400 size-3" />
        <span className="text-lg text-zinc-300">Show BUY / SELL markers</span>
      </label>
    </div>
  );
}

function TD9Config() {
  const showSignalMarkers = useUIStore(s => s.showSignalMarkers);
  const setShowSignalMarkers = useUIStore(s => s.setShowSignalMarkers);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={showSignalMarkers} onChange={e => setShowSignalMarkers(e.target.checked)} className="accent-emerald-400 size-3" />
        <span className="text-lg text-zinc-300">Show TD9 completion markers</span>
      </label>
      <div className="text-base text-zinc-500 leading-relaxed">
        TD Sequential setup: counts when Close is below/above the Close 4 bars earlier. Markers trigger on count 9.
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function IndicatorPanel() {
  const activeTab    = useUIStore(s => s.activeIndicatorTab);
  const setActiveTab = useUIStore(s => s.setActiveIndicatorTab);

  return (
    <div className="glass rounded-2xl px-4 py-3 flex flex-col gap-3 shrink-0">
      <span className="text-xl font-semibold text-zinc-200">Indicators</span>

      {/* Tab selector — clicking a tab activates that indicator on the chart */}
      <div className="flex gap-1">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 text-base font-mono font-medium py-2 rounded-lg border transition-all",
              activeTab === tab
                ? TAB_STYLE[tab].active
                : "text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-white/5"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Config for active tab */}
      <div className="min-h-[96px]">
        {activeTab === "EMA"  && <EMAConfig />}
        {activeTab === "BB"   && <BBConfig />}
        {activeTab === "RSI"  && <RSIConfig />}
        {activeTab === "MACD" && <MACDConfig />}
        {activeTab === "TD9"  && <TD9Config />}
      </div>

      {/* ─── Risk Management — trailing stop ─────────────────────────────── */}
      <TrailingStopConfig />
    </div>
  );
}

function TrailingStopConfig() {
  const tsEnabled    = useUIStore(s => s.trailingStopEnabled);
  const setTsEnabled = useUIStore(s => s.setTrailingStopEnabled);
  const tsPercent    = useUIStore(s => s.trailingStopPercent);
  const setTsPercent = useUIStore(s => s.setTrailingStopPercent);

  return (
    <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-zinc-300">Risk Management</span>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={tsEnabled}
          onChange={e => setTsEnabled(e.target.checked)}
          className="accent-amber-400 size-3"
        />
        <span className="text-lg text-zinc-300">Trailing Stop Loss</span>
      </label>

      {tsEnabled && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-base text-zinc-500">Percentage</span>
            <span className="text-lg font-mono tabular-nums text-zinc-200">
              {tsPercent.toFixed(1)}%
            </span>
          </div>
          <Slider.Root
            value={[tsPercent]}
            onValueChange={([v]) => setTsPercent(v)}
            min={0.5}
            max={20}
            step={0.5}
            className="relative flex items-center select-none touch-none w-full h-4"
          >
            <Slider.Track className="bg-white/10 relative grow rounded-full h-1">
              <Slider.Range className="absolute rounded-full h-full bg-amber-400/60" />
            </Slider.Track>
            <Slider.Thumb className="block size-5 rounded-full shadow focus:outline-none bg-amber-400" />
          </Slider.Root>
          <p className="text-base text-zinc-500/80 leading-relaxed">
            Automatically exits when price drops {tsPercent}% from the highest price since entry.
          </p>
        </div>
      )}
    </div>
  );
}
