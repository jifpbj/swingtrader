"use client";

import { useEffect, useRef } from "react";
import { useUIStore } from "@/store/useUIStore";
import type { Candle, Timeframe } from "@/types/market";
import { TIMEFRAME_SECONDS } from "@/lib/timeframeConvert";
import { getDemoBasePrice } from "@/lib/demoPriceCache";

interface MockDataCallbacks {
  onCandle?: (candle: Candle) => void;
}

/**
 * Generates a deterministic sequence of mock OHLCV bars using a seeded
 * linear congruential generator and Geometric Brownian Motion price walk.
 *
 * @param barSecs   Bar duration in seconds
 * @param count     Number of bars to generate
 * @param seed      Optional integer seed (default 42)
 * @param basePrice Optional real starting price (overrides the seeded random start)
 */
export function generateMockCandles(barSecs: number, count: number, seed = 42, basePrice?: number): Candle[] {
  let s = seed >>> 0;
  const rand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };

  const now = Math.floor(Date.now() / 1000);
  const start = Math.floor(now / barSecs) * barSecs - barSecs * count;

  // Use real price if provided, otherwise derive from seed
  let price = basePrice ?? (45000 + rand() * 25000);
  const candles: Candle[] = [];

  for (let i = 0; i < count; i++) {
    const t = start + i * barSecs;
    const open = price;

    // Approximate normal via Box-Muller
    const u1 = rand(), u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1 + 1e-9)) * Math.cos(2 * Math.PI * u2);

    const drift = 0.00005;
    const vol = 0.003;
    price = open * Math.exp(drift + vol * z);

    const wickVolUp   = rand() * 0.002;
    const wickVolDown = rand() * 0.002;
    const high   = Math.max(open, price) * (1 + wickVolUp);
    const low    = Math.min(open, price) * (1 - wickVolDown);
    const volume = 30 + rand() * 250;

    candles.push({ time: t, open, high, low, close: price, volume });
  }

  return candles;
}

/**
 * Returns a numeric seed derived from a ticker string so different tickers
 * get different (but deterministic) price histories.
 */
export function tickerSeed(ticker: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < ticker.length; i++) {
    h ^= ticker.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * When demoMode is active, drives the chart and store with synthetic price
 * data: historical bar seed + live ticks every 2 s + periodic indicator /
 * signal / prediction updates.
 *
 * Calls `onCandle` with the accumulating in-progress bar, exactly mirroring
 * the interface `useMarketData` provides so ChartContainer needs no changes
 * beyond calling both hooks.
 */
export function useMockData(callbacks: MockDataCallbacks = {}) {
  const demoMode        = useUIStore((s) => s.demoMode);
  const ticker          = useUIStore((s) => s.ticker);
  const timeframe       = useUIStore((s) => s.timeframe);
  const setPriceStats   = useUIStore((s) => s.setPriceStats);
  const setIndicators   = useUIStore((s) => s.setIndicators);
  const setPrediction   = useUIStore((s) => s.setPrediction);
  const setWsConnected  = useUIStore((s) => s.setWsConnected);
  const addSignal       = useUIStore((s) => s.addSignal);
  const setConfidenceScore = useUIStore((s) => s.setConfidenceScore);

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const priceRef  = useRef<number>(50000);
  const barRef    = useRef<Candle | null>(null);
  const tickerRef = useRef(ticker);
  const tfRef     = useRef<Timeframe>(timeframe);

  useEffect(() => { tickerRef.current = ticker; }, [ticker]);
  useEffect(() => { tfRef.current = timeframe; }, [timeframe]);

  useEffect(() => {
    if (!demoMode) return;

    const barSecs = TIMEFRAME_SECONDS[timeframe] ?? 900;
    const seed    = tickerSeed(ticker);

    let cancelled = false;
    const intervals: ReturnType<typeof setInterval>[] = [];

    // Fetch real price first, then start mock data generation
    getDemoBasePrice(ticker).then((basePrice) => {
      if (cancelled) return;

      // Seed history from real price — same params as ChartContainer
      const history = generateMockCandles(barSecs, 300, seed, basePrice);
      const last    = history[history.length - 1];
      priceRef.current = last.close;
      barRef.current   = null;

      // Populate TopBar stats immediately
      setPriceStats({
        livePrice:  last.close,
        priceOpen:  history[0].open,
        high24h:    Math.max(...history.map((c) => c.high)),
        low24h:     Math.min(...history.map((c) => c.low)),
        volume24h:  history.reduce((a, c) => a + c.volume, 0) * (86400 / barSecs / history.length),
      });

      // Show as "connected" so WS badge is green
      setWsConnected(true);

      // Seed initial indicators
      const p0 = priceRef.current;
      setIndicators({
        rsi:           40 + Math.random() * 25,
        macd:          (Math.random() - 0.48) * p0 * 0.0005,
        macdSignal:    (Math.random() - 0.5)  * p0 * 0.0004,
        macdHistogram: (Math.random() - 0.45) * p0 * 0.0002,
        regimeScore:   (Math.random() - 0.4) * 0.8,
        atr:           p0 * 0.004,
        volume24h:     p0 * (60 + Math.random() * 80),
      });

      // ── Live tick every 2 s ────────────────────────────────────────────────
      intervals.push(setInterval(() => {
        const now    = Math.floor(Date.now() / 1000);
        const barSec = TIMEFRAME_SECONDS[tfRef.current] ?? 900;
        const barT   = Math.floor(now / barSec) * barSec;

        const prev     = priceRef.current;
        const u1 = Math.random(), u2 = Math.random();
        const z  = Math.sqrt(-2 * Math.log(u1 + 1e-9)) * Math.cos(2 * Math.PI * u2);
        const newPrice = prev * Math.exp(0.00003 + 0.002 * z);
        priceRef.current = newPrice;

        const cur = barRef.current;
        const bar: Candle = (!cur || cur.time !== barT)
          ? { time: barT, open: prev, high: Math.max(prev, newPrice), low: Math.min(prev, newPrice), close: newPrice, volume: 5 + Math.random() * 15 }
          : { ...cur, high: Math.max(cur.high, newPrice), low: Math.min(cur.low, newPrice), close: newPrice, volume: cur.volume + 3 + Math.random() * 8 };
        barRef.current = bar;

        callbacksRef.current.onCandle?.(bar);
        setPriceStats({ livePrice: newPrice });
      }, 2000));

      // ── Indicators every 12 s ─────────────────────────────────────────────
      intervals.push(setInterval(() => {
        const p = priceRef.current;
        setIndicators({
          rsi:           25 + Math.random() * 55,
          macd:          (Math.random() - 0.48) * p * 0.0006,
          macdSignal:    (Math.random() - 0.5)  * p * 0.0005,
          macdHistogram: (Math.random() - 0.45) * p * 0.00025,
          regimeScore:   (Math.random() - 0.4) * 0.9,
          atr:           p * (0.003 + Math.random() * 0.003),
          volume24h:     p * (50 + Math.random() * 120),
        });
      }, 12000));

      // ── Prediction every 20 s ─────────────────────────────────────────────
      intervals.push(setInterval(() => {
        const p    = priceRef.current;
        const conf = Math.round(50 + Math.random() * 40);
        const pUp  = 0.4 + Math.random() * 0.25;
        setConfidenceScore(conf);
        setPrediction({
          ticker,
          timeframe,
          confidence:      conf,
          direction:       pUp > 0.5 ? "bullish" : "bearish",
          targetPrice:     p * (1 + (Math.random() - 0.45) * 0.02),
          targetTime:      Math.floor(Date.now() / 1000) + barSecs * 5,
          probabilityUp:   pUp,
          probabilityDown: 1 - pUp,
          bands: [],
        });
      }, 20000));

      // ── Signal every 35 s ─────────────────────────────────────────────────
      const SIGNAL_TITLES = [
        ["EMA Bullish Crossover", "Price crossed above the 20-EMA — momentum is building."],
        ["BB Squeeze Breakout",   "Bollinger Band squeeze resolved to the upside."],
        ["RSI Recovery",          "RSI bounced from oversold territory, reversal likely."],
        ["MACD Bull Cross",       "MACD line crossed signal — bullish momentum confirmed."],
      ] as const;
      const BEAR_TITLES = [
        ["EMA Bearish Crossover", "Price crossed below the 20-EMA — downside risk elevated."],
        ["RSI Overbought",        "RSI above 70 — consider taking partial profits."],
        ["BB Upper Rejection",    "Price rejected at the upper Bollinger Band."],
        ["MACD Bear Cross",       "MACD line crossed below signal — weakness confirmed."],
      ] as const;

      intervals.push(setInterval(() => {
        const isBull = Math.random() > 0.45;
        const pool   = isBull ? SIGNAL_TITLES : BEAR_TITLES;
        const pick   = pool[Math.floor(Math.random() * pool.length)];
        addSignal({
          id:          `demo-${Date.now()}`,
          timestamp:   Date.now() / 1000,
          ticker:      tickerRef.current,
          timeframe:   tfRef.current,
          direction:   isBull ? "bullish" : "bearish",
          strength:    Math.random() > 0.5 ? "strong" : "moderate",
          title:       pick[0],
          description: pick[1],
          confidence:  Math.round(55 + Math.random() * 35),
          price:       priceRef.current,
        });
      }, 35000));
    }); // end getDemoBasePrice.then()

    return () => {
      cancelled = true;
      intervals.forEach(clearInterval);
      setWsConnected(false);
    };
  }, [demoMode, ticker, timeframe, setPriceStats, setIndicators, setWsConnected, addSignal, setConfidenceScore, setPrediction]);
}
