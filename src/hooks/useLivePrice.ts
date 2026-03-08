"use client";

import { useEffect, useRef } from "react";
import { useUIStore } from "@/store/useUIStore";
import { toBackendTf } from "@/lib/timeframeConvert";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const POLL_MS = 1000;

/**
 * Polls the latest price every second and fetches the daily bar once
 * per ticker change for open/high/low/volume context.
 *
 * Updates UIStore.setPriceStats — consumed by TopBar.
 */
export function useLivePrice() {
  const demoMode    = useUIStore((s) => s.demoMode);
  const ticker      = useUIStore((s) => s.ticker);
  const setPriceStats = useUIStore((s) => s.setPriceStats);

  // ─── Fetch daily bar (open / H / L / Vol) once per ticker ─────────────────
  useEffect(() => {
    if (demoMode) return; // demo mode — useMockData handles price stats
    const ctrl = new AbortController();
    const tf = toBackendTf("1d");

    fetch(
      `${API_URL}/api/v1/market/ohlcv/${encodeURIComponent(ticker)}?timeframe=${tf}&limit=2`,
      { signal: ctrl.signal }
    )
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.bars?.length) return;
        // Use today's bar (last in list) for context
        const bar = data.bars[data.bars.length - 1];
        setPriceStats({
          priceOpen: bar.open,
          high24h:   bar.high,
          low24h:    bar.low,
          volume24h: bar.volume,
        });
      })
      .catch(() => {});

    return () => ctrl.abort();
  }, [demoMode, ticker, setPriceStats]);

  // ─── Poll latest price every second ───────────────────────────────────────
  useEffect(() => {
    if (demoMode) return;
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function poll() {
      if (!active) return;
      try {
        const res = await fetch(
          `${API_URL}/api/v1/market/price/${encodeURIComponent(ticker)}`
        );
        if (res.ok && active) {
          const data = await res.json();
          if (typeof data.price === "number" && data.price > 0) {
            setPriceStats({ livePrice: data.price });
          }
        }
      } catch {
        // network error — retry next tick
      }
      if (active) {
        timeoutId = setTimeout(poll, POLL_MS);
      }
    }

    poll();
    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [demoMode, ticker, setPriceStats]);
}
