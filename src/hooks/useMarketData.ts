"use client";

import { useEffect, useRef, useCallback } from "react";
import { useUIStore } from "@/store/useUIStore";
import type {
  Candle,
  Indicators,
  Prediction,
  AlphaSignal,
  WSMessage,
} from "@/types/market";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";

interface MarketDataCallbacks {
  onCandle?: (candle: Candle) => void;
  onIndicators?: (indicators: Indicators) => void;
  onPrediction?: (prediction: Prediction) => void;
}

export function useMarketData(callbacks: MarketDataCallbacks = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const ticker = useUIStore((s) => s.ticker);
  const timeframe = useUIStore((s) => s.timeframe);
  const setWsConnected = useUIStore((s) => s.setWsConnected);
  const addSignal = useUIStore((s) => s.addSignal);
  const setConfidenceScore = useUIStore((s) => s.setConfidenceScore);

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const connect = useCallback(() => {
    if (!mounted.current) return;

    const encodedTicker = encodeURIComponent(ticker);
    const url = `${WS_BASE}/${encodedTicker}?timeframe=${timeframe}`;

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
            case "indicator":
              callbacksRef.current.onIndicators?.(msg.data as Indicators);
              break;
            case "prediction": {
              const prediction = msg.data as Prediction;
              callbacksRef.current.onPrediction?.(prediction);
              setConfidenceScore(prediction.confidence);
              break;
            }
            case "signal":
              addSignal(msg.data as AlphaSignal);
              break;
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
  }, [ticker, timeframe, setWsConnected, addSignal, setConfidenceScore]);

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
