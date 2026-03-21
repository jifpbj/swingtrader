"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import type { IndicatorTab } from "@/store/useUIStore";
import { useMarketData } from "@/hooks/useMarketData";
import {
  useMockData,
  generateMockCandles,
  tickerSeed,
} from "@/hooks/useMockData";
import { getDemoBasePrice } from "@/lib/demoPriceCache";
import {
  computeEMA,
  detectCrossovers,
  computeBollingerBands,
  detectBollingerCrossovers,
  computeRSI,
  detectRSICrossovers,
  computeMACDValues,
  detectMACDCrossovers,
  computeTDSequentialSetup,
} from "@/lib/indicators";
import type { Candle, CrossoverSignal } from "@/types/market";
import type { TradeRecord } from "@/types/trade";
import type { OpenEntry } from "@/types/strategy";
import { useTradeStore } from "@/store/useTradeStore";
import { Maximize2, RefreshCw, Bot, MoonStar } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { toBackendTf, TIMEFRAME_SECONDS } from "@/lib/timeframeConvert";
import type { Timeframe } from "@/types/market";
import { useStrategyStore } from "@/store/useStrategyStore";

import type {
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  Time,
  ISeriesMarkersPluginApi,
  SeriesMarker,
  IPriceLine,
} from "lightweight-charts";

interface CandleTooltip {
  x: number;
  y: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

interface TradePriceLevel {
  type: "buy" | "sell";
  price: number;
  /** Pixel Y relative to the outer container (null = price off-screen) */
  y: number | null;
  pnlDollars?: number;
  pnlPercent?: number;
}

const CHART_COLORS = {
  background: "transparent",
  text: "#71717a",
  grid: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.06)",
  crosshair: "rgba(255,255,255,0.2)",
  bull: "#22c55e",
  bear: "#ef4444",
};

/**
 * How many bars to fetch from the API per request.
 * Capped at the backend maximum of 1 000.
 */
const FETCH_LIMIT: Record<string, number> = {
  "1m": 500,
  "5m": 500,
  "15m": 600,
  "1h": 720,
  "4h": 720,
  "1d": 1000,
};

/**
 * How many bars to show in the initial viewport after loading.
 */
const INITIAL_VISIBLE_BARS: Record<string, number> = {
  "1m": 60,
  "5m": 72,
  "15m": 80,
  "1h": 90,
  "4h": 90,
  "1d": 180,
};

/**
 * Normalise raw OHLCV bars before seeding the chart.
 *
 * 1. Floor every timestamp to its bar boundary.
 * 2. Enforce OHLC integrity: high ≥ max(open, close), low ≤ min(open, close).
 * 3. Deduplicate — keep the last occurrence when two bars share a timestamp.
 * 4. Sort ascending — lightweight-charts requires monotonically increasing time.
 */
function normalizeHistoricalBars(raw: Candle[], barSecs: number): Candle[] {
  const map = new Map<number, Candle>();
  for (const c of raw) {
    const t = Math.floor(c.time / barSecs) * barSecs;
    map.set(t, {
      time: t,
      open: c.open,
      high: Math.max(c.high, c.open, c.close),
      low: Math.min(c.low, c.open, c.close),
      close: c.close,
      volume: c.volume,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

// ─── Backend proxy fetch ──────────────────────────────────────────────────────

/**
 * Fetch OHLCV bars from the FastAPI backend, which authenticates with the
 * Alpaca Broker API server-side.  Free users (no Alpaca account) get data
 * through the platform's own broker credentials — no client-side API keys
 * ever leave the browser.
 *
 * The `end` parameter restricts the response to bars whose timestamp is at
 * or before that moment — used when fetching older history on scroll-left.
 */
async function fetchBars(
  ticker: string,
  timeframe: Timeframe,
  limit: number,
  end?: string,
): Promise<Candle[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const qs =
    `?timeframe=${toBackendTf(timeframe)}&limit=${limit}` +
    (end ? `&end=${encodeURIComponent(end)}` : "");
  try {
    const resp = await fetch(
      `${apiUrl}/api/v1/market/ohlcv/${encodeURIComponent(ticker)}${qs}`,
    );
    if (resp.ok) {
      const json = (await resp.json()) as { bars: Candle[] };
      return json.bars ?? [];
    }
  } catch {
    /* backend unreachable */
  }
  return [];
}

// ─── Chart marker helpers ─────────────────────────────────────────────────────

function buildMarkers(crossovers: CrossoverSignal[]): SeriesMarker<Time>[] {
  return crossovers.map((c) => ({
    time: c.time as UTCTimestamp,
    position: c.direction === "entry" ? "belowBar" : "aboveBar",
    color: c.direction === "entry" ? "#22c55e" : "#ef4444",
    shape: c.direction === "entry" ? "arrowUp" : "arrowDown",
    text: c.direction === "entry" ? "BUY" : "SELL",
    size: 1,
  }));
}

function buildTD9Markers(candles: Candle[]): SeriesMarker<Time>[] {
  const points = computeTDSequentialSetup(candles, 4, 9);
  const markers: SeriesMarker<Time>[] = [];

  for (let i = 0; i < candles.length; i++) {
    const p = points[i];
    if (!p) continue;

    if (p.buySetup !== null) {
      if (p.buySetup >= 6 && p.buySetup <= 8) {
        markers.push({
          time: candles[i].time as UTCTimestamp,
          position: "belowBar",
          color: "#22c55e",
          shape: "circle",
          text: String(p.buySetup),
          size: 1,
        });
      } else if (p.buySetup === 9) {
        markers.push({
          time: candles[i].time as UTCTimestamp,
          position: "belowBar",
          color: "#22c55e",
          shape: "arrowUp",
          text: "BUY 9",
          size: 1,
        });
      }
    }

    if (p.sellSetup !== null) {
      if (p.sellSetup >= 6 && p.sellSetup <= 8) {
        markers.push({
          time: candles[i].time as UTCTimestamp,
          position: "aboveBar",
          color: "#ef4444",
          shape: "circle",
          text: String(p.sellSetup),
          size: 1,
        });
      } else if (p.sellSetup === 9) {
        markers.push({
          time: candles[i].time as UTCTimestamp,
          position: "aboveBar",
          color: "#ef4444",
          shape: "arrowDown",
          text: "SELL 9",
          size: 1,
        });
      }
    }
  }

  return markers;
}

// ─── Trade marker helpers ─────────────────────────────────────────────────────

function buildTradeMarkers(
  trades: TradeRecord[],
  openEntry: OpenEntry | null,
): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = [];
  for (const t of trades) {
    markers.push({
      time: t.entryTime as UTCTimestamp,
      position: "belowBar",
      color: "#22c55e",
      shape: "arrowUp",
      text: "B",
      size: 2,
    });
    const pct = (t.pnlPercent * 100).toFixed(1);
    markers.push({
      time: t.exitTime as UTCTimestamp,
      position: "aboveBar",
      color: "#ef4444",
      shape: "arrowDown",
      text: `S ${t.pnlPercent >= 0 ? "+" : ""}${pct}%`,
      size: 2,
    });
  }
  if (openEntry) {
    markers.push({
      time: openEntry.time as UTCTimestamp,
      position: "belowBar",
      color: "#22c55e",
      shape: "arrowUp",
      text: "B",
      size: 2,
    });
  }
  return markers;
}

function mergeMarkers(
  ...groups: SeriesMarker<Time>[][]
): SeriesMarker<Time>[] {
  return groups
    .flat()
    .sort((a, b) => (a.time as number) - (b.time as number));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChartContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markerPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMiddleRef = useRef<ISeriesApi<"Line"> | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiObLineRef = useRef<IPriceLine | null>(null);
  const rsiOsLineRef = useRef<IPriceLine | null>(null);
  const macdLineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const tradeMarkersRef = useRef<SeriesMarker<Time>[]>([]);
  const activePriceLineRef = useRef<IPriceLine | null>(null);
  const refreshPriceLevelsRef = useRef<(() => void) | null>(null);

  const [chartReady, setChartReady] = useState(false);
  const [tooltip, setTooltip] = useState<CandleTooltip | null>(null);
  const [indicatorRevision, setIndicatorRevision] = useState(0);
  const [afterHours, setAfterHours] = useState(false);
  const [tradePriceLevels, setTradePriceLevels] = useState<TradePriceLevel[]>([]);
  const volumeMapRef = useRef<Map<number, number>>(new Map());
  const oldestBarTimeRef = useRef<number | null>(null);
  const loadingMoreRef = useRef(false);
  const tickerRef = useRef("");
  const loadMoreRef = useRef<(() => void) | null>(null);
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when loadMore returned 0 new bars for the current oldest timestamp,
  // so we don't keep hammering the server on every scroll event.
  const noMoreHistoryRef = useRef(false);

  const ticker = useUIStore((s) => s.ticker);
  const timeframe = useUIStore((s) => s.timeframe);
  const demoMode = useUIStore((s) => s.demoMode);
  const livePrice = useUIStore((s) => s.livePrice);

  // Active algo strategy for overlay badge
  const activeStrategyId = useStrategyStore((s) => s.activeStrategyId);
  const strategies = useStrategyStore((s) => s.strategies);
  const activeStrategy =
    strategies.find((s) => s.id === activeStrategyId) ?? null;
  const allTrades = useTradeStore((s) => s.trades);

  const priceOpen = useUIStore((s) => s.priceOpen);
  const activeIndicatorTab = useUIStore((s) => s.activeIndicatorTab);
  const showSignalMarkers = useUIStore((s) => s.showSignalMarkers);
  const emaPeriod = useUIStore((s) => s.emaPeriod);
  const bbPeriod = useUIStore((s) => s.bbPeriod);
  const bbStdDev = useUIStore((s) => s.bbStdDev);
  const rsiPeriod = useUIStore((s) => s.rsiPeriod);
  const rsiOverbought = useUIStore((s) => s.rsiOverbought);
  const rsiOversold = useUIStore((s) => s.rsiOversold);
  const macdFastPeriod = useUIStore((s) => s.macdFastPeriod);
  const macdSlowPeriod = useUIStore((s) => s.macdSlowPeriod);
  const macdSignalPeriod = useUIStore((s) => s.macdSignalPeriod);

  // Refs mirror store so async callbacks see current values without chart-init deps
  const activeTabRef = useRef(activeIndicatorTab);
  const emaPeriodRef = useRef(emaPeriod);
  const bbPeriodRef = useRef(bbPeriod);
  const bbStdDevRef = useRef(bbStdDev);
  const showMarkersRef = useRef(showSignalMarkers);
  const timeframeRef = useRef(timeframe);
  const rsiPeriodRef = useRef(rsiPeriod);
  const rsiOverboughtRef = useRef(rsiOverbought);
  const rsiOversoldRef = useRef(rsiOversold);
  const macdFastRef = useRef(macdFastPeriod);
  const macdSlowRef = useRef(macdSlowPeriod);
  const macdSignalRef = useRef(macdSignalPeriod);

  useEffect(() => {
    activeTabRef.current = activeIndicatorTab;
  }, [activeIndicatorTab]);
  useEffect(() => {
    emaPeriodRef.current = emaPeriod;
  }, [emaPeriod]);
  useEffect(() => {
    bbPeriodRef.current = bbPeriod;
  }, [bbPeriod]);
  useEffect(() => {
    bbStdDevRef.current = bbStdDev;
  }, [bbStdDev]);
  useEffect(() => {
    showMarkersRef.current = showSignalMarkers;
  }, [showSignalMarkers]);
  useEffect(() => {
    timeframeRef.current = timeframe;
  }, [timeframe]);
  useEffect(() => {
    rsiPeriodRef.current = rsiPeriod;
  }, [rsiPeriod]);
  useEffect(() => {
    rsiOverboughtRef.current = rsiOverbought;
  }, [rsiOverbought]);
  useEffect(() => {
    rsiOversoldRef.current = rsiOversold;
  }, [rsiOversold]);
  useEffect(() => {
    macdFastRef.current = macdFastPeriod;
  }, [macdFastPeriod]);
  useEffect(() => {
    macdSlowRef.current = macdSlowPeriod;
  }, [macdSlowPeriod]);
  useEffect(() => {
    macdSignalRef.current = macdSignalPeriod;
  }, [macdSignalPeriod]);
  useEffect(() => {
    tickerRef.current = ticker;
  }, [ticker]);

  // ─── Initialize chart ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let mounted = true;

    // Reset history-exhausted flag on ticker/timeframe change
    noMoreHistoryRef.current = false;

    import("lightweight-charts").then(async (lc) => {
      if (!mounted || !containerRef.current) return;

      const chart = lc.createChart(containerRef.current, {
        layout: {
          background: { color: CHART_COLORS.background },
          textColor: CHART_COLORS.text,
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: CHART_COLORS.grid },
          horzLines: { color: CHART_COLORS.grid },
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: {
            color: CHART_COLORS.crosshair,
            width: 1,
            style: lc.LineStyle.Dashed,
          },
          horzLine: {
            color: CHART_COLORS.crosshair,
            width: 1,
            style: lc.LineStyle.Dashed,
          },
        },
        rightPriceScale: {
          borderColor: CHART_COLORS.border,
          scaleMargins: { top: 0.12, bottom: 0.08 },
        },
        timeScale: {
          borderColor: CHART_COLORS.border,
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 8,
          minBarSpacing: 4,
        },
        handleScroll: true,
        handleScale: true,
      });
      chartRef.current = chart;

      // Candlestick — hollow body for bullish (close > open), filled for bearish
      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: "rgba(0,0,0,0)",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#dc2626",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });
      candleSeriesRef.current = candleSeries;

      // EMA — amber
      const emaSeries = chart.addSeries(lc.LineSeries, {
        color: "#f59e0b",
        lineWidth: 1,
        lineStyle: lc.LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      emaSeriesRef.current = emaSeries;

      // BB — sky blue
      const bbUpper = chart.addSeries(lc.LineSeries, {
        color: "rgba(56,189,248,0.7)",
        lineWidth: 1,
        lineStyle: lc.LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      bbUpperRef.current = bbUpper;
      const bbLower = chart.addSeries(lc.LineSeries, {
        color: "rgba(56,189,248,0.7)",
        lineWidth: 1,
        lineStyle: lc.LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      bbLowerRef.current = bbLower;
      const bbMiddle = chart.addSeries(lc.LineSeries, {
        color: "rgba(56,189,248,0.3)",
        lineWidth: 1,
        lineStyle: lc.LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      bbMiddleRef.current = bbMiddle;

      // Sub-pane 1 — MACD
      const macdLineSeries = chart.addSeries(
        lc.LineSeries,
        {
          color: "#60a5fa",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        1,
      );
      macdLineSeriesRef.current = macdLineSeries;
      const macdSignalSeries = chart.addSeries(
        lc.LineSeries,
        {
          color: "#f87171",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        1,
      );
      macdSignalSeriesRef.current = macdSignalSeries;
      const macdHistSeries = chart.addSeries(
        lc.HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        1,
      );
      macdHistSeriesRef.current = macdHistSeries;
      chart.panes()[1]?.setHeight(30);

      // Sub-pane 2 — RSI
      const rsiSeries = chart.addSeries(
        lc.LineSeries,
        {
          color: "#a78bfa",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        2,
      );
      rsiSeriesRef.current = rsiSeries;
      rsiObLineRef.current = rsiSeries.createPriceLine({
        price: 70,
        color: "rgba(167,139,250,0.5)",
        lineWidth: 1,
        lineStyle: lc.LineStyle.Dashed,
        axisLabelVisible: true,
        lineVisible: true,
        title: "OB",
      });
      rsiOsLineRef.current = rsiSeries.createPriceLine({
        price: 30,
        color: "rgba(167,139,250,0.5)",
        lineWidth: 1,
        lineStyle: lc.LineStyle.Dashed,
        axisLabelVisible: true,
        lineVisible: true,
        title: "OS",
      });
      chart.panes()[2]?.setHeight(30);

      // ── Seed historical data ──────────────────────────────────────────────
      const barSecs = TIMEFRAME_SECONDS[timeframe] ?? 900;
      const fetchLimit = FETCH_LIMIT[timeframe] ?? 500;
      let rawCandles: Candle[] = [];
      if (demoMode) {
        const basePrice = await getDemoBasePrice(ticker);
        rawCandles = generateMockCandles(
          barSecs,
          300,
          tickerSeed(ticker),
          basePrice,
        );
      } else {
        rawCandles = await fetchBars(ticker, timeframe, fetchLimit);
      }

      const initialCandles = normalizeHistoricalBars(rawCandles, barSecs);

      candlesRef.current = initialCandles;
      oldestBarTimeRef.current = initialCandles[0]?.time ?? null;
      const volMap = new Map<number, number>();
      for (const c of initialCandles) volMap.set(c.time, c.volume);
      volumeMapRef.current = volMap;

      candleSeries.setData(
        initialCandles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );

      markerPluginRef.current = lc.createSeriesMarkers(candleSeries, []);

      chart.subscribeCrosshairMove((param) => {
        if (
          !param.point ||
          !param.time ||
          param.point.x < 0 ||
          param.point.y < 0
        ) {
          setTooltip(null);
          return;
        }
        const bar = param.seriesData.get(candleSeries) as
          | { open: number; high: number; low: number; close: number }
          | undefined;
        if (!bar) {
          setTooltip(null);
          return;
        }
        const time = param.time as number;
        setTooltip({
          x: param.point.x,
          y: param.point.y,
          ...bar,
          volume: volumeMapRef.current.get(time) ?? 0,
          time,
        });
      });

      // Set initial viewport
      const visibleBars = INITIAL_VISIBLE_BARS[timeframe] ?? 80;
      const barCount = initialCandles.length;
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, barCount - visibleBars),
        to: barCount + 3,
      });

      // Load more when user scrolls or zooms near the left edge (debounced)
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range && range.from <= 20) {
          // Debounce — collapse rapid scroll events into one fetch
          if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
          loadMoreTimerRef.current = setTimeout(
            () => loadMoreRef.current?.(),
            300,
          );
        }
        // Refresh trade price-level Y coordinates on any visible range change
        refreshPriceLevelsRef.current?.();
      });

      setChartReady(true);
    });

    const ro = new ResizeObserver(() => {
      if (chartRef.current && containerRef.current)
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      mounted = false;
      ro.disconnect();
      chartRef.current?.remove();
      if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
      chartRef.current =
        candleSeriesRef.current =
        emaSeriesRef.current =
        markerPluginRef.current =
        bbUpperRef.current =
        bbLowerRef.current =
        bbMiddleRef.current =
        rsiSeriesRef.current =
        rsiObLineRef.current =
        rsiOsLineRef.current =
        macdLineSeriesRef.current =
        macdSignalSeriesRef.current =
        macdHistSeriesRef.current =
          null;
      setChartReady(false);
    };
  }, [ticker, timeframe, demoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Unified indicator update effect ──────────────────────────────────────
  useEffect(() => {
    if (!chartReady) return;
    const candles = candlesRef.current;
    if (!candles.length) return;

    const closes = candles.map((c) => c.close);

    // Clear everything first
    emaSeriesRef.current?.setData([]);
    bbUpperRef.current?.setData([]);
    bbLowerRef.current?.setData([]);
    bbMiddleRef.current?.setData([]);
    rsiSeriesRef.current?.setData([]);
    macdLineSeriesRef.current?.setData([]);
    macdSignalSeriesRef.current?.setData([]);
    macdHistSeriesRef.current?.setData([]);
    // Reset to trade-only markers (cleared of indicator markers)
    markerPluginRef.current?.setMarkers(tradeMarkersRef.current.slice());

    if (activeIndicatorTab !== "MACD")
      chartRef.current?.panes()[1]?.setHeight(30);
    if (activeIndicatorTab !== "RSI")
      chartRef.current?.panes()[2]?.setHeight(30);

    switch (activeIndicatorTab) {
      case "EMA": {
        const emas = computeEMA(closes, emaPeriod);
        emaSeriesRef.current?.setData(
          candles.flatMap((c, i) =>
            emas[i] !== null
              ? [{ time: c.time as UTCTimestamp, value: emas[i]! }]
              : [],
          ),
        );
        if (showSignalMarkers)
          markerPluginRef.current?.setMarkers(
            mergeMarkers(
              buildMarkers(detectCrossovers(candles, emas)),
              tradeMarkersRef.current,
            ),
          );
        break;
      }
      case "BB": {
        const bbs = computeBollingerBands(candles, bbPeriod, bbStdDev);
        bbUpperRef.current?.setData(
          bbs.map((b) => ({ time: b.time as UTCTimestamp, value: b.upper })),
        );
        bbLowerRef.current?.setData(
          bbs.map((b) => ({ time: b.time as UTCTimestamp, value: b.lower })),
        );
        bbMiddleRef.current?.setData(
          bbs.map((b) => ({ time: b.time as UTCTimestamp, value: b.middle })),
        );
        if (showSignalMarkers)
          markerPluginRef.current?.setMarkers(
            mergeMarkers(
              buildMarkers(
                detectBollingerCrossovers(candles, bbPeriod, bbStdDev),
              ),
              tradeMarkersRef.current,
            ),
          );
        break;
      }
      case "RSI": {
        const rsi = computeRSI(closes, rsiPeriod);
        rsiSeriesRef.current?.setData(
          candles.flatMap((c, i) =>
            rsi[i] !== null
              ? [{ time: c.time as UTCTimestamp, value: rsi[i]! }]
              : [],
          ),
        );
        rsiObLineRef.current?.applyOptions({ price: rsiOverbought });
        rsiOsLineRef.current?.applyOptions({ price: rsiOversold });
        if (showSignalMarkers)
          markerPluginRef.current?.setMarkers(
            mergeMarkers(
              buildMarkers(
                detectRSICrossovers(candles, rsi, rsiOverbought, rsiOversold),
              ),
              tradeMarkersRef.current,
            ),
          );
        chartRef.current?.panes()[2]?.setHeight(110);
        break;
      }
      case "MACD": {
        const macd = computeMACDValues(
          closes,
          macdFastPeriod,
          macdSlowPeriod,
          macdSignalPeriod,
        );
        macdLineSeriesRef.current?.setData(
          candles.flatMap((c, i) =>
            macd[i].macd !== null
              ? [{ time: c.time as UTCTimestamp, value: macd[i].macd! }]
              : [],
          ),
        );
        macdSignalSeriesRef.current?.setData(
          candles.flatMap((c, i) =>
            macd[i].signal !== null
              ? [{ time: c.time as UTCTimestamp, value: macd[i].signal! }]
              : [],
          ),
        );
        macdHistSeriesRef.current?.setData(
          candles.flatMap((c, i) => {
            const { macd: m, signal: s } = macd[i];
            if (m === null || s === null) return [];
            const hist = m - s;
            return [
              {
                time: c.time as UTCTimestamp,
                value: hist,
                color:
                  hist >= 0 ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)",
              },
            ];
          }),
        );
        if (showSignalMarkers)
          markerPluginRef.current?.setMarkers(
            mergeMarkers(
              buildMarkers(detectMACDCrossovers(candles, macd)),
              tradeMarkersRef.current,
            ),
          );
        chartRef.current?.panes()[1]?.setHeight(130);
        break;
      }
      case "TD9": {
        if (showSignalMarkers) {
          markerPluginRef.current?.setMarkers(
            mergeMarkers(buildTD9Markers(candles), tradeMarkersRef.current),
          );
        }
        break;
      }
    }
  }, [
    chartReady,
    activeIndicatorTab,
    showSignalMarkers,
    emaPeriod,
    bbPeriod,
    bbStdDev,
    rsiPeriod,
    rsiOverbought,
    rsiOversold,
    macdFastPeriod,
    macdSlowPeriod,
    macdSignalPeriod,
    indicatorRevision,
  ]);

  // ─── Live candle ticks ─────────────────────────────────────────────────────
  const handleCandle = useCallback((rawCandle: Candle) => {
    if (!candleSeriesRef.current) return;

    const barSecs = TIMEFRAME_SECONDS[timeframeRef.current] ?? 900;
    const t = Math.floor(rawCandle.time / barSecs) * barSecs;

    const arr = candlesRef.current;
    const last = arr[arr.length - 1];
    const isNewBar = !last || last.time !== t;

    const bar: Candle = isNewBar
      ? { ...rawCandle, time: t }
      : {
          time: t,
          open: last.open,
          high: Math.max(last.high, rawCandle.high),
          low: Math.min(last.low, rawCandle.low),
          close: rawCandle.close,
          volume: rawCandle.volume,
        };

    candleSeriesRef.current.update({
      time: bar.time as UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    });
    volumeMapRef.current.set(bar.time, bar.volume);

    if (!isNewBar) arr[arr.length - 1] = bar;
    else arr.push(bar);

    // Incremental indicator updates
    const ts = bar.time as UTCTimestamp;

    if (activeTabRef.current === "EMA" && emaSeriesRef.current) {
      const emas = computeEMA(
        arr.map((c) => c.close),
        emaPeriodRef.current,
      );
      const lastEma = emas[emas.length - 1];
      if (lastEma !== null)
        emaSeriesRef.current.update({ time: ts, value: lastEma });
      if (isNewBar && showMarkersRef.current && markerPluginRef.current)
        markerPluginRef.current.setMarkers(
          mergeMarkers(
            buildMarkers(detectCrossovers(arr, emas)),
            tradeMarkersRef.current,
          ),
        );
    }

    if (
      activeTabRef.current === "BB" &&
      bbUpperRef.current &&
      bbLowerRef.current &&
      bbMiddleRef.current
    ) {
      const bbs = computeBollingerBands(
        arr,
        bbPeriodRef.current,
        bbStdDevRef.current,
      );
      if (bbs.length) {
        const b = bbs[bbs.length - 1];
        bbUpperRef.current.update({ time: ts, value: b.upper });
        bbLowerRef.current.update({ time: ts, value: b.lower });
        bbMiddleRef.current.update({ time: ts, value: b.middle });
      }
      if (isNewBar && showMarkersRef.current && markerPluginRef.current)
        markerPluginRef.current.setMarkers(
          mergeMarkers(
            buildMarkers(
              detectBollingerCrossovers(
                arr,
                bbPeriodRef.current,
                bbStdDevRef.current,
              ),
            ),
            tradeMarkersRef.current,
          ),
        );
    }

    if (activeTabRef.current === "RSI" && rsiSeriesRef.current) {
      const rsi = computeRSI(
        arr.map((c) => c.close),
        rsiPeriodRef.current,
      );
      const lastRsi = rsi[rsi.length - 1];
      if (lastRsi !== null)
        rsiSeriesRef.current.update({ time: ts, value: lastRsi });
      if (isNewBar && showMarkersRef.current && markerPluginRef.current)
        markerPluginRef.current.setMarkers(
          mergeMarkers(
            buildMarkers(
              detectRSICrossovers(
                arr,
                rsi,
                rsiOverboughtRef.current,
                rsiOversoldRef.current,
              ),
            ),
            tradeMarkersRef.current,
          ),
        );
    }

    if (
      activeTabRef.current === "MACD" &&
      macdLineSeriesRef.current &&
      macdSignalSeriesRef.current &&
      macdHistSeriesRef.current
    ) {
      const macd = computeMACDValues(
        arr.map((c) => c.close),
        macdFastRef.current,
        macdSlowRef.current,
        macdSignalRef.current,
      );
      const m = macd[macd.length - 1];
      if (m.macd !== null)
        macdLineSeriesRef.current.update({ time: ts, value: m.macd });
      if (m.signal !== null)
        macdSignalSeriesRef.current.update({ time: ts, value: m.signal });
      if (m.macd !== null && m.signal !== null) {
        const hist = m.macd - m.signal;
        macdHistSeriesRef.current.update({
          time: ts,
          value: hist,
          color: hist >= 0 ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)",
        });
      }
      if (isNewBar && showMarkersRef.current && markerPluginRef.current)
        markerPluginRef.current.setMarkers(
          mergeMarkers(
            buildMarkers(detectMACDCrossovers(arr, macd)),
            tradeMarkersRef.current,
          ),
        );
    }

    if (
      activeTabRef.current === "TD9" &&
      isNewBar &&
      showMarkersRef.current &&
      markerPluginRef.current
    )
      markerPluginRef.current.setMarkers(
        mergeMarkers(buildTD9Markers(arr), tradeMarkersRef.current),
      );
  }, []);

  useMarketData({ onCandle: handleCandle });
  useMockData({ onCandle: handleCandle });

  // ─── Load more history when scrolling left ─────────────────────────────────
  const loadMoreHistory = useCallback(async () => {
    if (
      loadingMoreRef.current ||
      noMoreHistoryRef.current ||
      !oldestBarTimeRef.current ||
      !candleSeriesRef.current
    )
      return;
    loadingMoreRef.current = true;

    const barSecs = TIMEFRAME_SECONDS[timeframeRef.current] ?? 900;
    const limit = FETCH_LIMIT[timeframeRef.current] ?? 500;
    const endISO = new Date(
      (oldestBarTimeRef.current - 1) * 1000,
    ).toISOString();

    try {
      const newBars = await fetchBars(
        tickerRef.current,
        timeframeRef.current as Timeframe,
        limit,
        endISO,
      );
      const normalized = normalizeHistoricalBars(newBars, barSecs);
      if (!normalized.length) {
        // Server has no more data older than this point — stop asking.
        noMoreHistoryRef.current = true;
        return;
      }

      // Deduplicate against what we already have
      const existing = new Set(candlesRef.current.map((c) => c.time));
      const unique = normalized.filter((b) => !existing.has(b.time));
      if (!unique.length) {
        noMoreHistoryRef.current = true;
        return;
      }

      // Snapshot the viewport BEFORE modifying data
      const savedRange = chartRef.current?.timeScale().getVisibleLogicalRange();

      const combined = [...unique, ...candlesRef.current];
      candlesRef.current = combined;
      for (const c of unique) volumeMapRef.current.set(c.time, c.volume);
      oldestBarTimeRef.current = combined[0].time;

      // Update chart synchronously — lock stays held so the setData-triggered
      // visibleLogicalRangeChange callback can't spawn another load.
      candleSeriesRef.current.setData(
        combined.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
      if (savedRange) {
        chartRef.current?.timeScale().setVisibleLogicalRange({
          from: savedRange.from + unique.length,
          to: savedRange.to + unique.length,
        });
      }

      setIndicatorRevision((r) => r + 1);
    } finally {
      loadingMoreRef.current = false;
    }
  }, []);
  useEffect(() => {
    loadMoreRef.current = loadMoreHistory;
  }, [loadMoreHistory]);

  // ─── Push live price into the forming candle ───────────────────────────────
  useEffect(() => {
    if (
      demoMode ||
      !livePrice ||
      !candleSeriesRef.current ||
      !candlesRef.current.length
    )
      return;

    const arr = candlesRef.current;
    const last = arr[arr.length - 1];
    const updated = {
      ...last,
      close: livePrice,
      high: Math.max(last.high, livePrice),
      low: Math.min(last.low, livePrice),
    };
    arr[arr.length - 1] = updated;

    candleSeriesRef.current.update({
      time: updated.time as UTCTimestamp,
      open: updated.open,
      high: updated.high,
      low: updated.low,
      close: updated.close,
    });
  }, [livePrice, demoMode]);

  // ─── Show / hide hover price line ──────────────────────────────────────────
  const hidePriceLine = useCallback(() => {
    if (activePriceLineRef.current && candleSeriesRef.current) {
      candleSeriesRef.current.removePriceLine(activePriceLineRef.current);
      activePriceLineRef.current = null;
    }
  }, []);

  const showPriceLine = useCallback(
    (price: number, color: string) => {
      if (!candleSeriesRef.current) return;
      hidePriceLine();
      activePriceLineRef.current = candleSeriesRef.current.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: 2, // LineStyle.Dashed
        axisLabelVisible: false,
        lineVisible: true,
        title: "",
      });
    },
    [hidePriceLine],
  );

  // ─── Keep tradeMarkersRef in sync; bump indicatorRevision to redraw ────────
  useEffect(() => {
    const relevant = activeStrategy
      ? allTrades.filter(
          (t) => t.strategyId === activeStrategy.id && t.ticker === ticker,
        )
      : [];
    tradeMarkersRef.current = buildTradeMarkers(
      relevant,
      activeStrategy?.openEntry ?? null,
    );
    if (chartReady) setIndicatorRevision((r) => r + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTrades, activeStrategy, ticker, chartReady]);

  // ─── Keep trade price-level boxes Y-positioned on the chart ───────────────
  useEffect(() => {
    const refresh = () => {
      if (!candleSeriesRef.current || !containerRef.current) return;
      const chartTop = containerRef.current.offsetTop;
      const levels: TradePriceLevel[] = [];

      if (activeStrategy?.openEntry) {
        const price = activeStrategy.openEntry.price;
        const rawY = candleSeriesRef.current.priceToCoordinate(price);
        if (rawY != null) {
          levels.push({ type: "buy", price, y: rawY + chartTop });
        }
      }

      const relevant = activeStrategy
        ? allTrades.filter(
            (t) => t.strategyId === activeStrategy.id && t.ticker === ticker,
          )
        : [];
      for (const t of relevant) {
        const rawY = candleSeriesRef.current.priceToCoordinate(t.exitPrice);
        if (rawY != null) {
          levels.push({
            type: "sell",
            price: t.exitPrice,
            y: rawY + chartTop,
            pnlDollars: t.pnlDollars,
            pnlPercent: t.pnlPercent,
          });
        }
      }
      setTradePriceLevels(levels);
    };

    refreshPriceLevelsRef.current = refresh;
    if (chartReady) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, allTrades, activeStrategy, ticker]);

  const legendLabel = () => {
    switch (activeIndicatorTab) {
      case "EMA":
        return `EMA(${emaPeriod})`;
      case "BB":
        return `BB(${bbPeriod}, ${bbStdDev})`;
      case "RSI":
        return `RSI(${rsiPeriod})  OB:${rsiOverbought}  OS:${rsiOversold}`;
      case "MACD":
        return `MACD(${macdFastPeriod},${macdSlowPeriod},${macdSignalPeriod})`;
      case "TD9":
        return "TD Sequential 9 signals";
    }
  };
  const legendLine =
    activeIndicatorTab === "EMA"
      ? "solid-amber"
      : activeIndicatorTab === "BB"
        ? "solid-sky"
        : activeIndicatorTab === "RSI"
          ? "solid-violet"
          : activeIndicatorTab === "MACD"
            ? "solid-blue"
            : "markers-only";

  // ─── After-hours detection ────────────────────────────────────────────────
  useEffect(() => {
    const isCrypto = ticker.includes("/");
    if (demoMode || isCrypto) {
      setAfterHours(false);
      return;
    }

    function check() {
      const etParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        weekday: "short",
        hour12: false,
      }).formatToParts(new Date());

      const get = (type: string) =>
        Number(etParts.find((p) => p.type === type)?.value ?? "0");
      const weekday = etParts.find((p) => p.type === "weekday")?.value ?? "";
      const isWeekend = weekday === "Sat" || weekday === "Sun";
      const minutes = get("hour") * 60 + get("minute");
      const open = 9 * 60 + 30;
      const close = 16 * 60;

      setAfterHours(isWeekend || minutes < open || minutes >= close);
    }

    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [ticker, demoMode]);

  const setTimeframe = useUIStore((s) => s.setTimeframe);

  return (
    <div className="relative flex flex-col h-full tv-chart-container">
      {/* Timeframe selector bar */}
      <div className="flex items-center justify-center gap-0.5 px-2 py-1.5 border-b border-white/5 shrink-0">
        {(["1m", "5m", "15m", "1h", "4h", "1d"] as const).map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
              timeframe === tf
                ? "bg-emerald-500/20 text-emerald-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="absolute top-12 right-3 z-10 flex items-center gap-2">
        {!chartReady && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg glass-sm text-xs text-zinc-500">
            <RefreshCw className="size-3.5 animate-spin" /> Loading
          </div>
        )}
        <button className="p-1.5 rounded-lg glass-sm text-zinc-500 hover:text-white transition-colors">
          <Maximize2 className="size-3.5" />
        </button>
      </div>

      {/* Live price */}
      {livePrice != null &&
        (() => {
          const change = priceOpen ? livePrice - priceOpen : 0;
          const changePct = priceOpen ? (change / priceOpen) * 100 : 0;
          const up = change >= 0;
          return (
            <div className="absolute top-10 left-3 z-10 glass-sm rounded-xl px-3 py-2">
              <div
                className={cn(
                  "text-xl font-mono font-bold tabular-nums transition-colors duration-300",
                  up ? "text-emerald-400" : "text-red-400",
                )}
              >
                ${formatPrice(livePrice)}
              </div>
              {priceOpen != null && (
                <div
                  className={cn(
                    "text-xs font-mono tabular-nums",
                    up ? "text-emerald-400/70" : "text-red-400/70",
                  )}
                >
                  {up ? "+" : ""}
                  {change.toFixed(2)} ({up ? "+" : ""}
                  {changePct.toFixed(2)}%)
                </div>
              )}
            </div>
          );
        })()}

      {/* Active strategy overlay badge */}
      {activeStrategy && (
        <div className="absolute top-[6.5rem] left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-xl glass-sm border border-white/10 text-[10px]">
          {activeStrategy.autoTrade ? (
            <span className="relative flex size-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-1.5 bg-emerald-400" />
            </span>
          ) : (
            <Bot className="size-3 text-amber-400 shrink-0" />
          )}
          <span
            className={
              activeStrategy.autoTrade
                ? "text-emerald-400 font-semibold"
                : "text-amber-400 font-semibold"
            }
          >
            {activeStrategy.autoTrade ? "Auto" : "Loaded"}:
          </span>
          <span className="text-zinc-400 font-mono truncate max-w-[160px]">
            {activeStrategy.name}
          </span>
        </div>
      )}

      {/* Legend */}
      {chartReady && (
        <div className="absolute bottom-8 left-3 z-10 flex items-center gap-4 glass-sm px-2.5 py-1.5 rounded-lg">
          <LegendItem line={legendLine} label={legendLabel()} />
        </div>
      )}

      {/* After-hours badge */}
      {afterHours && !demoMode && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full glass-sm border border-amber-500/30 text-[10px] font-semibold text-amber-400/90 pointer-events-none select-none">
          <MoonStar className="size-3 shrink-0" />
          After Hours · Market closed
        </div>
      )}

      {/* Trade price-level boxes — right side, hover reveals dashed line */}
      {chartReady &&
        tradePriceLevels.map((level, i) => (
          <TradePriceBox
            key={`${level.type}-${level.price}-${i}`}
            level={level}
            onMouseEnter={() =>
              showPriceLine(
                level.price,
                level.type === "buy" ? "#22c55e" : "#ef4444",
              )
            }
            onMouseLeave={hidePriceLine}
          />
        ))}

      {/* Tooltip */}
      {tooltip && containerRef.current && (
        <CandleTooltipPopup
          tooltip={tooltip}
          containerWidth={containerRef.current.clientWidth}
        />
      )}

      <div ref={containerRef} className="flex-1 w-full" />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const TOOLTIP_W = 180,
  TOOLTIP_OFFSET = 16;

function CandleTooltipPopup({
  tooltip,
  containerWidth,
}: {
  tooltip: CandleTooltip;
  containerWidth: number;
}) {
  const isUp = tooltip.close >= tooltip.open;
  const changePct = ((tooltip.close - tooltip.open) / tooltip.open) * 100;
  const flipLeft = tooltip.x + TOOLTIP_W + TOOLTIP_OFFSET > containerWidth;
  const left = flipLeft
    ? tooltip.x - TOOLTIP_W - TOOLTIP_OFFSET
    : tooltip.x + TOOLTIP_OFFSET;
  const dateStr = new Date(tooltip.time * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{ left, top: Math.max(8, tooltip.y - 80) }}
    >
      <div
        className="glass-bright rounded-xl px-3 py-2.5 flex flex-col gap-1.5 shadow-2xl border border-white/10"
        style={{ width: TOOLTIP_W }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-zinc-500 font-mono">{dateStr}</span>
          <span
            className={cn(
              "text-[9px] font-bold px-1.5 py-0.5 rounded",
              isUp
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-red-500/20 text-red-400",
            )}
          >
            {isUp ? "▲" : "▼"} {changePct >= 0 ? "+" : ""}
            {changePct.toFixed(2)}%
          </span>
        </div>
        <div className="h-px bg-white/5" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <OHLCRow label="Open" value={tooltip.open} color="text-zinc-300" />
          <OHLCRow label="High" value={tooltip.high} color="text-emerald-400" />
          <OHLCRow label="Low" value={tooltip.low} color="text-red-400" />
          <OHLCRow
            label="Close"
            value={tooltip.close}
            color={isUp ? "text/-emerald-400" : "text-red-400"}
            bold
          />
        </div>
        <div className="h-px bg-white/5" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500">Volume</span>
          <span className="text-[11px] font-mono text-zinc-300 tabular-nums">
            {tooltip.volume >= 1000
              ? `${(tooltip.volume / 1000).toFixed(1)}K`
              : tooltip.volume.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}

function OHLCRow({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: number;
  color: string;
  bold?: boolean;
}) {
  return (
    <>
      <span className="text-[10px] text-zinc-600">{label}</span>
      <span
        className={cn(
          "text-[11px] font-mono tabular-nums text-right",
          color,
          bold && "font-semibold",
        )}
      >
        {value.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    </>
  );
}

type LegendLineType =
  | "solid-amber"
  | "solid-sky"
  | "solid-violet"
  | "solid-blue"
  | "markers-only";

function LegendItem({ line, label }: { line: LegendLineType; label: string }) {
  const stroke =
    line === "solid-amber"
      ? "#f59e0b"
      : line === "solid-sky"
        ? "rgba(56,189,248,0.8)"
        : line === "solid-violet"
          ? "#a78bfa"
          : line === "solid-blue"
            ? "#60a5fa"
            : "transparent";

  return (
    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
      <svg width="20" height="8" viewBox="0 0 20 8">
        {line === "markers-only" ? (
          <polygon points="10,1 13,7 7,7" fill="#22c55e" />
        ) : (
          <line
            x1="0"
            y1="4"
            x2="20"
            y2="4"
            stroke={stroke}
            strokeWidth="1.5"
          />
        )}
      </svg>
      {label}
    </div>
  );
}

// ─── Trade price-level box ────────────────────────────────────────────────────

function TradePriceBox({
  level,
  onMouseEnter,
  onMouseLeave,
}: {
  level: TradePriceLevel;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  if (level.y === null) return null;

  const isBuy = level.type === "buy";
  const isProfit = (level.pnlPercent ?? 0) >= 0;

  return (
    <div
      className="absolute right-1 z-10 flex flex-col items-end gap-0.5 pointer-events-auto select-none"
      style={{ top: level.y - 11 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className={cn(
          "flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-mono font-semibold leading-none whitespace-nowrap",
          isBuy
            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
            : "bg-red-500/15 border-red-500/40 text-red-400",
        )}
      >
        <span>{isBuy ? "B" : "S"}</span>
        <span>${formatPrice(level.price)}</span>
      </div>
      {!isBuy && level.pnlPercent !== undefined && (
        <div
          className={cn(
            "text-[9px] font-mono px-1 py-px rounded leading-none",
            isProfit
              ? "text-emerald-400/90 bg-emerald-500/10"
              : "text-red-400/90 bg-red-500/10",
          )}
        >
          {isProfit ? "+" : ""}
          {(level.pnlPercent * 100).toFixed(2)}%
          {level.pnlDollars !== undefined && (
            <span className="ml-1 opacity-70">
              {level.pnlDollars >= 0 ? "+" : ""}$
              {Math.abs(level.pnlDollars).toFixed(2)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
