/**
 * Client-side cache for demo mode base prices.
 * Calls the backend REST API (NEXT_PUBLIC_API_URL) for real prices.
 * Falls back to hardcoded approximations when the API is unavailable (CORS, offline, etc.).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const FALLBACK_PRICES: Record<string, number> = {
  "AAPL":    228,   "MSFT":    415,   "NVDA":    875,
  "TSLA":    255,   "AMZN":    195,   "GOOGL":   175,
  "META":    580,   "AMD":     170,   "NFLX":    700,
  "SPY":     565,   "QQQ":     475,   "PLTR":    85,
  "COIN":    220,   "HOOD":    25,    "ABNB":    145,
  "BTC/USD": 85000, "ETH/USD": 3200,  "SOL/USD": 185,
  "XRP/USD": 2.5,   "BNB/USD": 620,   "DOGE/USD": 0.18,
};

const POPULAR_FALLBACK = [
  "AAPL", "MSFT", "NVDA", "TSLA", "AMZN",
  "GOOGL", "META", "AMD", "NFLX", "SPY",
  "BTC/USD", "ETH/USD", "SOL/USD",
];

interface TickerPrice { ticker: string; price: number }

const priceCache = new Map<string, number>();
let popularCache: TickerPrice[] | null = null;

async function fetchBackendPrice(ticker: string): Promise<number | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(
      `${API_URL}/api/v1/market/price/${encodeURIComponent(ticker)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const json = await res.json() as { price?: number };
    return typeof json.price === "number" && json.price > 0 ? json.price : null;
  } catch {
    return null;
  }
}

export async function getDemoBasePrice(ticker: string): Promise<number> {
  if (priceCache.has(ticker)) return priceCache.get(ticker)!;
  const price =
    (await fetchBackendPrice(ticker)) ??
    FALLBACK_PRICES[ticker] ??
    100;
  priceCache.set(ticker, price);
  return price;
}

export async function getPopularTickers(): Promise<TickerPrice[]> {
  if (popularCache) return popularCache;

  // Try backend popular endpoint
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/api/v1/market/popular`, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const json = await res.json() as Array<{ symbol: string }>;
        if (Array.isArray(json) && json.length > 0) {
          const symbols = json.map((a) => a.symbol);
          // Fetch prices in parallel
          const results = await Promise.all(
            symbols.map(async (t) => ({ ticker: t, price: await getDemoBasePrice(t) }))
          );
          popularCache = results;
          return results;
        }
      }
    } catch { /* fall through */ }
  }

  // Fallback: use hardcoded list with fallback prices
  const results = POPULAR_FALLBACK.map((t) => ({
    ticker: t,
    price: FALLBACK_PRICES[t] ?? 100,
  }));
  popularCache = results;
  return results;
}
