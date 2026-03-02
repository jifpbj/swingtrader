"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import { useMarketData } from "@/hooks/useMarketData";
import { generateMockCandles } from "@/hooks/useMockData";
import type { Candle, Prediction, PredictiveBand } from "@/types/market";
import { Maximize2, EyeOff, Eye, RefreshCw } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { toBackendTf } from "@/lib/timeframeConvert";

// lightweight-charts v5 types
import type {
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
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

const CHART_COLORS = {
  background: "transparent",
  text: "#71717a",
  grid: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.06)",
  crosshair: "rgba(255,255,255,0.2)",
  bull: "#22c55e",
  bear: "#ef4444",
};

function generateMockBands(candles: Candle[]): PredictiveBand[] {
  return candles.slice(-40).map((c) => {
    const halfRange = c.close * (0.008 + Math.random() * 0.012);
    const drift = (Math.random() - 0.48) * c.close * 0.003;
    return {
      time: c.time,
      upperBound: c.close + halfRange + drift,
      lowerBound: c.close - halfRange + drift,
      midpoint: c.close + drift,
      confidence: 0.6 + Math.random() * 0.35,
    };
  });
}

export function ChartContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const upperBandRef = useRef<ISeriesApi<"Line"> | null>(null);
  const lowerBandRef = useRef<ISeriesApi<"Line"> | null>(null);
  const midLineRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [chartReady, setChartReady] = useState(false);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [tooltip, setTooltip] = useState<CandleTooltip | null>(null);

  // Volume lookup by timestamp — lightweight-charts doesn't expose it in crosshair data
  const volumeMapRef = useRef<Map<number, number>>(new Map());

  const ticker = useUIStore((s) => s.ticker);
  const timeframe = useUIStore((s) => s.timeframe);
  const showOverlay = useUIStore((s) => s.showPredictiveOverlay);
  const toggleOverlay = useUIStore((s) => s.togglePredictiveOverlay);

  // ─── Initialize chart ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    let chart: IChartApi;

    import("lightweight-charts").then(async (lc) => {
      if (!containerRef.current) return;

      chart = lc.createChart(containerRef.current, {
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
        },
        handleScroll: true,
        handleScale: true,
      });

      chartRef.current = chart;

      // ─── Candlestick series (v5 API) ────────────────────────────────────────
      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: CHART_COLORS.bull,
        downColor: CHART_COLORS.bear,
        borderUpColor: CHART_COLORS.bull,
        borderDownColor: CHART_COLORS.bear,
        wickUpColor: CHART_COLORS.bull,
        wickDownColor: CHART_COLORS.bear,
      });
      candleSeriesRef.current = candleSeries;

      // ─── Predictive overlay bands ───────────────────────────────────────────
      const upperBand = chart.addSeries(lc.LineSeries, {
        color: "rgba(34, 197, 94, 0.5)",
        lineWidth: 1,
        lineStyle: lc.LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      upperBandRef.current = upperBand;

      const lowerBand = chart.addSeries(lc.LineSeries, {
        color: "rgba(34, 197, 94, 0.5)",
        lineWidth: 1,
        lineStyle: lc.LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      lowerBandRef.current = lowerBand;

      const midLine = chart.addSeries(lc.LineSeries, {
        color: "rgba(34, 197, 94, 0.22)",
        lineWidth: 1,
        lineStyle: lc.LineStyle.SparseDotted,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      midLineRef.current = midLine;

      // ─── Seed historical data (REST API, fallback to mock) ─────────────────
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const backendTf = toBackendTf(timeframe);
      let initialCandles: Candle[] = [];
      try {
        const encodedTicker = encodeURIComponent(ticker);
        const res = await fetch(
          `${apiUrl}/api/v1/market/ohlcv/${encodedTicker}?timeframe=${backendTf}&limit=200`
        );
        if (res.ok) {
          const json = await res.json() as { bars: Candle[] };
          initialCandles = json.bars ?? [];
        }
      } catch {
        // fall through to mock
      }
      if (initialCandles.length < 10) {
        initialCandles = generateMockCandles(200);
      }
      const bands = generateMockBands(initialCandles);

      // Populate volume lookup map
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
        }))
      );

      upperBand.setData(
        bands.map((b) => ({ time: b.time as UTCTimestamp, value: b.upperBound }))
      );
      lowerBand.setData(
        bands.map((b) => ({ time: b.time as UTCTimestamp, value: b.lowerBound }))
      );
      midLine.setData(
        bands.map((b) => ({ time: b.time as UTCTimestamp, value: b.midpoint }))
      );

      chart.timeScale().fitContent();

      // ─── Crosshair tooltip ──────────────────────────────────────────────────
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
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: volumeMapRef.current.get(time) ?? 0,
          time,
        });
      });

      const last = initialCandles[initialCandles.length - 1];
      setLastPrice(last.close);
      setChartReady(true);
    });

    // ─── Resize observer ────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart?.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      upperBandRef.current = null;
      lowerBandRef.current = null;
      midLineRef.current = null;
    };
  }, [ticker]);

  // ─── Toggle predictive overlay visibility ──────────────────────────────────
  useEffect(() => {
    const alpha = showOverlay ? 0.5 : 0;
    upperBandRef.current?.applyOptions({ color: `rgba(34, 197, 94, ${alpha})` });
    lowerBandRef.current?.applyOptions({ color: `rgba(34, 197, 94, ${alpha})` });
    midLineRef.current?.applyOptions({
      color: `rgba(34, 197, 94, ${alpha * 0.44})`,
    });
  }, [showOverlay]);

  // ─── Live candle tick updates ──────────────────────────────────────────────
  const handleCandle = useCallback(
    (candle: Candle) => {
      if (!candleSeriesRef.current) return;

      import("lightweight-charts").then((lc) => {
        if (!candleSeriesRef.current) return;
        candleSeriesRef.current.update({
          time: candle.time as UTCTimestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        });

        volumeMapRef.current.set(candle.time, candle.volume);

        setLastPrice((prev) => {
          if (prev !== null) setPriceChange(candle.close - prev);
          return candle.close;
        });

        // Extend predictive bands into next interval
        if (showOverlay) {
          const halfRange = candle.close * 0.01;
          const nextTime = (candle.time + 15 * 60) as UTCTimestamp;
          upperBandRef.current?.update({ time: nextTime, value: candle.close + halfRange });
          lowerBandRef.current?.update({ time: nextTime, value: candle.close - halfRange });
          midLineRef.current?.update({ time: nextTime, value: candle.close });
        }
      });
    },
    [showOverlay]
  );

  // ─── Live prediction band updates ──────────────────────────────────────────
  const handlePrediction = useCallback(
    (prediction: Prediction) => {
      if (!showOverlay) return;
      import("lightweight-charts").then((lc) => {
        for (const b of prediction.bands) {
          const t = b.time as UTCTimestamp;
          upperBandRef.current?.update({ time: t, value: b.upperBound });
          lowerBandRef.current?.update({ time: t, value: b.lowerBound });
          midLineRef.current?.update({ time: t, value: b.midpoint });
        }
      });
    },
    [showOverlay]
  );

  useMarketData({ onCandle: handleCandle, onPrediction: handlePrediction });

  return (
    <div className="relative flex flex-col h-full tv-chart-container">
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button
          onClick={toggleOverlay}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg glass-sm text-xs font-medium transition-all",
            showOverlay ? "text-emerald-400" : "text-zinc-500"
          )}
        >
          {showOverlay ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          AI Overlay
        </button>

        {!chartReady && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg glass-sm text-xs text-zinc-500">
            <RefreshCw className="size-3.5 animate-spin" />
            Loading
          </div>
        )}

        <button className="p-1.5 rounded-lg glass-sm text-zinc-500 hover:text-white transition-colors">
          <Maximize2 className="size-3.5" />
        </button>
      </div>

      {/* Live price overlay */}
      {lastPrice !== null && (
        <div className="absolute top-3 left-3 z-10 glass-sm rounded-xl px-3 py-2">
          <div
            className={cn(
              "text-xl font-mono font-bold tabular-nums transition-colors duration-300",
              priceChange > 0
                ? "text-emerald-400"
                : priceChange < 0
                ? "text-red-400"
                : "text-white"
            )}
          >
            ${formatPrice(lastPrice)}
          </div>
          <div
            className={cn(
              "text-xs font-mono tabular-nums",
              priceChange >= 0 ? "text-emerald-400/70" : "text-red-400/70"
            )}
          >
            {priceChange >= 0 ? "+" : ""}
            {priceChange.toFixed(2)}
          </div>
        </div>
      )}

      {/* Overlay legend */}
      {showOverlay && (
        <div className="absolute bottom-8 left-3 z-10 flex items-center gap-4 glass-sm px-2.5 py-1.5 rounded-lg">
          <LegendItem line="dashed-emerald" label="AI Predicted Range" />
          <LegendItem line="dotted-emerald" label="AI Midpoint" />
        </div>
      )}

      {/* OHLCV hover tooltip */}
      {tooltip && containerRef.current && (
        <CandleTooltipPopup
          tooltip={tooltip}
          containerWidth={containerRef.current.clientWidth}
        />
      )}

      {/* Chart mount */}
      <div ref={containerRef} className="flex-1 w-full" />
    </div>
  );
}

const TOOLTIP_W = 180;
const TOOLTIP_OFFSET = 16;

function CandleTooltipPopup({
  tooltip,
  containerWidth,
}: {
  tooltip: CandleTooltip;
  containerWidth: number;
}) {
  const isUp = tooltip.close >= tooltip.open;
  const change = tooltip.close - tooltip.open;
  const changePct = (change / tooltip.open) * 100;

  // Flip to left side when near right edge
  const flipLeft = tooltip.x + TOOLTIP_W + TOOLTIP_OFFSET > containerWidth;
  const left = flipLeft
    ? tooltip.x - TOOLTIP_W - TOOLTIP_OFFSET
    : tooltip.x + TOOLTIP_OFFSET;

  const date = new Date(tooltip.time * 1000);
  const dateStr = date.toLocaleString("en-US", {
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
      <div className="glass-bright rounded-xl px-3 py-2.5 flex flex-col gap-1.5 shadow-2xl border border-white/10"
        style={{ width: TOOLTIP_W }}>
        {/* Timestamp + direction badge */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-zinc-500 font-mono">{dateStr}</span>
          <span
            className={cn(
              "text-[9px] font-bold px-1.5 py-0.5 rounded",
              isUp
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-red-500/20 text-red-400"
            )}
          >
            {isUp ? "▲" : "▼"} {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
          </span>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/5" />

        {/* OHLC rows */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <OHLCRow label="O" value={tooltip.open} color="text-zinc-300" />
          <OHLCRow label="H" value={tooltip.high} color="text-emerald-400" />
          <OHLCRow label="L" value={tooltip.low}  color="text-red-400" />
          <OHLCRow
            label="C"
            value={tooltip.close}
            color={isUp ? "text-emerald-400" : "text-red-400"}
            bold
          />
        </div>

        {/* Divider */}
        <div className="h-px bg-white/5" />

        {/* Volume */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500">Vol</span>
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
          bold && "font-semibold"
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

function LegendItem({
  line,
  label,
}: {
  line: "dashed-emerald" | "dotted-emerald";
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
      <svg width="20" height="8" viewBox="0 0 20 8">
        {line === "dashed-emerald" ? (
          <line
            x1="0" y1="4" x2="20" y2="4"
            stroke="rgba(34,197,94,0.6)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        ) : (
          <line
            x1="0" y1="4" x2="20" y2="4"
            stroke="rgba(34,197,94,0.3)"
            strokeWidth="1.5"
            strokeDasharray="2 4"
          />
        )}
      </svg>
      {label}
    </div>
  );
}
