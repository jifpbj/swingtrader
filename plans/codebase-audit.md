# Codebase Audit: Security, Architecture & Code Quality

## Context
Comprehensive audit of the Predict Alpha trading dashboard — a Next.js 16 + FastAPI full-stack application with real-money trading capabilities (Alpaca broker integration, Stripe payments). The stakes are high: security flaws here could lead to unauthorized trades, financial data exposure, or account takeover.

---

## CRITICAL — Security Flaws

### 1. Broker endpoints accept unverified `X-User-Id` header
- **File:** `backend/app/api/routes/broker.py` — all endpoints use `X-User-Id: str = Header(...)` with NO token verification
- **Impact:** Any client can impersonate any user — create broker accounts, initiate ACH transfers, place trades on their behalf
- **Fix:** Add Firebase token verification middleware. Extract UID from verified token instead of trusting the header.

### 2. No authentication on market data endpoints
- **File:** `backend/app/api/routes/market.py` — all GET endpoints are fully public
- **Impact:** Anyone can consume your market data API (which costs you Alpaca API quota). If signals/predictions are a paid feature, they're freely accessible.
- **Fix:** Add auth middleware for premium endpoints (signals, predictions, regime). Consider keeping price/OHLCV public.

### 3. No rate limiting anywhere
- **Files:** All backend route files, no `slowapi` or equivalent
- **Impact:** DoS via spamming `/api/v1/market/search`, API quota exhaustion on Alpaca, unlimited WebSocket connections
- **Fix:** Add `slowapi` with per-IP and per-user rate limits. Add connection limits on WebSocket endpoint.

### 4. WebSocket endpoint has no authentication
- **File:** `backend/app/api/routes/websocket.py:276` — `await websocket.accept()` with no auth check
- **Fix:** Require token in query params or first message, verify before accepting.

### 5. CORS defaults to `["*"]`
- **File:** `backend/app/core/config.py:82-87` — fallback is `return ["*"]` when `CORS_ORIGINS` env not set
- **Fix:** Set explicit origins in production `.env`. Change default to empty list (deny all) to fail safe.

### 6. API keys stored in localStorage (frontend)
- **File:** `src/store/useAlpacaStore.ts:414-420` — Zustand persist stores Alpaca API keys in plaintext localStorage
- **Impact:** Any XSS vulnerability = full credential theft
- **Fix:** Store keys server-side in Firestore (encrypted at rest), use Firebase auth tokens to authorize trading requests.

### 7. Error responses leak internal details
- **Files:** `backend/app/api/routes/trading.py:111`, `broker.py:98`, `payments.py:247`
- **Issue:** `detail=f"Failed to fetch OHLCV for {ticker}: {exc}"` exposes exception internals
- **Fix:** Log detailed errors internally, return generic messages to client.

### 8. Input validation gaps
- **File:** `backend/app/api/routes/market.py` — ticker param uses `{ticker:path}` with no regex validation
- **Fix:** Add regex validator: `^[A-Z0-9]{1,10}(/[A-Z]{3,4})?$`

---

## HIGH — Architecture Issues

### 9. No test infrastructure
- **Frontend:** 83 TSX files, zero tests, no test runner installed
- **Backend:** pytest installed but only 1 manual test script, no conftest.py
- **Risk:** Every deploy is a gamble, especially for trading logic and data normalization
- **Fix:** Add vitest + testing-library for frontend. Organize pytest with conftest, add tests for critical paths (data normalization, signal generation, cache logic).

### 10. WebSocket messages not validated on frontend
- **File:** `src/hooks/useMarketData.ts:128-153` — casts `msg.data as Candle` without runtime validation
- **Risk:** Malformed backend data silently corrupts UI state
- **Fix:** Add zod schemas for WS message validation.

### 11. In-process cache won't scale
- **File:** `backend/app/services/cache.py` — `AsyncTTLCache` using `cachetools.TTLCache`
- **Issue:** Each Cloud Run instance has its own cache. No invalidation hooks, no hit/miss metrics.
- **Fix:** Acceptable for now (single instance), but plan Redis migration. Add cache metrics.

### 12. Tightly coupled auth store
- **File:** `src/store/useAuthStore.ts` — imports and orchestrates 4 other stores directly
- **Fix:** Consider event-based decoupling (Zustand subscribe or custom event bus).

---

## MEDIUM — Code Quality & Refactoring

### 13. ChartContainer is too large and lacks memoization
- **File:** `src/components/trading/ChartContainer.tsx`
- **Fix:** Extract indicator computation into a custom hook. Add `useMemo`/`useCallback` for expensive operations.

### 14. Duplicated timeframe conversion
- **File:** `src/hooks/useSignalBackfill.ts:13-19` has manual Record map instead of importing from `src/lib/timeframeConvert.ts`
- **Fix:** Use the existing centralized converter.

### 15. Silent error swallowing
- Multiple stores: `.catch(() => {})` in ~8 places
- **Fix:** At minimum log to console.error; ideally integrate Sentry/error monitoring.

### 16. Dead code
- **File:** `src/hooks/useAutoTrader.ts` — empty function kept for "backwards compatibility"
- **Fix:** Remove if nothing imports it, or remove the import.

### 17. No frontend error boundaries per feature
- Root-level `error.tsx` and `global-error.tsx` exist, but no granular boundaries
- **Fix:** Wrap ChartContainer and WebSocket consumers in error boundaries.

### 18. WebSocket reconnection uses fixed delay
- **File:** `src/hooks/useMarketData.ts:166,172` — always 3s/5s retry, no exponential backoff, no max retries
- **Fix:** Implement exponential backoff with jitter and a max retry cap.

### 19. Package name inconsistency
- `package.json` says `"predictive-alpha"` but project rebranded to "Predict Alpha"
- **Fix:** Update package.json name.

---

## LOW — Nice to Have

### 20. No frontend logging/monitoring (no Sentry, LogRocket)
### 21. Firestore rules don't validate subscription tier
### 22. No deployment/troubleshooting docs
### 23. Backend has no mypy/pyright type checking in CI
### 24. Hardcoded prod URLs at frontend build time (can't switch backends without rebuild)

---

## Verification Plan

After implementing fixes:
1. **Auth:** Test broker endpoints with invalid/missing/forged tokens — should return 401
2. **Rate limiting:** Load test with `hey` or `wrk` — should see 429 responses
3. **Input validation:** Send malformed tickers (`../etc/passwd`, `<script>`) — should get 422
4. **WebSocket:** Connect without auth token — should get close code 4001
5. **Frontend:** Corrupt a WS message payload — UI should not crash
6. **CORS:** Make cross-origin request from unauthorized domain — should be blocked
7. **Tests:** `npx vitest run` and `pytest` should pass with >50% coverage on critical paths
