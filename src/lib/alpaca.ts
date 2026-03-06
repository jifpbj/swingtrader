/** Convert BTC/USD → BTCUSD for Alpaca, leave equities unchanged */
export function toAlpacaSymbol(ticker: string): string {
  return ticker.replace("/", "");
}

/** Crypto symbols contain a slash or end in USD/USDT/USDC */
export function isCrypto(ticker: string): boolean {
  return ticker.includes("/") || /USD[TC]?$/.test(ticker);
}
