"""
Lightweight in-process TTL cache.

Uses `cachetools.TTLCache` behind an asyncio-aware wrapper so it can be
awaited without blocking.  For production at scale, swap the backing store
for Redis via `redis.asyncio`.
"""

from __future__ import annotations

import asyncio
from typing import Any, Generic, TypeVar

from cachetools import TTLCache

K = TypeVar("K")
V = TypeVar("V")


class AsyncTTLCache(Generic[K, V]):
    """Thread-safe async wrapper around cachetools.TTLCache."""

    def __init__(self, maxsize: int = 512, ttl: float = 60.0) -> None:
        self._cache: TTLCache[K, V] = TTLCache(maxsize=maxsize, ttl=ttl)
        self._lock = asyncio.Lock()

    async def get(self, key: K) -> V | None:
        async with self._lock:
            return self._cache.get(key)  # type: ignore[return-value]

    async def set(self, key: K, value: V) -> None:
        async with self._lock:
            self._cache[key] = value

    async def delete(self, key: K) -> None:
        async with self._lock:
            self._cache.pop(key, None)

    async def clear(self) -> None:
        async with self._lock:
            self._cache.clear()

    def __len__(self) -> int:
        return len(self._cache)


# ─── Singleton caches (imported directly by services) ─────────────────────────

# OHLCV bars: 30s TTL — short-lived because bars update with each tick
ohlcv_cache: AsyncTTLCache[str, Any] = AsyncTTLCache(maxsize=256, ttl=30.0)

# Indicators: 60s TTL — recomputed per new closed bar
indicator_cache: AsyncTTLCache[str, Any] = AsyncTTLCache(maxsize=256, ttl=60.0)

# Predictions: 120s TTL — expensive to compute, acceptable staleness
prediction_cache: AsyncTTLCache[str, Any] = AsyncTTLCache(maxsize=128, ttl=120.0)
