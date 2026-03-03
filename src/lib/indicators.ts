import type {
  Candle,
  CrossoverSignal,
  BacktestPeriodKey,
  BacktestPeriodResult,
  BacktestResult,
} from "@/types/market";

export interface BollingerPoint {
  time: number;
  upper: number;
  middle: number;
  lower: number;
}

export function computeBollingerBands(
  candles: Candle[],
  period: number,
  stdDevMultiplier: number
): BollingerPoint[] {
  const result: BollingerPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, c) => s + c.close, 0) / period;
    const variance = slice.reduce((s, c) => s + (c.close - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    result.push({
      time: candles[i].time,
      upper: mean + stdDevMultiplier * std,
      middle: mean,
      lower: mean - stdDevMultiplier * std,
    });
  }
  return result;
}

// Returns array same length as closes; first (period-1) entries are null
export function computeEMA(closes: number[], period: number): (number | null)[] {
  if (closes.length === 0 || period < 1) return closes.map(() => null);

  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period) return result;

  const k = 2 / (period + 1);

  // Seed with SMA of first `period` closes
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  result[period - 1] = sum / period;

  for (let i = period; i < closes.length; i++) {
    result[i] = closes[i] * k + (result[i - 1] as number) * (1 - k);
  }
  return result;
}

// Detects price-crosses-EMA events; candles and emas are index-aligned
export function detectCrossovers(
  candles: Candle[],
  emas: (number | null)[]
): CrossoverSignal[] {
  const signals: CrossoverSignal[] = [];
  for (let i = 1; i < candles.length; i++) {
    const ema0 = emas[i - 1];
    const ema1 = emas[i];
    if (ema0 === null || ema1 === null) continue;

    const prevAbove = candles[i - 1].close > ema0;
    const currAbove = candles[i].close > ema1;

    if (!prevAbove && currAbove) {
      signals.push({ time: candles[i].time, direction: "entry", price: candles[i].close });
    } else if (prevAbove && !currAbove) {
      signals.push({ time: candles[i].time, direction: "sell", price: candles[i].close });
    }
  }
  return signals;
}

// ─── RSI (Wilder's smoothed) ──────────────────────────────────────────────────
export function computeRSI(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

export function detectRSICrossovers(
  candles: Candle[],
  rsi: (number | null)[],
  overbought: number,
  oversold: number
): CrossoverSignal[] {
  const signals: CrossoverSignal[] = [];
  for (let i = 1; i < candles.length; i++) {
    if (rsi[i - 1] === null || rsi[i] === null) continue;
    const prev = rsi[i - 1]!;
    const curr = rsi[i]!;
    if (prev <= oversold && curr > oversold)   signals.push({ time: candles[i].time, direction: "entry", price: candles[i].close });
    if (prev >= overbought && curr < overbought) signals.push({ time: candles[i].time, direction: "sell",  price: candles[i].close });
  }
  return signals;
}

// ─── MACD ─────────────────────────────────────────────────────────────────────
export interface MACDPoint { macd: number | null; signal: number | null; }

export function computeMACDValues(
  closes: number[], fast: number, slow: number, signalPeriod: number
): MACDPoint[] {
  const fastEMA = computeEMA(closes, fast);
  const slowEMA = computeEMA(closes, slow);
  const macdLine: (number | null)[] = closes.map((_, i) =>
    fastEMA[i] !== null && slowEMA[i] !== null ? fastEMA[i]! - slowEMA[i]! : null
  );

  // Signal = EMA of macd line, seeded from first non-null MACD value
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  const first = macdLine.findIndex(v => v !== null);
  if (first !== -1 && first + signalPeriod - 1 < closes.length) {
    const k = 2 / (signalPeriod + 1);
    let sum = 0;
    for (let i = 0; i < signalPeriod; i++) sum += macdLine[first + i]!;
    signalLine[first + signalPeriod - 1] = sum / signalPeriod;
    for (let i = first + signalPeriod; i < closes.length; i++) {
      signalLine[i] = macdLine[i]! * k + signalLine[i - 1]! * (1 - k);
    }
  }
  return closes.map((_, i) => ({ macd: macdLine[i], signal: signalLine[i] }));
}

export function detectMACDCrossovers(candles: Candle[], macd: MACDPoint[]): CrossoverSignal[] {
  const signals: CrossoverSignal[] = [];
  for (let i = 1; i < candles.length; i++) {
    const p = macd[i - 1], c = macd[i];
    if (p.macd === null || p.signal === null || c.macd === null || c.signal === null) continue;
    if (p.macd <= p.signal && c.macd > c.signal) signals.push({ time: candles[i].time, direction: "entry", price: candles[i].close });
    if (p.macd >= p.signal && c.macd < c.signal) signals.push({ time: candles[i].time, direction: "sell",  price: candles[i].close });
  }
  return signals;
}

// ─── Bollinger signal helper (mean reversion flavor) ────────────────────────
export function detectBollingerCrossovers(
  candles: Candle[],
  period: number,
  stdDevMultiplier: number
): CrossoverSignal[] {
  const signals: CrossoverSignal[] = [];
  const bands = computeBollingerBands(candles, period, stdDevMultiplier);
  if (bands.length < 2) return signals;

  // bands[j] corresponds to candles[j + period - 1]
  for (let j = 1; j < bands.length; j++) {
    const prevBand = bands[j - 1];
    const currBand = bands[j];
    const prevCandle = candles[j + period - 2];
    const currCandle = candles[j + period - 1];

    // Entry when price re-enters from below lower band.
    if (prevCandle.close < prevBand.lower && currCandle.close >= currBand.lower) {
      signals.push({ time: currCandle.time, direction: "entry", price: currCandle.close });
      continue;
    }

    // Exit when price re-enters from above upper band.
    if (prevCandle.close > prevBand.upper && currCandle.close <= currBand.upper) {
      signals.push({ time: currCandle.time, direction: "sell", price: currCandle.close });
    }
  }

  return signals;
}

// ─── Tom DeMark TD Sequential (Setup 1–9) ────────────────────────────────────
export interface TDSequentialPoint {
  time: number;
  buySetup: number | null;  // 1..9 while active, else null
  sellSetup: number | null; // 1..9 while active, else null
}

/**
 * TD Sequential "Setup" counts.
 * - Buy setup increments when close < close[lookback] (default lookback=4)
 * - Sell setup increments when close > close[lookback]
 * Counts reset to 0 when condition breaks; values are capped at `maxCount` (default 9).
 */
export function computeTDSequentialSetup(
  candles: Candle[],
  lookback: number = 4,
  maxCount: number = 9
): TDSequentialPoint[] {
  const out: TDSequentialPoint[] = candles.map((c) => ({
    time: c.time,
    buySetup: null,
    sellSetup: null,
  }));

  if (candles.length === 0 || lookback < 1 || maxCount < 1) return out;

  let buy = 0;
  let sell = 0;

  for (let i = 0; i < candles.length; i++) {
    if (i < lookback) continue;

    const close = candles[i].close;
    const prev = candles[i - lookback].close;

    if (close < prev) {
      buy = Math.min(buy + 1, maxCount);
      sell = 0;
    } else if (close > prev) {
      sell = Math.min(sell + 1, maxCount);
      buy = 0;
    } else {
      buy = 0;
      sell = 0;
    }

    out[i].buySetup = buy > 0 ? buy : null;
    out[i].sellSetup = sell > 0 ? sell : null;
  }

  return out;
}

/**
 * Convenience: emits a signal when a setup completes (hits `setupCount`, default 9).
 * - Buy setup completion => direction "entry"
 * - Sell setup completion => direction "sell"
 */
export function detectTDSequentialSetupSignals(
  candles: Candle[],
  setupCount: number = 9,
  lookback: number = 4
): CrossoverSignal[] {
  const points = computeTDSequentialSetup(candles, lookback, setupCount);
  const signals: CrossoverSignal[] = [];

  for (let i = 0; i < candles.length; i++) {
    const p = points[i];
    if (p.buySetup === setupCount) {
      const prev = i > 0 ? points[i - 1].buySetup : null;
      if (prev !== setupCount) signals.push({ time: candles[i].time, direction: "entry", price: candles[i].close });
    } else if (p.sellSetup === setupCount) {
      const prev = i > 0 ? points[i - 1].sellSetup : null;
      if (prev !== setupCount) signals.push({ time: candles[i].time, direction: "sell", price: candles[i].close });
    }
  }

  return signals;
}

function zeroResult(): BacktestPeriodResult {
  return {
    strategyReturn: 0,
    holdReturn: 0,
    tradeCount: 0,
    winRate: 0,
    maxDrawdown: 0,
  };
}

// Bar-by-bar marked-to-market simulation of long-only strategy.
function runLongOnlyBacktest(
  slice: Candle[],
  signals: CrossoverSignal[]
): BacktestPeriodResult {
  if (slice.length < 2) return zeroResult();

  const orderedSignals = [...signals].sort((a, b) => a.time - b.time);
  let signalIdx = 0;
  let inTrade = false;
  let entryPrice = 0;
  let cash = 1;
  let units = 0;
  const gains: number[] = [];

  let peak = 1;
  let maxDrawdown = 0;

  for (const candle of slice) {
    while (signalIdx < orderedSignals.length && orderedSignals[signalIdx].time <= candle.time) {
      const sig = orderedSignals[signalIdx];
      if (sig.direction === "entry" && !inTrade) {
        inTrade = true;
        entryPrice = sig.price;
        units = cash / sig.price;
        cash = 0;
      } else if (sig.direction === "sell" && inTrade) {
        cash = units * sig.price;
        units = 0;
        gains.push((sig.price - entryPrice) / entryPrice);
        inTrade = false;
      }
      signalIdx += 1;
    }

    const equity = inTrade ? units * candle.close : cash;
    if (equity > peak) peak = equity;
    const dd = (equity - peak) / peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  if (inTrade) {
    const lastClose = slice[slice.length - 1].close;
    cash = units * lastClose;
    gains.push((lastClose - entryPrice) / entryPrice);
  }

  const tradeCount = gains.length;
  const wins = gains.filter((g) => g > 0).length;

  return {
    strategyReturn: cash - 1,
    holdReturn: (slice[slice.length - 1].close / slice[0].close) - 1,
    tradeCount,
    winRate: tradeCount === 0 ? 0 : wins / tradeCount,
    maxDrawdown,
  };
}

// Simulates long-only EMA crossover strategy from fromTimestamp onwards.
function runBacktest(
  candles: Candle[],
  period: number,
  fromTimestamp: number
): BacktestPeriodResult {
  const slice = candles.filter((c) => c.time >= fromTimestamp);
  if (slice.length < period) return zeroResult();

  const emas = computeEMA(slice.map((c) => c.close), period);
  const crossovers = detectCrossovers(slice, emas);
  return runLongOnlyBacktest(slice, crossovers);
}

function runSignalBacktest(
  candles: Candle[],
  fromTimestamp: number,
  buildSignals: (slice: Candle[]) => CrossoverSignal[]
): BacktestPeriodResult {
  const slice = candles.filter((c) => c.time >= fromTimestamp);
  if (slice.length < 2) return zeroResult();
  return runLongOnlyBacktest(slice, buildSignals(slice));
}

export type BacktestStrategy = "EMA" | "RSI" | "MACD" | "TD9" | "BB";

export function computeStrategyBacktests(
  candles: Candle[],
  strategy: BacktestStrategy,
  ticker: string,
  params: {
    emaPeriod: number;
    bbPeriod: number;
    bbStdDev: number;
    rsiPeriod: number;
    rsiOverbought: number;
    rsiOversold: number;
    macdFast: number;
    macdSlow: number;
    macdSignal: number;
  }
): BacktestResult {
  const now = Math.floor(Date.now() / 1000);
  const endTimestamp = candles[candles.length - 1]?.time ?? now;
  const endYear = new Date(endTimestamp * 1000).getUTCFullYear();

  const periodStarts: Record<BacktestPeriodKey, number> = {
    "1M":  endTimestamp - 21 * 86400,
    "6M":  endTimestamp - 126 * 86400,
    "YTD": Math.floor(Date.UTC(endYear, 0, 1) / 1000),
    "1Y":  endTimestamp - 252 * 86400,
  };

  const periods = {} as Record<BacktestPeriodKey, BacktestPeriodResult>;

  const buildSignals = (slice: Candle[]): CrossoverSignal[] => {
    const closes = slice.map((c) => c.close);
    switch (strategy) {
      case "EMA": {
        const emas = computeEMA(closes, params.emaPeriod);
        return detectCrossovers(slice, emas);
      }
      case "RSI": {
        const rsi = computeRSI(closes, params.rsiPeriod);
        return detectRSICrossovers(slice, rsi, params.rsiOverbought, params.rsiOversold);
      }
      case "MACD": {
        const macd = computeMACDValues(closes, params.macdFast, params.macdSlow, params.macdSignal);
        return detectMACDCrossovers(slice, macd);
      }
      case "TD9":
        return detectTDSequentialSetupSignals(slice, 9, 4);
      case "BB":
        return detectBollingerCrossovers(slice, params.bbPeriod, params.bbStdDev);
    }
  };

  for (const key of ["1M", "6M", "YTD", "1Y"] as BacktestPeriodKey[]) {
    // Keep EMA behavior requiring enough bars for the EMA period; other strategies just need 2+ bars.
    if (strategy === "EMA") periods[key] = runBacktest(candles, params.emaPeriod, periodStarts[key]);
    else periods[key] = runSignalBacktest(candles, periodStarts[key], buildSignals);
  }

  const strategyLabel =
    strategy === "EMA"  ? `EMA(${params.emaPeriod})` :
    strategy === "BB"   ? `BB(${params.bbPeriod}, ${params.bbStdDev})` :
    strategy === "RSI"  ? `RSI(${params.rsiPeriod})` :
    strategy === "MACD" ? `MACD(${params.macdFast},${params.macdSlow},${params.macdSignal})` :
    "TD Sequential 9";

  return { ticker, strategyLabel, periods };
}

// Backwards-compatible wrapper (EMA)
export function computeAllBacktests(
  candles: Candle[],
  period: number,
  ticker: string
): BacktestResult {
  return computeStrategyBacktests(candles, "EMA", ticker, {
    emaPeriod: period,
    bbPeriod: 20,
    bbStdDev: 2,
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
  });
}
