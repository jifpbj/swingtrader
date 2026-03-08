"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import type { IndicatorTab } from "@/store/useUIStore";
import { useMarketData } from "@/hooks/useMarketData";
import { useMockData, generateMockCandles } from "@/hooks/useMockData";
import {
  computeEMA, detectCrossovers,
  computeBollingerBands, detectBollingerCrossovers,
  computeRSI, detectRSICrossovers,
  computeMACDValues, detectMACDCrossovers,
  computeTDSequentialSetup,
} from "@/lib/indicators";
import type { Candle, CrossoverSignal } from "@/types/market";
import { Maximize2, RefreshCw, Bot } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { toBackendTf, TIMEFRAME_SECONDS } from "@/lib/timeframeConvert";
import { useStrategyStore } from "@/store/useStrategyStore";

import type {
  IChartApi, ISeriesApi, UTCTimestamp, Time,
  ISeriesMarkersPluginApi, SeriesMarker, IPriceLine,
} from "lightweight-charts";

interface CandleTooltip {
  x: number; y: number;
  open: number; high: number; low: number; close: number;
  volume: number; time: number;
}

const CHART_COLORS = {
  background: "transparent", text: "#71717a",
  grid: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.06)",
  crosshair: "rgba(255,255,255,0.2)", bull: "#22c55e", bear: "#ef4444",
};

/**
 * How many bars to fetch from the API per timeframe.
 * Capped at the backend maximum of 1 000.
 *
 * The goal is to load enough history for each timeframe to be analytically
 * useful without hammering the API:
 *   1m  → ~8 hours of crypto data (500 bars × 60 s)
 *   5m  → ~42 hours / ~6 trading days
 *   15m → ~6 days crypto / ~3 trading weeks
 *   1h  → ~30 days
 *   4h  → ~120 days / ~4 months
 *   1d  → ~4 years (request max; broker returns what it has)
 */
const FETCH_LIMIT: Record<string, number> = {
  "1m":  500,
  "5m":  500,
  "15m": 600,
  "1h":  720,
  "4h":  720,
  "1d":  1000,
};

/**
 * How many bars to show in the initial viewport after loading.
 * Gives each timeframe a comfortable default scale without being either
 * too zoomed-in (tiny candles) or too zoomed-out (overwhelming detail).
 */
const INITIAL_VISIBLE_BARS: Record<string, number> = {
  "1m":  60,   // ~1 hour
  "5m":  72,   // ~6 hours
  "15m": 80,   // ~20 hours
  "1h":  90,   // ~4 days
  "4h":  90,   // ~15 days
  "1d":  180,  // ~9 months (half a year visible; years of history to scroll)
};

/**
 * Normalise raw OHLCV bars before seeding the chart.
 *
 * 1. Floor every timestamp to its bar boundary so historical bars align with
 *    the same rounding applied to live ticks (Math.floor(t / barSecs) * barSecs).
 * 2. Enforce OHLC integrity: high must be ≥ max(open, close) and low must be
 *    ≤ min(open, close).  Malformed bars from the API or rounding errors would
 *    otherwise produce impossible candle shapes (body poking outside the wick).
 * 3. Deduplicate — keep the last occurrence when two bars share a timestamp
 *    (can happen at session boundaries with some data providers).
 * 4. Sort ascending — lightweight-charts requires monotonically increasing time.
 */
function normalizeHistoricalBars(raw: Candle[], barSecs: number): Candle[] {
  const map = new Map<number, Candle>();
  for (const c of raw) {
    const t = Math.floor(c.time / barSecs) * barSecs;
    map.set(t, {
      time:   t,
      open:   c.open,
      high:   Math.max(c.high, c.open, c.close),   // must cover the body
      low:    Math.min(c.low,  c.open, c.close),   // must cover the body
      close:  c.close,
      volume: c.volume,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

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

function computeMarkersForTab(
  candles: Candle[], tab: IndicatorTab,
  emaPeriod: number,
  bbPeriod: number, bbStdDev: number,
  rsiPeriod: number, rsiOverbought: number, rsiOversold: number,
  macdFast: number, macdSlow: number, macdSignal: number,
): CrossoverSignal[] {
  const closes = candles.map(c => c.close);
  switch (tab) {
    case "EMA":  return detectCrossovers(candles, computeEMA(closes, emaPeriod));
    case "BB":   return detectBollingerCrossovers(candles, bbPeriod, bbStdDev);
    case "RSI":  return detectRSICrossovers(candles, computeRSI(closes, rsiPeriod), rsiOverbought, rsiOversold);
    case "MACD": return detectMACDCrossovers(candles, computeMACDValues(closes, macdFast, macdSlow, macdSignal));
    case "TD9":  return [];
  }
}

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
  const rsiSeriesRef  = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiObLineRef  = useRef<IPriceLine | null>(null);
  const rsiOsLineRef  = useRef<IPriceLine | null>(null);
  const macdLineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [chartReady, setChartReady] = useState(false);
  const [tooltip, setTooltip] = useState<CandleTooltip | null>(null);
  const [indicatorRevision, setIndicatorRevision] = useState(0);
  const volumeMapRef     = useRef<Map<number, number>>(new Map());
  const oldestBarTimeRef = useRef<number | null>(null);
  const loadingMoreRef   = useRef(false);
  const tickerRef        = useRef("");
  const loadMoreRef      = useRef<(() => void) | null>(null);

  const ticker              = useUIStore(s => s.ticker);
  const timeframe           = useUIStore(s => s.timeframe);
  const demoMode            = useUIStore(s => s.demoMode);
  const livePrice           = useUIStore(s => s.livePrice);

  // Active algo strategy for overlay badge
  const activeStrategyId    = useStrategyStore(s => s.activeStrategyId);
  const strategies          = useStrategyStore(s => s.strategies);
  const activeStrategy      = strategies.find(s => s.id === activeStrategyId) ?? null;
  const priceOpen           = useUIStore(s => s.priceOpen);
  const activeIndicatorTab  = useUIStore(s => s.activeIndicatorTab);
  const showSignalMarkers   = useUIStore(s => s.showSignalMarkers);
  const emaPeriod           = useUIStore(s => s.emaPeriod);
  const bbPeriod            = useUIStore(s => s.bbPeriod);
  const bbStdDev            = useUIStore(s => s.bbStdDev);
  const rsiPeriod           = useUIStore(s => s.rsiPeriod);
  const rsiOverbought       = useUIStore(s => s.rsiOverbought);
  const rsiOversold         = useUIStore(s => s.rsiOversold);
  const macdFastPeriod      = useUIStore(s => s.macdFastPeriod);
  const macdSlowPeriod      = useUIStore(s => s.macdSlowPeriod);
  const macdSignalPeriod    = useUIStore(s => s.macdSignalPeriod);

  // Refs mirror store so async callbacks see current values without adding to chart-init deps
  const activeTabRef      = useRef(activeIndicatorTab);
  const emaPeriodRef      = useRef(emaPeriod);
  const bbPeriodRef       = useRef(bbPeriod);
  const bbStdDevRef       = useRef(bbStdDev);
  const showMarkersRef      = useRef(showSignalMarkers);
  const timeframeRef        = useRef(timeframe);
  const rsiPeriodRef        = useRef(rsiPeriod);
  const rsiOverboughtRef    = useRef(rsiOverbought);
  const rsiOversoldRef      = useRef(rsiOversold);
  const macdFastRef         = useRef(macdFastPeriod);
  const macdSlowRef         = useRef(macdSlowPeriod);
  const macdSignalRef       = useRef(macdSignalPeriod);

  useEffect(() => { activeTabRef.current    = activeIndicatorTab; }, [activeIndicatorTab]);
  useEffect(() => { emaPeriodRef.current    = emaPeriod; },         [emaPeriod]);
  useEffect(() => { bbPeriodRef.current     = bbPeriod; },          [bbPeriod]);
  useEffect(() => { bbStdDevRef.current     = bbStdDev; },          [bbStdDev]);
  useEffect(() => { showMarkersRef.current  = showSignalMarkers; }, [showSignalMarkers]);
  useEffect(() => { timeframeRef.current    = timeframe; },         [timeframe]);
  useEffect(() => { rsiPeriodRef.current    = rsiPeriod; },         [rsiPeriod]);
  useEffect(() => { rsiOverboughtRef.current = rsiOverbought; },    [rsiOverbought]);
  useEffect(() => { rsiOversoldRef.current  = rsiOversold; },       [rsiOversold]);
  useEffect(() => { macdFastRef.current     = macdFastPeriod; },    [macdFastPeriod]);
  useEffect(() => { macdSlowRef.current     = macdSlowPeriod; },    [macdSlowPeriod]);
  useEffect(() => { macdSignalRef.current   = macdSignalPeriod; },  [macdSignalPeriod]);
  useEffect(() => { tickerRef.current       = ticker; },            [ticker]);

  // ─── Initialize chart ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let mounted = true;

    import("lightweight-charts").then(async (lc) => {
      if (!mounted || !containerRef.current) return;

      const chart = lc.createChart(containerRef.current, {
        layout: { background: { color: CHART_COLORS.background }, textColor: CHART_COLORS.text, fontFamily: "var(--font-geist-mono), monospace", fontSize: 11 },
        grid: { vertLines: { color: CHART_COLORS.grid }, horzLines: { color: CHART_COLORS.grid } },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: { color: CHART_COLORS.crosshair, width: 1, style: lc.LineStyle.Dashed },
          horzLine: { color: CHART_COLORS.crosshair, width: 1, style: lc.LineStyle.Dashed },
        },
        rightPriceScale: { borderColor: CHART_COLORS.border, scaleMargins: { top: 0.12, bottom: 0.08 } },
        timeScale: { borderColor: CHART_COLORS.border, timeVisible: true, secondsVisible: false, rightOffset: 8, minBarSpacing: 4 },
        handleScroll: true, handleScale: true,
      });
      chartRef.current = chart;

      // Candlestick — hollow body for bullish (close > open), filled for bearish
      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor:          "rgba(0,0,0,0)",   // transparent fill → hollow bullish body
        downColor:        "#ef4444",          // solid red fill   → filled bearish body
        borderUpColor:    "#22c55e",          // green outline for bullish
        borderDownColor:  "#dc2626",          // dark-red outline for bearish
        wickUpColor:      "#22c55e",          // green wick for bullish
        wickDownColor:    "#ef4444",          // red wick for bearish
      });
      candleSeriesRef.current = candleSeries;

      // EMA — amber
      const emaSeries = chart.addSeries(lc.LineSeries, { color: "#f59e0b", lineWidth: 1, lineStyle: lc.LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      emaSeriesRef.current = emaSeries;

      // BB — sky blue
      const bbUpper = chart.addSeries(lc.LineSeries, { color: "rgba(56,189,248,0.7)", lineWidth: 1, lineStyle: lc.LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      bbUpperRef.current = bbUpper;
      const bbLower = chart.addSeries(lc.LineSeries, { color: "rgba(56,189,248,0.7)", lineWidth: 1, lineStyle: lc.LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      bbLowerRef.current = bbLower;
      const bbMiddle = chart.addSeries(lc.LineSeries, { color: "rgba(56,189,248,0.3)", lineWidth: 1, lineStyle: lc.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      bbMiddleRef.current = bbMiddle;

      // Sub-pane 1 — MACD: line (blue), signal (red), histogram (green/red per bar)
      const macdLineSeries = chart.addSeries(lc.LineSeries, { color: "#60a5fa", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 1);
      macdLineSeriesRef.current = macdLineSeries;
      const macdSignalSeries = chart.addSeries(lc.LineSeries, { color: "#f87171", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 1);
      macdSignalSeriesRef.current = macdSignalSeries;
      const macdHistSeries = chart.addSeries(lc.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 1);
      macdHistSeriesRef.current = macdHistSeries;

      // Sub-pane 1 starts minimized (shown only when MACD tab is active)
      chart.panes()[1]?.setHeight(30);

      // Sub-pane 2 — RSI: violet line with OB/OS price lines
      const rsiSeries = chart.addSeries(lc.LineSeries, { color: "#a78bfa", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 2);
      rsiSeriesRef.current = rsiSeries;
      rsiObLineRef.current = rsiSeries.createPriceLine({ price: 70, color: "rgba(167,139,250,0.5)", lineWidth: 1, lineStyle: lc.LineStyle.Dashed, axisLabelVisible: true, lineVisible: true, title: "OB" });
      rsiOsLineRef.current = rsiSeries.createPriceLine({ price: 30, color: "rgba(167,139,250,0.5)", lineWidth: 1, lineStyle: lc.LineStyle.Dashed, axisLabelVisible: true, lineVisible: true, title: "OS" });

      // Sub-pane 2 starts minimized (shown only when RSI tab is active)
      chart.panes()[2]?.setHeight(30);

      // Seed historical data — fetch depth and initial zoom scale with the timeframe
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const barSecs  = TIMEFRAME_SECONDS[timeframe] ?? 900;
      const fetchLimit = FETCH_LIMIT[timeframe] ?? 500;
      let rawCandles: Candle[] = [];
      if (demoMode) {
        // Generate synthetic GBM history instead of hitting the backend
        rawCandles = generateMockCandles(barSecs, Math.min(fetchLimit, 300));
      } else {
        try {
          const res = await fetch(
            `${apiUrl}/api/v1/market/ohlcv/${encodeURIComponent(ticker)}` +
            `?timeframe=${toBackendTf(timeframe)}&limit=${fetchLimit}`
          );
          if (res.ok) { const json = await res.json() as { bars: Candle[] }; rawCandles = json.bars ?? []; }
        } catch { /* fallback to empty */ }
      }

      // Normalize before use: floor timestamps, enforce OHLC integrity, deduplicate, sort
      const initialCandles = normalizeHistoricalBars(rawCandles, barSecs);

      candlesRef.current = initialCandles;
      oldestBarTimeRef.current = initialCandles[0]?.time ?? null;
      const volMap = new Map<number, number>();
      for (const c of initialCandles) volMap.set(c.time, c.volume);
      volumeMapRef.current = volMap;

      candleSeries.setData(initialCandles.map(c => ({
        time:  c.time as UTCTimestamp,
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
      })));

      // Marker plugin (data applied by the unified update effect when chartReady fires)
      markerPluginRef.current = lc.createSeriesMarkers(candleSeries, []);

      chart.subscribeCrosshairMove((param) => {
        if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) { setTooltip(null); return; }
        const bar = param.seriesData.get(candleSeries) as { open: number; high: number; low: number; close: number } | undefined;
        if (!bar) { setTooltip(null); return; }
        const time = param.time as number;
        setTooltip({ x: param.point.x, y: param.point.y, ...bar, volume: volumeMapRef.current.get(time) ?? 0, time });
      });

      // Open at a sensible zoom level for the selected timeframe
      const visibleBars = INITIAL_VISIBLE_BARS[timeframe] ?? 80;
      const barCount = initialCandles.length;
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, barCount - visibleBars),
        to:   barCount + 3,
      });
      // Trigger load-more when user scrolls near the left edge
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range && range.from <= 5) loadMoreRef.current?.();
      });

      setChartReady(true);
    });

    const ro = new ResizeObserver(() => {
      if (chartRef.current && containerRef.current)
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      mounted = false; ro.disconnect(); chartRef.current?.remove();
      chartRef.current = candleSeriesRef.current = emaSeriesRef.current = markerPluginRef.current =
      bbUpperRef.current = bbLowerRef.current = bbMiddleRef.current =
      rsiSeriesRef.current = rsiObLineRef.current = rsiOsLineRef.current =
      macdLineSeriesRef.current = macdSignalSeriesRef.current = macdHistSeriesRef.current = null;
      setChartReady(false);
    };
  }, [ticker, timeframe, demoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Unified indicator update effect ──────────────────────────────────────
  // Fires whenever the active tab, any config value, or chartReady changes.
  // chartReady in deps ensures this runs AFTER async chart init populates all refs.
  useEffect(() => {
    if (!chartReady) return;
    const candles = candlesRef.current;
    if (!candles.length) return;

    const closes = candles.map(c => c.close);

    // Clear everything first
    emaSeriesRef.current?.setData([]);
    bbUpperRef.current?.setData([]);
    bbLowerRef.current?.setData([]);
    bbMiddleRef.current?.setData([]);
    rsiSeriesRef.current?.setData([]);
    macdLineSeriesRef.current?.setData([]);
    macdSignalSeriesRef.current?.setData([]);
    macdHistSeriesRef.current?.setData([]);
    markerPluginRef.current?.setMarkers([]);

    // Collapse sub-panes unless their tab is active
    if (activeIndicatorTab !== "MACD") chartRef.current?.panes()[1]?.setHeight(30);
    if (activeIndicatorTab !== "RSI")  chartRef.current?.panes()[2]?.setHeight(30);

    switch (activeIndicatorTab) {
      case "EMA": {
        const emas = computeEMA(closes, emaPeriod);
        emaSeriesRef.current?.setData(
          candles.flatMap((c, i) => emas[i] !== null ? [{ time: c.time as UTCTimestamp, value: emas[i]! }] : [])
        );
        if (showSignalMarkers)
          markerPluginRef.current?.setMarkers(buildMarkers(detectCrossovers(candles, emas)));
        break;
      }
      case "BB": {
        const bbs = computeBollingerBands(candles, bbPeriod, bbStdDev);
        bbUpperRef.current?.setData(bbs.map(b => ({ time: b.time as UTCTimestamp, value: b.upper })));
        bbLowerRef.current?.setData(bbs.map(b => ({ time: b.time as UTCTimestamp, value: b.lower })));
        bbMiddleRef.current?.setData(bbs.map(b => ({ time: b.time as UTCTimestamp, value: b.middle })));
        if (showSignalMarkers)
          markerPluginRef.current?.setMarkers(buildMarkers(detectBollingerCrossovers(candles, bbPeriod, bbStdDev)));
        break;
      }
      case "RSI": {
        const rsi = computeRSI(closes, rsiPeriod);
        rsiSeriesRef.current?.setData(
          candles.flatMap((c, i) => rsi[i] !== null ? [{ time: c.time as UTCTimestamp, value: rsi[i]! }] : [])
        );
        // Keep OB/OS lines in sync with slider values
        rsiObLineRef.current?.applyOptions({ price: rsiOverbought });
        rsiOsLineRef.current?.applyOptions({ price: rsiOversold });
        if (showSignalMarkers)
          markerPluginRef.current?.setMarkers(buildMarkers(detectRSICrossovers(candles, rsi, rsiOverbought, rsiOversold)));
        // Expand the RSI sub-pane
        chartRef.current?.panes()[2]?.setHeight(110);
        break;
      }
      case "MACD": {
        const macd = computeMACDValues(closes, macdFastPeriod, macdSlowPeriod, macdSignalPeriod);
        macdLineSeriesRef.current?.setData(
          candles.flatMap((c, i) =>
            macd[i].macd !== null ? [{ time: c.time as UTCTimestamp, value: macd[i].macd! }] : []
          )
        );
        macdSignalSeriesRef.current?.setData(
          candles.flatMap((c, i) =>
            macd[i].signal !== null ? [{ time: c.time as UTCTimestamp, value: macd[i].signal! }] : []
          )
        );
        macdHistSeriesRef.current?.setData(
          candles.flatMap((c, i) => {
            const { macd: m, signal: s } = macd[i];
            if (m === null || s === null) return [];
            const hist = m - s;
            return [{ time: c.time as UTCTimestamp, value: hist, color: hist >= 0 ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)" }];
          })
        );
        if (showSignalMarkers)
          markerPluginRef.current?.setMarkers(buildMarkers(detectMACDCrossovers(candles, macd)));
        // Expand the MACD sub-pane
        chartRef.current?.panes()[1]?.setHeight(130);
        break;
      }
      case "TD9": {
        if (showSignalMarkers) {
          markerPluginRef.current?.setMarkers(buildTD9Markers(candles));
        }
        break;
      }
    }
  }, [
    chartReady, activeIndicatorTab, showSignalMarkers,
    emaPeriod,
    bbPeriod, bbStdDev,
    rsiPeriod, rsiOverbought, rsiOversold,
    macdFastPeriod, macdSlowPeriod, macdSignalPeriod,
    indicatorRevision,
  ]);

  // ─── Live candle ticks ─────────────────────────────────────────────────────
  const handleCandle = useCallback((rawCandle: Candle) => {
    if (!candleSeriesRef.current) return;

    // 1. Floor to bar boundary — prevents per-second WS ticks from creating
    //    individual 1-second bars instead of updating the current forming bar.
    const barSecs = TIMEFRAME_SECONDS[timeframeRef.current] ?? 900;
    const t = Math.floor(rawCandle.time / barSecs) * barSecs;

    import("lightweight-charts").then(() => {
      if (!candleSeriesRef.current) return;

      const arr = candlesRef.current;
      const last = arr[arr.length - 1];
      const isNewBar = !last || last.time !== t;

      // 2. Properly accumulate OHLC for the forming bar:
      //    - Open  : locked to the first tick that opened this bar
      //    - High  : running maximum across all ticks in this bar
      //    - Low   : running minimum across all ticks in this bar
      //    - Close : always the most recent price
      //    - Volume: cumulative total for this bar (backend sends bar-total, not delta)
      const bar: Candle = isNewBar ? { ...rawCandle, time: t } : {
        time:   t,
        open:   last.open,
        high:   Math.max(last.high, rawCandle.high),
        low:    Math.min(last.low,  rawCandle.low),
        close:  rawCandle.close,
        volume: rawCandle.volume,
      };

      // 3. Push accumulated bar to the chart and local store
      candleSeriesRef.current.update({
        time: bar.time as UTCTimestamp,
        open: bar.open, high: bar.high, low: bar.low, close: bar.close,
      });
      volumeMapRef.current.set(bar.time, bar.volume);

      if (!isNewBar) arr[arr.length - 1] = bar;
      else { arr.push(bar); if (arr.length > 500) arr.shift(); }

      // 4. Incremental indicator updates (all use arr which now contains bar)
      const ts = bar.time as UTCTimestamp;

      if (activeTabRef.current === "EMA" && emaSeriesRef.current) {
        const emas = computeEMA(arr.map(c => c.close), emaPeriodRef.current);
        const lastEma = emas[emas.length - 1];
        if (lastEma !== null) emaSeriesRef.current.update({ time: ts, value: lastEma });
        if (isNewBar && showMarkersRef.current && markerPluginRef.current)
          markerPluginRef.current.setMarkers(buildMarkers(detectCrossovers(arr, emas)));
      }

      if (activeTabRef.current === "BB" && bbUpperRef.current && bbLowerRef.current && bbMiddleRef.current) {
        const bbs = computeBollingerBands(arr, bbPeriodRef.current, bbStdDevRef.current);
        if (bbs.length) {
          const b = bbs[bbs.length - 1];
          bbUpperRef.current.update({ time: ts, value: b.upper });
          bbLowerRef.current.update({ time: ts, value: b.lower });
          bbMiddleRef.current.update({ time: ts, value: b.middle });
        }
        if (isNewBar && showMarkersRef.current && markerPluginRef.current)
          markerPluginRef.current.setMarkers(buildMarkers(detectBollingerCrossovers(arr, bbPeriodRef.current, bbStdDevRef.current)));
      }

      if (activeTabRef.current === "RSI" && rsiSeriesRef.current) {
        const rsi = computeRSI(arr.map(c => c.close), rsiPeriodRef.current);
        const lastRsi = rsi[rsi.length - 1];
        if (lastRsi !== null) rsiSeriesRef.current.update({ time: ts, value: lastRsi });
        if (isNewBar && showMarkersRef.current && markerPluginRef.current)
          markerPluginRef.current.setMarkers(buildMarkers(detectRSICrossovers(arr, rsi, rsiOverboughtRef.current, rsiOversoldRef.current)));
      }

      if (activeTabRef.current === "MACD" && macdLineSeriesRef.current && macdSignalSeriesRef.current && macdHistSeriesRef.current) {
        const macd = computeMACDValues(arr.map(c => c.close), macdFastRef.current, macdSlowRef.current, macdSignalRef.current);
        const m = macd[macd.length - 1];
        if (m.macd !== null) macdLineSeriesRef.current.update({ time: ts, value: m.macd });
        if (m.signal !== null) macdSignalSeriesRef.current.update({ time: ts, value: m.signal });
        if (m.macd !== null && m.signal !== null) {
          const hist = m.macd - m.signal;
          macdHistSeriesRef.current.update({ time: ts, value: hist, color: hist >= 0 ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)" });
        }
        if (isNewBar && showMarkersRef.current && markerPluginRef.current)
          markerPluginRef.current.setMarkers(buildMarkers(detectMACDCrossovers(arr, macd)));
      }

      if (activeTabRef.current === "TD9" && isNewBar && showMarkersRef.current && markerPluginRef.current)
        markerPluginRef.current.setMarkers(buildTD9Markers(arr));

    });
  }, []);

  useMarketData({ onCandle: handleCandle });
  useMockData({ onCandle: handleCandle });

  // ─── Load more history when scrolling left ─────────────────────────────────
  const loadMoreHistory = useCallback(async () => {
    if (loadingMoreRef.current || !oldestBarTimeRef.current || !candleSeriesRef.current) return;
    loadingMoreRef.current = true;

    const apiUrl  = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const barSecs = TIMEFRAME_SECONDS[timeframeRef.current] ?? 900;
    const limit   = FETCH_LIMIT[timeframeRef.current] ?? 500;
    // Fetch bars strictly before the oldest we have
    const endISO  = new Date((oldestBarTimeRef.current - 1) * 1000).toISOString();

    try {
      const res = await fetch(
        `${apiUrl}/api/v1/market/ohlcv/${encodeURIComponent(tickerRef.current)}` +
        `?timeframe=${toBackendTf(timeframeRef.current)}&limit=${limit}&end=${encodeURIComponent(endISO)}`
      );
      if (!res.ok) return;
      const json = await res.json() as { bars: Candle[] };
      const newBars = normalizeHistoricalBars(json.bars ?? [], barSecs);
      if (!newBars.length) return;

      // Deduplicate
      const existing = new Set(candlesRef.current.map(c => c.time));
      const unique   = newBars.filter(b => !existing.has(b.time));
      if (!unique.length) return;

      // Save viewport so we can restore it after setData (setData resets scroll)
      const savedRange = chartRef.current?.timeScale().getVisibleLogicalRange();

      const combined = [...unique, ...candlesRef.current];
      candlesRef.current = combined;
      for (const c of unique) volumeMapRef.current.set(c.time, c.volume);
      oldestBarTimeRef.current = combined[0].time;

      import("lightweight-charts").then(() => {
        if (!candleSeriesRef.current) return;
        candleSeriesRef.current.setData(combined.map(c => ({
          time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close,
        })));
        // Shift the viewport right by the number of prepended bars so view stays stable
        if (savedRange) {
          chartRef.current?.timeScale().setVisibleLogicalRange({
            from: savedRange.from + unique.length,
            to:   savedRange.to  + unique.length,
          });
        }
      });

      // Re-run the indicator effect with the expanded dataset
      setIndicatorRevision(r => r + 1);
    } finally {
      loadingMoreRef.current = false;
    }
  }, []); // reads from refs only — no reactive deps needed
  useEffect(() => { loadMoreRef.current = loadMoreHistory; }, [loadMoreHistory]);

  // ─── Push live price into the forming candle every second ──────────────────
  useEffect(() => {
    if (!livePrice || !candleSeriesRef.current || !candlesRef.current.length) return;

    const arr  = candlesRef.current;
    const last = arr[arr.length - 1];
    const updated = {
      ...last,
      close: livePrice,
      high:  Math.max(last.high, livePrice),
      low:   Math.min(last.low,  livePrice),
    };
    arr[arr.length - 1] = updated;

    import("lightweight-charts").then(() => {
      candleSeriesRef.current?.update({
        time:  updated.time as UTCTimestamp,
        open:  updated.open,
        high:  updated.high,
        low:   updated.low,
        close: updated.close,
      });
    });
  }, [livePrice]);

  const legendLabel = () => {
    switch (activeIndicatorTab) {
      case "EMA":  return `EMA(${emaPeriod})`;
      case "BB":   return `BB(${bbPeriod}, ${bbStdDev})`;
      case "RSI":  return `RSI(${rsiPeriod})  OB:${rsiOverbought}  OS:${rsiOversold}`;
      case "MACD": return `MACD(${macdFastPeriod},${macdSlowPeriod},${macdSignalPeriod})`;
      case "TD9":  return "TD Sequential 9 signals";
    }
  };
  const legendLine =
    activeIndicatorTab === "EMA"  ? "solid-amber" :
    activeIndicatorTab === "BB"   ? "solid-sky" :
    activeIndicatorTab === "RSI"  ? "solid-violet" :
    activeIndicatorTab === "MACD" ? "solid-blue" : "markers-only";

  const setTimeframe = useUIStore(s => s.setTimeframe);

  return (
    <div className="relative flex flex-col h-full tv-chart-container">
      {/* Timeframe selector bar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/5 shrink-0">
        {(["1m","5m","15m","1h","4h","1d"] as const).map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
              timeframe === tf
                ? "bg-emerald-500/20 text-emerald-400"
                : "text-muted-foreground hover:text-foreground"
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
      {livePrice != null && (() => {
        const change = priceOpen ? livePrice - priceOpen : 0;
        const changePct = priceOpen ? (change / priceOpen) * 100 : 0;
        const up = change >= 0;
        return (
          <div className="absolute top-3 left-3 z-10 glass-sm rounded-xl px-3 py-2">
            <div className={cn("text-xl font-mono font-bold tabular-nums transition-colors duration-300",
              up ? "text-emerald-400" : "text-red-400")}>
              ${formatPrice(livePrice)}
            </div>
            {priceOpen != null && (
              <div className={cn("text-xs font-mono tabular-nums", up ? "text-emerald-400/70" : "text-red-400/70")}>
                {up ? "+" : ""}{change.toFixed(2)} ({up ? "+" : ""}{changePct.toFixed(2)}%)
              </div>
            )}
          </div>
        );
      })()}

      {/* Active strategy overlay badge */}
      {activeStrategy && (
        <div className="absolute top-16 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-xl glass-sm border border-white/10 text-[10px]">
          {activeStrategy.autoTrade ? (
            <span className="relative flex size-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-1.5 bg-emerald-400" />
            </span>
          ) : (
            <Bot className="size-3 text-amber-400 shrink-0" />
          )}
          <span className={activeStrategy.autoTrade ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
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

      {/* Tooltip */}
      {tooltip && containerRef.current && (
        <CandleTooltipPopup tooltip={tooltip} containerWidth={containerRef.current.clientWidth} />
      )}

      <div ref={containerRef} className="flex-1 w-full" />
    </div>
  );
}

const TOOLTIP_W = 180, TOOLTIP_OFFSET = 16;

function CandleTooltipPopup({ tooltip, containerWidth }: { tooltip: CandleTooltip; containerWidth: number }) {
  const isUp = tooltip.close >= tooltip.open;
  const changePct = ((tooltip.close - tooltip.open) / tooltip.open) * 100;
  const flipLeft = tooltip.x + TOOLTIP_W + TOOLTIP_OFFSET > containerWidth;
  const left = flipLeft ? tooltip.x - TOOLTIP_W - TOOLTIP_OFFSET : tooltip.x + TOOLTIP_OFFSET;
  const dateStr = new Date(tooltip.time * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className="absolute z-20 pointer-events-none" style={{ left, top: Math.max(8, tooltip.y - 80) }}>
      <div className="glass-bright rounded-xl px-3 py-2.5 flex flex-col gap-1.5 shadow-2xl border border-white/10" style={{ width: TOOLTIP_W }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-zinc-500 font-mono">{dateStr}</span>
          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", isUp ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400")}>
            {isUp ? "▲" : "▼"} {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
          </span>
        </div>
        <div className="h-px bg-white/5" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <OHLCRow label="O" value={tooltip.open}  color="text-zinc-300" />
          <OHLCRow label="H" value={tooltip.high}  color="text-emerald-400" />
          <OHLCRow label="L" value={tooltip.low}   color="text-red-400" />
          <OHLCRow label="C" value={tooltip.close} color={isUp ? "text-emerald-400" : "text-red-400"} bold />
        </div>
        <div className="h-px bg-white/5" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500">Vol</span>
          <span className="text-[11px] font-mono text-zinc-300 tabular-nums">
            {tooltip.volume >= 1000 ? `${(tooltip.volume / 1000).toFixed(1)}K` : tooltip.volume.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}

function OHLCRow({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  return (
    <>
      <span className="text-[10px] text-zinc-600">{label}</span>
      <span className={cn("text-[11px] font-mono tabular-nums text-right", color, bold && "font-semibold")}>
        {value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </>
  );
}

type LegendLineType = "solid-amber" | "solid-sky" | "solid-violet" | "solid-blue" | "markers-only";

function LegendItem({ line, label }: { line: LegendLineType; label: string }) {
  const stroke =
    line === "solid-amber"  ? "#f59e0b" :
    line === "solid-sky"    ? "rgba(56,189,248,0.8)" :
    line === "solid-violet" ? "#a78bfa" :
    line === "solid-blue"   ? "#60a5fa" : "transparent";
  const dash = undefined;

  return (
    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
      <svg width="20" height="8" viewBox="0 0 20 8">
        {line === "markers-only" ? (
          <>
            <polygon points="10,1 13,7 7,7" fill="#22c55e" />
          </>
        ) : (
          <line x1="0" y1="4" x2="20" y2="4" stroke={stroke} strokeWidth="1.5" strokeDasharray={dash} />
        )}
      </svg>
      {label}
    </div>
  );
}
