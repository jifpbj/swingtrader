"use client";

import { useEffect, useRef, useCallback } from "react";
import { auth } from "@/lib/firebase";
import { useUIStore } from "@/store/useUIStore";
import type {
  Candle,
  Indicators,
  Prediction,
  AlphaSignal,
  PredictiveBand,
  SignalDirection,
  SignalStrength,
  Timeframe,
  WSMessage,
} from "@/types/market";
import { toBackendTf, toFrontendTf } from "@/lib/timeframeConvert";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws/trades";

// ─── Schema normalisers ────────────────────────────────────────────────────────

// Backend TechnicalIndicators → frontend Indicators
// Backend shape: { rsi, macd: {macd, signal, histogram}, atr, trend_strength,
//                  volume_sma, volume_ratio, price, ema_20, ema_50, ... }
function normalizeIndicators(raw: Record<string, unknown>): Indicators {
  const macdObj = raw.macd as { macd: number; signal: number; histogram: number };
  const price = (raw.price as number) ?? 1;
  const volumeSma = (raw.volume_sma as number) ?? 0;
  const volumeRatio = (raw.volume_ratio as number) ?? 1;
  return {
    rsi: raw.rsi as number,
    macd: macdObj.macd,
    macdSignal: macdObj.signal,
    macdHistogram: macdObj.histogram,
    regimeScore: raw.trend_strength as number, // both -1 to 1
    atr: raw.atr as number,
    // Approximate 24h USDT volume from per-bar volume SMA × bars/day × price
    volume24h: volumeSma * volumeRatio * 96 * price,
  };
}

// Backend PriceProbabilityForecast → frontend Prediction
// Backend: snake_case; bands use upper_bound / lower_bound
function normalizePrediction(raw: Record<string, unknown>): Prediction {
  const rawBands = (raw.bands as Array<Record<string, unknown>>) ?? [];
  const bands: PredictiveBand[] = rawBands.map((b) => ({
    time: b.time as number,
    upperBound: b.upper_bound as number,
    lowerBound: b.lower_bound as number,
    midpoint: b.midpoint as number,
    confidence: b.confidence as number,
  }));
  return {
    ticker: raw.ticker as string,
    timeframe: toFrontendTf(raw.timeframe as string),
    confidence: raw.confidence as number,
    direction: raw.direction as SignalDirection,
    targetPrice: raw.target_price as number,
    targetTime: raw.target_time as number,
    probabilityUp: raw.probability_up as number,
    probabilityDown: raw.probability_down as number,
    bands,
  };
}

// Backend AlphaSignal → frontend AlphaSignal (timeframe format)
function normalizeSignal(raw: Record<string, unknown>): AlphaSignal {
  return {
    id: raw.id as string,
    timestamp: raw.timestamp as number,
    ticker: raw.ticker as string,
    timeframe: toFrontendTf(raw.timeframe as string),
    direction: raw.direction as SignalDirection,
    strength: raw.strength as SignalStrength,
    title: raw.title as string,
    description: raw.description as string,
    confidence: raw.confidence as number,
    price: raw.price as number,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface MarketDataCallbacks {
  onCandle?: (candle: Candle) => void;
  onIndicators?: (indicators: Indicators) => void;
  onPrediction?: (prediction: Prediction) => void;
}

export function useMarketData(callbacks: MarketDataCallbacks = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const demoMode = useUIStore((s) => s.demoMode);
  const ticker = useUIStore((s) => s.ticker);
  const timeframe = useUIStore((s) => s.timeframe);
  const setWsConnected = useUIStore((s) => s.setWsConnected);
  const addSignal = useUIStore((s) => s.addSignal);
  const setConfidenceScore = useUIStore((s) => s.setConfidenceScore);
  const setIndicators = useUIStore((s) => s.setIndicators);
  const setPrediction = useUIStore((s) => s.setPrediction);

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const connect = useCallback(async () => {
    if (!mounted.current) return;
    if (demoMode) return; // demo mode — mock data hook handles all updates

    // Obtain a fresh Firebase ID token for WS auth
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) {
      // Not signed in — skip WS connection, retry later
      if (mounted.current) {
        reconnectTimer.current = setTimeout(connect, 5000);
      }
      return;
    }

    const encodedTicker = encodeURIComponent(ticker);
    const backendTf = toBackendTf(timeframe);
    const url = `${WS_BASE}/${encodedTicker}?timeframe=${backendTf}&token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mounted.current) { ws.close(); return; }
        setWsConnected(true);
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      };

      ws.onmessage = (event) => {
        if (!mounted.current) return;
        try {
          const msg: WSMessage = JSON.parse(event.data as string);
          switch (msg.type) {
            case "candle":
              callbacksRef.current.onCandle?.(msg.data as Candle);
              break;
            case "indicator": {
              const indicators = normalizeIndicators(msg.data as Record<string, unknown>);
              setIndicators(indicators);
              callbacksRef.current.onIndicators?.(indicators);
              break;
            }
            case "prediction": {
              const prediction = normalizePrediction(msg.data as Record<string, unknown>);
              setPrediction(prediction);
              setConfidenceScore(prediction.confidence);
              callbacksRef.current.onPrediction?.(prediction);
              break;
            }
            case "signal": {
              const signal = normalizeSignal(msg.data as Record<string, unknown>);
              addSignal(signal);
              break;
            }
            default:
              break;
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (mounted.current) {
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };
    } catch {
      setWsConnected(false);
      if (mounted.current) {
        reconnectTimer.current = setTimeout(connect, 5000);
      }
    }
  }, [demoMode, ticker, timeframe, setWsConnected, addSignal, setConfidenceScore, setIndicators, setPrediction]);

  useEffect(() => {
    mounted.current = true;
    connect();

    return () => {
      mounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}
