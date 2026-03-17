"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAlpacaStore } from "@/store/useAlpacaStore";
import { SCREENER_UNIVERSE, UNIVERSE_MAP } from "@/lib/screenerUniverse";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScreenerStock {
  symbol: string;
  name: string;
  sector?: string;
  price: number;
  changePercent: number;   // daily % change vs prev close
  changeDollar: number;
  volume: number;          // daily volume (shares)
  dollarVolume: number;    // price × volume
  high: number;            // today's high
  low: number;             // today's low
  prevClose: number;
  volatility: number;      // (high - low) / prevClose * 100
  prevHigh?: number;       // yesterday's high (for new-high detection)
  prevLow?: number;        // yesterday's low  (for new-low  detection)
}

export type ScreenerCategory =
  | "gainers"
  | "losers"
  | "volume"
  | "volatility"
  | "liquidity"
  | "trending_up"
  | "trending_down"
  | "new_high"
  | "new_low";

export interface ScreenerData {
  all: ScreenerStock[];
  gainers: ScreenerStock[];
  losers: ScreenerStock[];
  volume: ScreenerStock[];
  volatility: ScreenerStock[];
  liquidity: ScreenerStock[];
  trending_up: ScreenerStock[];
  trending_down: ScreenerStock[];
  new_high: ScreenerStock[];
  new_low: ScreenerStock[];
}

// ─── Alpaca snapshot types ────────────────────────────────────────────────────

interface AlpacaBar {
  o: number; h: number; l: number; c: number; v: number;
}
interface AlpacaSnapshot {
  latestTrade?: { p: number };
  dailyBar?: AlpacaBar;
  prevDailyBar?: AlpacaBar;
}

// ─── Fetch from Alpaca Data API ───────────────────────────────────────────────

const ALPACA_DATA = "https://data.alpaca.markets";

async function fetchAlpacaSnapshots(
  symbols: string[],
  apiKey: string,
  secretKey: string,
): Promise<Record<string, AlpacaSnapshot>> {
  const params = new URLSearchParams({ symbols: symbols.join(","), feed: "iex" });
  const resp = await fetch(`${ALPACA_DATA}/v2/stocks/snapshots?${params}`, {
    headers: {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": secretKey,
    },
  });
  if (!resp.ok) throw new Error(`Alpaca data API ${resp.status}`);
  return resp.json() as Promise<Record<string, AlpacaSnapshot>>;
}

// ─── Mock data generator ──────────────────────────────────────────────────────

/** Seeded pseudo-random (stable within one minute-bucket so data looks live) */
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateMockStocks(): ScreenerStock[] {
  const bucket = Math.floor(Date.now() / 60_000); // changes each minute
  return SCREENER_UNIVERSE.map(({ symbol, name, sector }, i) => {
    const rng = seededRng(bucket * 997 + i * 31);
    const basePrice = 20 + rng() * 480;
    const changePercent = (rng() - 0.46) * 14; // slight positive bias
    const prevClose = basePrice / (1 + changePercent / 100);
    const price = basePrice;
    const range = prevClose * (0.008 + rng() * 0.045);
    const high = price + range * rng();
    const low = price - range * rng();
    const volume = Math.floor(500_000 + rng() * 80_000_000);
    const prevHigh = prevClose + prevClose * (0.005 + rng() * 0.02);
    const prevLow  = prevClose - prevClose * (0.005 + rng() * 0.02);
    return {
      symbol,
      name,
      sector,
      price,
      changePercent,
      changeDollar: price - prevClose,
      volume,
      dollarVolume: price * volume,
      high,
      low,
      prevClose,
      volatility: (high - low) / prevClose * 100,
      prevHigh,
      prevLow,
    };
  });
}

// ─── Transform Alpaca snapshots → ScreenerStock[] ────────────────────────────

function transformSnapshots(
  snapshots: Record<string, AlpacaSnapshot>,
): ScreenerStock[] {
  return Object.entries(snapshots).flatMap(([symbol, snap]) => {
    const day  = snap.dailyBar;
    const prev = snap.prevDailyBar;
    if (!day || !prev || prev.c === 0) return [];
    const price = snap.latestTrade?.p ?? day.c;
    const changePercent = (day.c - prev.c) / prev.c * 100;
    const meta = UNIVERSE_MAP[symbol];
    return [{
      symbol,
      name: meta?.name ?? symbol,
      sector: meta?.sector,
      price,
      changePercent,
      changeDollar: day.c - prev.c,
      volume: day.v,
      dollarVolume: price * day.v,
      high: day.h,
      low: day.l,
      prevClose: prev.c,
      volatility: (day.h - day.l) / prev.c * 100,
      prevHigh: prev.h,
      prevLow: prev.l,
    }];
  });
}

// ─── Categorize ───────────────────────────────────────────────────────────────

const TOP_N = 15;

function categorize(stocks: ScreenerStock[]): ScreenerData {
  const sorted = (arr: ScreenerStock[], by: (s: ScreenerStock) => number, desc = true) =>
    [...arr].sort((a, b) => desc ? by(b) - by(a) : by(a) - by(b));

  return {
    all:           stocks,
    gainers:       sorted(stocks, (s) => s.changePercent).filter((s) => s.changePercent > 0).slice(0, TOP_N),
    losers:        sorted(stocks, (s) => s.changePercent, false).filter((s) => s.changePercent < 0).slice(0, TOP_N),
    volume:        sorted(stocks, (s) => s.volume).slice(0, TOP_N),
    volatility:    sorted(stocks, (s) => s.volatility).slice(0, TOP_N),
    liquidity:     sorted(stocks, (s) => s.dollarVolume).slice(0, TOP_N),
    trending_up:   sorted(stocks, (s) => s.changePercent).filter((s) => s.changePercent >= 1.5),
    trending_down: sorted(stocks, (s) => s.changePercent, false).filter((s) => s.changePercent <= -1.5),
    new_high:      sorted(stocks, (s) => s.changePercent)
                     .filter((s) => s.prevHigh !== undefined && s.high > s.prevHigh),
    new_low:       sorted(stocks, (s) => s.changePercent, false)
                     .filter((s) => s.prevLow !== undefined && s.low < s.prevLow),
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 60_000; // refresh every minute

export function useScreenerData() {
  const apiKey    = useAlpacaStore((s) => s.apiKey);
  const secretKey = useAlpacaStore((s) => s.secretKey);

  const [data, setData]       = useState<ScreenerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [isMock, setIsMock]   = useState(false);
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

  const symbols = SCREENER_UNIVERSE.map((s) => s.symbol);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (apiKey && secretKey) {
        const snaps = await fetchAlpacaSnapshots(symbols, apiKey, secretKey);
        const stocks = transformSnapshots(snaps);
        if (stocks.length === 0) throw new Error("No data returned");
        setData(categorize(stocks));
        setIsMock(false);
      } else {
        throw new Error("no-credentials");
      }
    } catch {
      // Fall back to mock data — works without credentials / backend
      setData(categorize(generateMockStocks()));
      setIsMock(true);
      setError(null); // mock is always successful from the user's perspective
    } finally {
      setLoading(false);
    }
  }, [apiKey, secretKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load + auto-refresh
  useEffect(() => {
    void load();
    timerRef.current = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  return { data, loading, error, isMock, refresh: load };
}
