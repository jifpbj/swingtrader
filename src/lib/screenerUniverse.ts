/** Curated universe of liquid US equities + ETFs used by the stock screener. */
export interface UniverseStock {
  symbol: string;
  name: string;
  sector?: string;
}

export const SCREENER_UNIVERSE: UniverseStock[] = [
  // ── Mega-cap tech ────────────────────────────────────────────────
  { symbol: "AAPL",  name: "Apple Inc.",              sector: "Technology" },
  { symbol: "MSFT",  name: "Microsoft Corp.",          sector: "Technology" },
  { symbol: "NVDA",  name: "NVIDIA Corp.",             sector: "Technology" },
  { symbol: "GOOGL", name: "Alphabet Inc.",            sector: "Technology" },
  { symbol: "META",  name: "Meta Platforms",           sector: "Technology" },
  { symbol: "AMZN",  name: "Amazon.com",               sector: "Consumer" },
  { symbol: "TSLA",  name: "Tesla Inc.",               sector: "Consumer" },
  { symbol: "AVGO",  name: "Broadcom Inc.",            sector: "Technology" },
  { symbol: "ORCL",  name: "Oracle Corp.",             sector: "Technology" },
  { symbol: "CRM",   name: "Salesforce Inc.",          sector: "Technology" },
  { symbol: "AMD",   name: "Advanced Micro Devices",   sector: "Technology" },
  { symbol: "INTC",  name: "Intel Corp.",              sector: "Technology" },
  { symbol: "QCOM",  name: "Qualcomm Inc.",            sector: "Technology" },
  { symbol: "MU",    name: "Micron Technology",        sector: "Technology" },
  { symbol: "NET",   name: "Cloudflare Inc.",          sector: "Technology" },
  { symbol: "PLTR",  name: "Palantir Technologies",    sector: "Technology" },
  { symbol: "SNOW",  name: "Snowflake Inc.",           sector: "Technology" },
  { symbol: "NFLX",  name: "Netflix Inc.",             sector: "Technology" },
  { symbol: "UBER",  name: "Uber Technologies",        sector: "Technology" },
  { symbol: "SPOT",  name: "Spotify Technology",       sector: "Technology" },
  // ── Finance ──────────────────────────────────────────────────────
  { symbol: "JPM",   name: "JPMorgan Chase",           sector: "Finance" },
  { symbol: "BAC",   name: "Bank of America",          sector: "Finance" },
  { symbol: "GS",    name: "Goldman Sachs",            sector: "Finance" },
  { symbol: "V",     name: "Visa Inc.",                sector: "Finance" },
  { symbol: "MA",    name: "Mastercard Inc.",          sector: "Finance" },
  { symbol: "COIN",  name: "Coinbase Global",          sector: "Finance" },
  { symbol: "MSTR",  name: "MicroStrategy Inc.",       sector: "Finance" },
  // ── Healthcare ───────────────────────────────────────────────────
  { symbol: "UNH",   name: "UnitedHealth Group",       sector: "Healthcare" },
  { symbol: "LLY",   name: "Eli Lilly & Co.",          sector: "Healthcare" },
  { symbol: "JNJ",   name: "Johnson & Johnson",        sector: "Healthcare" },
  { symbol: "PFE",   name: "Pfizer Inc.",              sector: "Healthcare" },
  { symbol: "ABBV",  name: "AbbVie Inc.",              sector: "Healthcare" },
  { symbol: "MRK",   name: "Merck & Co.",              sector: "Healthcare" },
  { symbol: "MRNA",  name: "Moderna Inc.",             sector: "Healthcare" },
  // ── Energy ───────────────────────────────────────────────────────
  { symbol: "XOM",   name: "ExxonMobil Corp.",         sector: "Energy" },
  { symbol: "CVX",   name: "Chevron Corp.",            sector: "Energy" },
  { symbol: "COP",   name: "ConocoPhillips",           sector: "Energy" },
  // ── Consumer ─────────────────────────────────────────────────────
  { symbol: "WMT",   name: "Walmart Inc.",             sector: "Consumer" },
  { symbol: "COST",  name: "Costco Wholesale",         sector: "Consumer" },
  { symbol: "HD",    name: "Home Depot",               sector: "Consumer" },
  { symbol: "MCD",   name: "McDonald's Corp.",         sector: "Consumer" },
  { symbol: "KO",    name: "Coca-Cola Co.",            sector: "Consumer" },
  { symbol: "DIS",   name: "Walt Disney Co.",          sector: "Consumer" },
  // ── Industrial ───────────────────────────────────────────────────
  { symbol: "CAT",   name: "Caterpillar Inc.",         sector: "Industrial" },
  { symbol: "BA",    name: "Boeing Co.",               sector: "Industrial" },
  { symbol: "GE",    name: "GE Aerospace",             sector: "Industrial" },
  { symbol: "LMT",   name: "Lockheed Martin",          sector: "Industrial" },
  { symbol: "RTX",   name: "RTX Corp.",                sector: "Industrial" },
  // ── High-beta / volatile ─────────────────────────────────────────
  { symbol: "GME",   name: "GameStop Corp.",           sector: "Consumer" },
  { symbol: "AMC",   name: "AMC Entertainment",        sector: "Consumer" },
  { symbol: "RIVN",  name: "Rivian Automotive",        sector: "Consumer" },
  { symbol: "LCID",  name: "Lucid Group",              sector: "Consumer" },
  { symbol: "SOFI",  name: "SoFi Technologies",        sector: "Finance" },
  // ── ETFs ─────────────────────────────────────────────────────────
  { symbol: "SPY",   name: "SPDR S&P 500 ETF",         sector: "ETF" },
  { symbol: "QQQ",   name: "Invesco QQQ Trust",        sector: "ETF" },
  { symbol: "IWM",   name: "iShares Russell 2000",     sector: "ETF" },
  { symbol: "GLD",   name: "SPDR Gold Trust",          sector: "ETF" },
  { symbol: "ARKK",  name: "ARK Innovation ETF",       sector: "ETF" },
  { symbol: "SOXL",  name: "Direxion Semi Bull 3X",    sector: "ETF" },
  { symbol: "TQQQ",  name: "ProShares Ultra QQQ",      sector: "ETF" },
];

/** Stable map from symbol → name for fast lookup */
export const UNIVERSE_MAP = Object.fromEntries(
  SCREENER_UNIVERSE.map((s) => [s.symbol, s]),
);
