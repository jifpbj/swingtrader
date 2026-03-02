import type { Timeframe } from "@/types/market";

/** Frontend Timeframe → backend Timeframe enum value (e.g. "15m" → "15Min") */
export const BACKEND_TF: Record<Timeframe, string> = {
  "1m":  "1Min",
  "5m":  "5Min",
  "15m": "15Min",
  "1h":  "1Hour",
  "4h":  "4Hour",
  "1d":  "1Day",
};

/** Backend Timeframe enum value → frontend Timeframe (e.g. "15Min" → "15m") */
export const FRONTEND_TF: Record<string, Timeframe> = {
  "1Min":  "1m",
  "5Min":  "5m",
  "15Min": "15m",
  "1Hour": "1h",
  "4Hour": "4h",
  "1Day":  "1d",
};

export function toBackendTf(tf: Timeframe): string {
  return BACKEND_TF[tf] ?? "15Min";
}

export function toFrontendTf(tf: string): Timeframe {
  return FRONTEND_TF[tf] ?? "15m";
}
