"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import type { IndicatorTab } from "@/store/useUIStore";
import { useMarketData } from "@/hooks/useMarketData";
import { generateMockCandles } from "@/hooks/useMockData";
import {
  computeEMA, detectCrossovers,
  computeBollingerBands,
  computeRSI, detectRSICrossovers,
  computeMACDValues, detectMACDCrossovers,
  computeTDSequentialSetup,
} from "@/lib/indicators";
import type { Candle, Prediction, PredictiveBand, CrossoverSignal } from "@/types/market";
import { Maximize2, EyeOff, Eye, RefreshCw } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { TIMEFRAME_SECONDS, toBackendTf } from "@/lib/timeframeConvert";

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

function generateMockBands(candles: Candle[]): PredictiveBand[] {
  return candles.slice(-40).map((c) => {
    const halfRange = c.close * (0.008 + Math.random() * 0.012);
    const drift = (Math.random() - 0.48) * c.close * 0.003;
    return { time: c.time, upperBound: c.close + halfRange + drift, lowerBound: c.close - halfRange + drift, midpoint: c.close + drift, confidence: 0.6 + Math.random() * 0.35 };
  });
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
  rsiPeriod: number, rsiOverbought: number, rsiOversold: number,
  macdFast: number, macdSlow: number, macdSignal: number,
): CrossoverSignal[] {
  const closes = candles.map(c => c.close);
  switch (tab) {
    case "EMA":  return detectCrossovers(candles, computeEMA(closes, emaPeriod));
    case "RSI":  return detectRSICrossovers(candles, computeRSI(closes, rsiPeriod), rsiOverbought, rsiOversold);
    case "MACD": return detectMACDCrossovers(candles, computeMACDValues(closes, macdFast, macdSlow, macdSignal));
    case "BB":   return []; // BB uses band overlay, not markers
    case "TD9":  return [];
  }
}

export function ChartContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const upperBandRef = useRef<ISeriesApi<"Line"> | null>(null);
  const lowerBandRef = useRef<ISeriesApi<"Line"> | null>(null);
  const midLineRef = useRef<ISeriesApi<"Line"> | null>(null);
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

  const [chartReady, setChartReady] = useState(false);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [tooltip, setTooltip] = useState<CandleTooltip | null>(null);
  const volumeMapRef = useRef<Map<number, number>>(new Map());

  const ticker              = useUIStore(s => s.ticker);
  const timeframe           = useUIStore(s => s.timeframe);
  const showOverlay         = useUIStore(s => s.showPredictiveOverlay);
  const toggleOverlay       = useUIStore(s => s.togglePredictiveOverlay);
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
  const activeTabRef    = useRef(activeIndicatorTab);
  const emaPeriodRef    = useRef(emaPeriod);
  const bbPeriodRef     = useRef(bbPeriod);
  const bbStdDevRef     = useRef(bbStdDev);
  const showMarkersRef  = useRef(showSignalMarkers);

  useEffect(() => { activeTabRef.current   = activeIndicatorTab; }, [activeIndicatorTab]);
  useEffect(() => { emaPeriodRef.current   = emaPeriod; },        [emaPeriod]);
  useEffect(() => { bbPeriodRef.current    = bbPeriod; },         [bbPeriod]);
  useEffect(() => { bbStdDevRef.current    = bbStdDev; },         [bbStdDev]);
  useEffect(() => { showMarkersRef.current = showSignalMarkers; },[showSignalMarkers]);

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
        timeScale: { borderColor: CHART_COLORS.border, timeVisible: true, secondsVisible: false },
        handleScroll: true, handleScale: true,
      });
      chartRef.current = chart;

      // Candlestick
      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: CHART_COLORS.bull, downColor: CHART_COLORS.bear,
        borderUpColor: CHART_COLORS.bull, borderDownColor: CHART_COLORS.bear,
        wickUpColor: CHART_COLORS.bull, wickDownColor: CHART_COLORS.bear,
      });
      candleSeriesRef.current = candleSeries;

      // AI Predictive overlay
      const upperBand = chart.addSeries(lc.LineSeries, { color: "rgba(34,197,94,0.5)", lineWidth: 1, lineStyle: lc.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      upperBandRef.current = upperBand;
      const lowerBand = chart.addSeries(lc.LineSeries, { color: "rgba(34,197,94,0.5)", lineWidth: 1, lineStyle: lc.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      lowerBandRef.current = lowerBand;
      const midLine = chart.addSeries(lc.LineSeries, { color: "rgba(34,197,94,0.22)", lineWidth: 1, lineStyle: lc.LineStyle.SparseDotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      midLineRef.current = midLine;

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

      // Sub-pane 1 — RSI
      const rsiSeries = chart.addSeries(lc.LineSeries, { color: "#a78bfa", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 1);
      rsiSeriesRef.current = rsiSeries;
      rsiObLineRef.current = rsiSeries.createPriceLine({ price: 70, color: "rgba(167,139,250,0.35)", lineWidth: 1, lineStyle: lc.LineStyle.Dashed, axisLabelVisible: false, lineVisible: false });
      rsiOsLineRef.current = rsiSeries.createPriceLine({ price: 30, color: "rgba(167,139,250,0.35)", lineWidth: 1, lineStyle: lc.LineStyle.Dashed, axisLabelVisible: false, lineVisible: false });

      // Sub-pane 1 — MACD line + signal + histogram
      const macdLineSeries = chart.addSeries(lc.LineSeries, { color: "#fb7185", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 1);
      macdLineSeriesRef.current = macdLineSeries;
      const macdSignalSeries = chart.addSeries(lc.LineSeries, { color: "#fb923c", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 1);
      macdSignalSeriesRef.current = macdSignalSeries;
      const macdHistSeries = chart.addSeries(lc.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 1);
      macdHistSeriesRef.current = macdHistSeries;

      // Sub-pane starts minimized (EMA is default active tab)
      chart.panes()[1]?.setHeight(30);

      // Seed historical data
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      let initialCandles: Candle[] = [];
      try {
        const res = await fetch(`${apiUrl}/api/v1/market/ohlcv/${encodeURIComponent(ticker)}?timeframe=${toBackendTf(timeframe)}&limit=200`);
        if (res.ok) { const json = await res.json() as { bars: Candle[] }; initialCandles = json.bars ?? []; }
      } catch { /* fallback */ }
      if (initialCandles.length < 10) initialCandles = generateMockCandles(200);

      candlesRef.current = initialCandles;
      const volMap = new Map<number, number>();
      for (const c of initialCandles) volMap.set(c.time, c.volume);
      volumeMapRef.current = volMap;

      const bands = generateMockBands(initialCandles);
      candleSeries.setData(initialCandles.map(c => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
      upperBand.setData(bands.map(b => ({ time: b.time as UTCTimestamp, value: b.upperBound })));
      lowerBand.setData(bands.map(b => ({ time: b.time as UTCTimestamp, value: b.lowerBound })));
      midLine.setData(bands.map(b => ({ time: b.time as UTCTimestamp, value: b.midpoint })));

      // Marker plugin (data applied by the unified update effect when chartReady fires)
      markerPluginRef.current = lc.createSeriesMarkers(candleSeries, []);

      chart.subscribeCrosshairMove((param) => {
        if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) { setTooltip(null); return; }
        const bar = param.seriesData.get(candleSeries) as { open: number; high: number; low: number; close: number } | undefined;
        if (!bar) { setTooltip(null); return; }
        const time = param.time as number;
        setTooltip({ x: param.point.x, y: param.point.y, ...bar, volume: volumeMapRef.current.get(time) ?? 0, time });
      });

      chart.timeScale().fitContent();
      const last = initialCandles[initialCandles.length - 1];
      setLastPrice(last.close);
      setChartReady(true);
    });

    const ro = new ResizeObserver(() => {
      if (chartRef.current && containerRef.current)
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      mounted = false; ro.disconnect(); chartRef.current?.remove();
      chartRef.current = candleSeriesRef.current = upperBandRef.current = lowerBandRef.current =
      midLineRef.current = emaSeriesRef.current = markerPluginRef.current =
      bbUpperRef.current = bbLowerRef.current = bbMiddleRef.current =
      rsiSeriesRef.current = rsiObLineRef.current = rsiOsLineRef.current =
      macdLineSeriesRef.current = macdSignalSeriesRef.current = macdHistSeriesRef.current = null;
      setChartReady(false);
    };
  }, [ticker, timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Toggle AI overlay ─────────────────────────────────────────────────────
  useEffect(() => {
    const a = showOverlay ? 0.5 : 0;
    upperBandRef.current?.applyOptions({ color: `rgba(34,197,94,${a})` });
    lowerBandRef.current?.applyOptions({ color: `rgba(34,197,94,${a})` });
    midLineRef.current?.applyOptions({ color: `rgba(34,197,94,${a * 0.44})` });
  }, [showOverlay]);

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
    markerPluginRef.current?.setMarkers([]);

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
        break;
      }
      case "RSI": {
        if (showSignalMarkers) {
          const rsi = computeRSI(closes, rsiPeriod);
          markerPluginRef.current?.setMarkers(buildMarkers(detectRSICrossovers(candles, rsi, rsiOverbought, rsiOversold)));
        }
        break;
      }
      case "MACD": {
        if (showSignalMarkers) {
          const macd = computeMACDValues(closes, macdFastPeriod, macdSlowPeriod, macdSignalPeriod);
          markerPluginRef.current?.setMarkers(buildMarkers(detectMACDCrossovers(candles, macd)));
        }
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
  ]);

  // ─── Live candle ticks ─────────────────────────────────────────────────────
  const handleCandle = useCallback((candle: Candle) => {
    if (!candleSeriesRef.current) return;
    import("lightweight-charts").then(() => {
      if (!candleSeriesRef.current) return;
      candleSeriesRef.current.update({ time: candle.time as UTCTimestamp, open: candle.open, high: candle.high, low: candle.low, close: candle.close });
      volumeMapRef.current.set(candle.time, candle.volume);

      const arr = candlesRef.current;
      const last = arr[arr.length - 1];
      const isNewBar = !last || last.time !== candle.time;
      if (!isNewBar) arr[arr.length - 1] = candle;
      else { arr.push(candle); if (arr.length > 500) arr.shift(); }

      // Incremental EMA line update
      if (activeTabRef.current === "EMA" && emaSeriesRef.current) {
        const emas = computeEMA(arr.map(c => c.close), emaPeriodRef.current);
        const lastEma = emas[emas.length - 1];
        if (lastEma !== null) emaSeriesRef.current.update({ time: candle.time as UTCTimestamp, value: lastEma });
        if (isNewBar && showMarkersRef.current && markerPluginRef.current)
          markerPluginRef.current.setMarkers(buildMarkers(detectCrossovers(arr, emas)));
      }

      // Incremental BB update
      if (activeTabRef.current === "BB" && bbUpperRef.current && bbLowerRef.current && bbMiddleRef.current) {
        const bbs = computeBollingerBands(arr, bbPeriodRef.current, bbStdDevRef.current);
        if (bbs.length) {
          const b = bbs[bbs.length - 1];
          bbUpperRef.current.update({ time: candle.time as UTCTimestamp, value: b.upper });
          bbLowerRef.current.update({ time: candle.time as UTCTimestamp, value: b.lower });
          bbMiddleRef.current.update({ time: candle.time as UTCTimestamp, value: b.middle });
        }
      }

      // Incremental TD9 marker update (on new bars)
      if (activeTabRef.current === "TD9" && isNewBar && showMarkersRef.current && markerPluginRef.current) {
        markerPluginRef.current.setMarkers(buildTD9Markers(arr));
      }

      setLastPrice(prev => { if (prev !== null) setPriceChange(candle.close - prev); return candle.close; });

      if (showOverlay) {
        const halfRange = candle.close * 0.01;
        const nextTime = (candle.time + TIMEFRAME_SECONDS[timeframe]) as UTCTimestamp;
        upperBandRef.current?.update({ time: nextTime, value: candle.close + halfRange });
        lowerBandRef.current?.update({ time: nextTime, value: candle.close - halfRange });
        midLineRef.current?.update({ time: nextTime, value: candle.close });
      }
    });
  }, [showOverlay, timeframe]);

  const handlePrediction = useCallback((prediction: Prediction) => {
    if (!showOverlay) return;
    import("lightweight-charts").then(() => {
      for (const b of prediction.bands) {
        const t = b.time as UTCTimestamp;
        upperBandRef.current?.update({ time: t, value: b.upperBound });
        lowerBandRef.current?.update({ time: t, value: b.lowerBound });
        midLineRef.current?.update({ time: t, value: b.midpoint });
      }
    });
  }, [showOverlay]);

  useMarketData({ onCandle: handleCandle, onPrediction: handlePrediction });

  const legendLabel = () => {
    switch (activeIndicatorTab) {
      case "EMA":  return `EMA(${emaPeriod})`;
      case "BB":   return `BB(${bbPeriod}, ${bbStdDev})`;
      case "RSI":  return `RSI(${rsiPeriod}) signals`;
      case "MACD": return `MACD(${macdFastPeriod},${macdSlowPeriod},${macdSignalPeriod}) signals`;
      case "TD9":  return "TD Sequential 9 signals";
    }
  };
  const legendLine = activeIndicatorTab === "EMA" ? "solid-amber" : activeIndicatorTab === "BB" ? "solid-sky" : "markers-only";

  return (
    <div className="relative flex flex-col h-full tv-chart-container">
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button onClick={toggleOverlay} className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg glass-sm text-xs font-medium transition-all", showOverlay ? "text-emerald-400" : "text-zinc-500")}>
          {showOverlay ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          AI Overlay
        </button>
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
      {lastPrice !== null && (
        <div className="absolute top-3 left-3 z-10 glass-sm rounded-xl px-3 py-2">
          <div className={cn("text-xl font-mono font-bold tabular-nums transition-colors duration-300", priceChange > 0 ? "text-emerald-400" : priceChange < 0 ? "text-red-400" : "text-white")}>
            ${formatPrice(lastPrice)}
          </div>
          <div className={cn("text-xs font-mono tabular-nums", priceChange >= 0 ? "text-emerald-400/70" : "text-red-400/70")}>
            {priceChange >= 0 ? "+" : ""}{priceChange.toFixed(2)}
          </div>
        </div>
      )}

      {/* Legend */}
      {chartReady && (
        <div className="absolute bottom-8 left-3 z-10 flex items-center gap-4 glass-sm px-2.5 py-1.5 rounded-lg">
          {showOverlay && <LegendItem line="dashed-emerald" label="AI Range" />}
          {showOverlay && <LegendItem line="dotted-emerald" label="AI Mid" />}
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

type LegendLineType = "dashed-emerald" | "dotted-emerald" | "solid-amber" | "solid-sky" | "markers-only";

function LegendItem({ line, label }: { line: LegendLineType; label: string }) {
  const stroke =
    line === "dashed-emerald" ? "rgba(34,197,94,0.6)" :
    line === "dotted-emerald" ? "rgba(34,197,94,0.3)" :
    line === "solid-amber"    ? "#f59e0b" :
    line === "solid-sky"      ? "rgba(56,189,248,0.8)" : "transparent";
  const dash = line === "dashed-emerald" ? "4 3" : line === "dotted-emerald" ? "2 4" : undefined;

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
