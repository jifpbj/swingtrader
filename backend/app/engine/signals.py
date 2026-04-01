"""
Signal Detection — Python port of src/lib/indicators.ts
────────────────────────────────────────────────────────
Detects entry/exit crossover signals from OHLCV candle data.
All functions accept a list of candle dicts and return a list of
CrossoverSignal dicts: {"time": int, "direction": "entry"|"sell", "price": float}

Mirrors the client-side logic exactly so server and browser agree on signals.
"""

from __future__ import annotations

import math
from typing import TypedDict


class CrossoverSignal(TypedDict):
    time: int        # Unix seconds (candle close time)
    direction: str   # "entry" | "sell"
    price: float     # close price at the candle where signal fires


# ─── EMA ─────────────────────────────────────────────────────────────────────

def _compute_ema(closes: list[float], period: int) -> list[float | None]:
    """
    Exponential Moving Average.
    Returns list same length as closes; leading values are None until we
    have enough data.  Matches the TypeScript computeEMA() exactly.
    """
    k = 2.0 / (period + 1.0)
    emas: list[float | None] = [None] * len(closes)
    # Seed with SMA of first `period` candles
    if len(closes) < period:
        return emas
    sma = sum(closes[:period]) / period
    emas[period - 1] = sma
    for i in range(period, len(closes)):
        prev = emas[i - 1]
        if prev is None:
            continue
        emas[i] = closes[i] * k + prev * (1.0 - k)
    return emas


def detect_ema_signals(
    candles: list[dict],
    period: int,
) -> list[CrossoverSignal]:
    """Price vs EMA crossover — mirrors detectCrossovers() in indicators.ts."""
    closes = [c["close"] for c in candles]
    emas = _compute_ema(closes, period)
    signals: list[CrossoverSignal] = []
    for i in range(1, len(candles)):
        e_prev = emas[i - 1]
        e_cur  = emas[i]
        if e_prev is None or e_cur is None:
            continue
        c_prev = closes[i - 1]
        c_cur  = closes[i]
        if c_prev <= e_prev and c_cur > e_cur:
            signals.append({"time": candles[i]["time"], "direction": "entry", "price": c_cur})
        elif c_prev >= e_prev and c_cur < e_cur:
            signals.append({"time": candles[i]["time"], "direction": "sell", "price": c_cur})
    return signals


# ─── RSI ─────────────────────────────────────────────────────────────────────

def _compute_rsi(closes: list[float], period: int) -> list[float | None]:
    """
    Wilder-smoothed RSI.  Mirrors computeRSI() in indicators.ts.
    """
    rsi: list[float | None] = [None] * len(closes)
    if len(closes) < period + 1:
        return rsi

    gains, losses = [], []
    for i in range(1, period + 1):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0.0))
        losses.append(max(-diff, 0.0))

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    for i in range(period, len(closes)):
        if i > period:
            diff = closes[i] - closes[i - 1]
            avg_gain = (avg_gain * (period - 1) + max(diff, 0.0)) / period
            avg_loss = (avg_loss * (period - 1) + max(-diff, 0.0)) / period
        if avg_loss == 0:
            rsi[i] = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi[i] = 100.0 - 100.0 / (1.0 + rs)
    return rsi


def detect_rsi_signals(
    candles: list[dict],
    period: int,
    overbought: float,
    oversold: float,
) -> list[CrossoverSignal]:
    """RSI crosses overbought/oversold — mirrors detectRSICrossovers()."""
    closes = [c["close"] for c in candles]
    rsi_vals = _compute_rsi(closes, period)
    signals: list[CrossoverSignal] = []
    for i in range(1, len(candles)):
        r_prev = rsi_vals[i - 1]
        r_cur  = rsi_vals[i]
        if r_prev is None or r_cur is None:
            continue
        # Entry: RSI was below oversold, now crosses above it (recovery)
        if r_prev <= oversold and r_cur > oversold:
            signals.append({"time": candles[i]["time"], "direction": "entry", "price": closes[i]})
        # Sell: RSI was above overbought, now crosses below it
        elif r_prev >= overbought and r_cur < overbought:
            signals.append({"time": candles[i]["time"], "direction": "sell", "price": closes[i]})
    return signals


# ─── MACD ─────────────────────────────────────────────────────────────────────

def _compute_macd(
    closes: list[float], fast: int, slow: int, signal_period: int
) -> tuple[list[float | None], list[float | None]]:
    """
    Returns (macd_line, signal_line).  Mirrors computeMACDValues().
    """
    ema_fast = _compute_ema(closes, fast)
    ema_slow = _compute_ema(closes, slow)
    macd_line: list[float | None] = []
    for f, s in zip(ema_fast, ema_slow):
        if f is None or s is None:
            macd_line.append(None)
        else:
            macd_line.append(f - s)

    # Signal line = EMA of macd_line values (only non-None)
    # We need to compute EMA inline for the non-None segment
    signal_line: list[float | None] = [None] * len(macd_line)
    non_none_indices = [i for i, v in enumerate(macd_line) if v is not None]
    if len(non_none_indices) < signal_period:
        return macd_line, signal_line

    # Seed
    start = non_none_indices[0]
    macd_valid = [macd_line[i] for i in non_none_indices]
    k = 2.0 / (signal_period + 1.0)
    sma_seed = sum(macd_valid[:signal_period]) / signal_period
    signal_vals: list[float | None] = [None] * len(macd_valid)
    signal_vals[signal_period - 1] = sma_seed
    for j in range(signal_period, len(macd_valid)):
        prev = signal_vals[j - 1]
        if prev is None:
            continue
        signal_vals[j] = macd_valid[j] * k + prev * (1.0 - k)

    for j, orig_i in enumerate(non_none_indices):
        signal_line[orig_i] = signal_vals[j]

    return macd_line, signal_line


def detect_macd_signals(
    candles: list[dict],
    fast: int,
    slow: int,
    signal_period: int,
) -> list[CrossoverSignal]:
    """MACD line vs signal line crossover — mirrors detectMACDCrossovers()."""
    closes = [c["close"] for c in candles]
    macd_line, signal_line = _compute_macd(closes, fast, slow, signal_period)
    signals: list[CrossoverSignal] = []
    for i in range(1, len(candles)):
        m_prev = macd_line[i - 1]
        m_cur  = macd_line[i]
        s_prev = signal_line[i - 1]
        s_cur  = signal_line[i]
        if any(v is None for v in [m_prev, m_cur, s_prev, s_cur]):
            continue
        # Bullish cross: MACD crosses above signal
        if m_prev <= s_prev and m_cur > s_cur:
            signals.append({"time": candles[i]["time"], "direction": "entry", "price": closes[i]})
        # Bearish cross: MACD crosses below signal
        elif m_prev >= s_prev and m_cur < s_cur:
            signals.append({"time": candles[i]["time"], "direction": "sell", "price": closes[i]})
    return signals


# ─── Bollinger Bands ──────────────────────────────────────────────────────────

def detect_bb_signals(
    candles: list[dict],
    period: int,
    std_dev: float,
) -> list[CrossoverSignal]:
    """
    Price re-enters from outside Bollinger Bands.
    Mirrors detectBollingerCrossovers() in indicators.ts.

    Entry: price was below lower band, now rises above it.
    Sell:  price was above upper band, now falls below it.
    """
    closes = [c["close"] for c in candles]
    signals: list[CrossoverSignal] = []
    for i in range(period, len(candles)):
        window = closes[i - period:i]
        mean = sum(window) / period
        variance = sum((x - mean) ** 2 for x in window) / period
        std = math.sqrt(variance)
        upper = mean + std_dev * std
        lower = mean - std_dev * std

        if i < 1:
            continue
        # Need prev window too
        if i < period + 1:
            continue
        prev_window = closes[i - period - 1:i - 1]
        prev_mean = sum(prev_window) / period
        prev_var  = sum((x - prev_mean) ** 2 for x in prev_window) / period
        prev_std  = math.sqrt(prev_var)
        prev_upper = prev_mean + std_dev * prev_std
        prev_lower = prev_mean - std_dev * prev_std

        c_prev = closes[i - 1]
        c_cur  = closes[i]

        # Entry: was below lower, now above lower
        if c_prev < prev_lower and c_cur > lower:
            signals.append({"time": candles[i]["time"], "direction": "entry", "price": c_cur})
        # Sell: was above upper, now below upper
        elif c_prev > prev_upper and c_cur < upper:
            signals.append({"time": candles[i]["time"], "direction": "sell", "price": c_cur})
    return signals


# ─── TD Sequential ────────────────────────────────────────────────────────────

def detect_td9_signals(
    candles: list[dict],
    setup_count: int = 9,
    lookback: int = 4,
) -> list[CrossoverSignal]:
    """
    TD Sequential Setup: 9 consecutive closes each < (or >) the close 4 bars earlier.
    Buy setup (entry): 9 closes each < close[i-4]
    Sell setup (sell): 9 closes each > close[i-4]
    Mirrors detectTDSequentialSetupSignals() in indicators.ts.
    """
    closes = [c["close"] for c in candles]
    signals: list[CrossoverSignal] = []
    buy_count = 0
    sell_count = 0

    for i in range(lookback, len(candles)):
        ref = closes[i - lookback]
        c   = closes[i]
        if c < ref:
            buy_count += 1
            sell_count = 0
        elif c > ref:
            sell_count += 1
            buy_count = 0
        else:
            buy_count = 0
            sell_count = 0

        if buy_count == setup_count:
            signals.append({"time": candles[i]["time"], "direction": "entry", "price": c})
            buy_count = 0
        elif sell_count == setup_count:
            signals.append({"time": candles[i]["time"], "direction": "sell", "price": c})
            sell_count = 0

    return signals


# ─── Dispatcher ───────────────────────────────────────────────────────────────

def detect_signals(candles: list[dict], strategy: dict) -> list[CrossoverSignal]:
    """
    Route to the correct detector based on strategy.indicator and strategy.params.
    Returns an empty list if the indicator is unknown or data is insufficient.
    """
    indicator = strategy.get("indicator", "")
    params    = strategy.get("params", {})

    if indicator == "EMA":
        return detect_ema_signals(candles, int(params["emaPeriod"]))

    if indicator == "RSI":
        return detect_rsi_signals(
            candles,
            int(params["rsiPeriod"]),
            float(params["rsiOverbought"]),
            float(params["rsiOversold"]),
        )

    if indicator == "MACD":
        return detect_macd_signals(
            candles,
            int(params["macdFast"]),
            int(params["macdSlow"]),
            int(params["macdSignal"]),
        )

    if indicator == "BB":
        return detect_bb_signals(
            candles,
            int(params["bbPeriod"]),
            float(params["bbStdDev"]),
        )

    if indicator == "TD9":
        return detect_td9_signals(candles)

    return []
