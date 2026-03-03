"use client";

import { useEffect, useRef } from "react";
import type { Candle, Indicators, Prediction, AlphaSignal } from "@/types/market";

// ─── Seeded random for deterministic initial data ─────────────────────────────
function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const TF_INTERVAL_SECS: Record<string, number> = {
  "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400,
};

export function generateMockCandlesForTimeframe(
  count: number,
  timeframe: string,
  basePrice = 67_000,
): Candle[] {
  if (timeframe === "1d") return generateMockDailyCandles(count, basePrice);
  const intervalSecs = TF_INTERVAL_SECS[timeframe] ?? 900;
  // Normalise per-bar vol to ~2.5% daily-equivalent sigma regardless of timeframe.
  // Without this, short intervals (15m) compound to hundreds-of-percent hold returns.
  const volScale = Math.sqrt(intervalSecs / 86400); // e.g. 15m → 0.102, 1h → 0.204, 4h → 0.408
  return generateMockCandles(count, basePrice, intervalSecs, 0.003 * volScale, 0.010 * volScale);
}

export function generateMockCandles(
  count = 200,
  basePrice = 67_000,
  intervalSecs = 15 * 60,
  // Per-bar vol range — defaults match original behaviour (used by ChartContainer).
  // Pass scaled values via generateMockCandlesForTimeframe for accurate backtest data.
  volMin = 0.003,
  volMax = 0.010,
): Candle[] {
  const rand = seededRand(42);
  const candles: Candle[] = [];
  const now = Math.floor(Date.now() / 1000);
  const interval = intervalSecs;

  let price = basePrice;
  for (let i = count - 1; i >= 0; i--) {
    const vol = volMin + rand() * (volMax - volMin);
    const direction = rand() > 0.48 ? 1 : -1;
    const open = price;
    const change = price * vol * direction;
    const close = price + change;
    // Scale wicks proportionally so candle shape stays realistic
    const wickScale = vol / 0.0065;
    const highExtra = price * (rand() * 0.004 * wickScale);
    const lowExtra = price * (rand() * 0.004 * wickScale);
    const high = Math.max(open, close) + highExtra;
    const low = Math.min(open, close) - lowExtra;
    const volume = 100 + rand() * 2000;

    candles.push({
      time: now - i * interval,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: +volume.toFixed(2),
    });

    price = close;
  }
  return candles;
}

export function generateMockDailyCandles(count = 252, basePrice = 67_000): Candle[] {
  const rand = seededRand(99);
  const candles: Candle[] = [];
  const now = Math.floor(Date.now() / 1000);
  const interval = 86400; // 1 day

  let price = basePrice;
  for (let i = count - 1; i >= 0; i--) {
    const sigma = 0.015;
    const direction = rand() > 0.48 ? 1 : -1;
    const open = price;
    const change = price * sigma * direction * rand();
    const close = price + change;
    const highExtra = price * (rand() * 0.008);
    const lowExtra = price * (rand() * 0.008);
    const high = Math.max(open, close) + highExtra;
    const low = Math.min(open, close) - lowExtra;
    const volume = 1000 + rand() * 20000;

    candles.push({
      time: now - i * interval,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: +volume.toFixed(2),
    });

    price = close;
  }
  return candles;
}

export function generateMockIndicators(price: number): Indicators {
  return {
    rsi: 45 + Math.random() * 30,
    macd: (Math.random() - 0.5) * 200,
    macdSignal: (Math.random() - 0.5) * 150,
    macdHistogram: (Math.random() - 0.5) * 80,
    regimeScore: (Math.random() - 0.4) * 1.6,
    atr: price * 0.012,
    volume24h: 1_200_000_000 + Math.random() * 800_000_000,
  };
}

const SIGNAL_TEMPLATES = [
  { title: "Bullish Divergence", description: "RSI divergence on {tf} with price making lower lows.", direction: "bullish" as const },
  { title: "MACD Golden Cross", description: "MACD line crossed above signal on {tf} timeframe.", direction: "bullish" as const },
  { title: "Bearish Engulfing", description: "Bearish engulfing candle detected at resistance on {tf}.", direction: "bearish" as const },
  { title: "Regime Shift", description: "Trend regime transitioning from bull to bear on {tf}.", direction: "bearish" as const },
  { title: "Consolidation Zone", description: "Price entering low-volatility consolidation on {tf}.", direction: "neutral" as const },
  { title: "Volume Spike", description: "Abnormal volume surge detected — potential breakout on {tf}.", direction: "bullish" as const },
  { title: "RSI Overbought", description: "RSI crossed 70 on {tf}; potential mean reversion incoming.", direction: "bearish" as const },
  { title: "Support Reclaim", description: "Price reclaimed key support level with conviction on {tf}.", direction: "bullish" as const },
];

let signalCounter = 0;

export function generateMockSignal(ticker: string): AlphaSignal {
  const template = SIGNAL_TEMPLATES[Math.floor(Math.random() * SIGNAL_TEMPLATES.length)];
  const timeframes = ["1m", "5m", "15m", "1h", "4h"] as const;
  const tf = timeframes[Math.floor(Math.random() * timeframes.length)];
  const strengths = ["strong", "moderate", "weak"] as const;
  const strength = strengths[Math.floor(Math.random() * strengths.length)];

  return {
    id: `signal-${Date.now()}-${signalCounter++}`,
    timestamp: Date.now(),
    ticker,
    timeframe: tf,
    direction: template.direction,
    strength,
    title: template.title,
    description: template.description.replace("{tf}", tf),
    confidence: Math.floor(50 + Math.random() * 45),
    price: 67_000 + (Math.random() - 0.5) * 2000,
  };
}

interface MockDataCallbacks {
  onCandle?: (candle: Candle) => void;
  onIndicators?: (indicators: Indicators) => void;
  onPrediction?: (prediction: Prediction) => void;
  onSignal?: (signal: AlphaSignal) => void;
}

export function useMockData(ticker: string, callbacks: MockDataCallbacks) {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    // Emit signals every 8–15s
    const signalInterval = setInterval(() => {
      callbacksRef.current.onSignal?.(generateMockSignal(ticker));
    }, 8000 + Math.random() * 7000);

    // Emit candle ticks every 2s
    const candleInterval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const base = 67_000 + (Math.random() - 0.5) * 4000;
      const vol = 0.003 + Math.random() * 0.005;
      const open = base;
      const close = base + (Math.random() - 0.48) * base * vol;
      callbacksRef.current.onCandle?.({
        time: now,
        open: +open.toFixed(2),
        high: +(Math.max(open, close) + base * 0.002).toFixed(2),
        low: +(Math.min(open, close) - base * 0.002).toFixed(2),
        close: +close.toFixed(2),
        volume: +(100 + Math.random() * 500).toFixed(2),
      });
    }, 2000);

    // Emit indicators every 5s
    const indicatorInterval = setInterval(() => {
      callbacksRef.current.onIndicators?.(generateMockIndicators(67_000));
    }, 5000);

    return () => {
      clearInterval(signalInterval);
      clearInterval(candleInterval);
      clearInterval(indicatorInterval);
    };
  }, [ticker]);
}
