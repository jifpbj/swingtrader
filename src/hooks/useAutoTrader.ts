/**
 * Auto-trading is now handled server-side by the FastAPI scheduler.
 * The backend polls Firestore every 30 s, detects crossover signals, and
 * places orders via Alpaca even when the browser tab is closed.
 *
 * This hook is intentionally a no-op so the import in page.tsx continues
 * to compile without changes.
 */
export function useAutoTrader() {}
