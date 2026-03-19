<!--
SYNC IMPACT REPORT
==================
Version change: [TEMPLATE] → 1.0.0 (initial ratification — all placeholders filled)

Modified principles:
  [PRINCIPLE_1_NAME] → I. Mock-First Development
  [PRINCIPLE_2_NAME] → II. Type-Safe Contracts
  [PRINCIPLE_3_NAME] → III. Real-Time First
  [PRINCIPLE_4_NAME] → IV. UI Consistency (NON-NEGOTIABLE)
  [PRINCIPLE_5_NAME] → V. Simplicity & YAGNI

Added sections:
  - Technology Stack Constraints (replaces [SECTION_2_NAME])
  - Development Workflow (replaces [SECTION_3_NAME])

Removed sections: none

Templates reviewed:
  ✅ .specify/templates/plan-template.md — Constitution Check section present; gates now defined
  ✅ .specify/templates/spec-template.md — no constitution-specific tokens; compatible as-is
  ✅ .specify/templates/tasks-template.md — no constitution-specific tokens; compatible as-is

Follow-up TODOs: none — all placeholders resolved
-->

# Predictive Alpha Constitution

## Core Principles

### I. Mock-First Development

Every feature MUST be fully functional under `USE_MOCK_DATA=true` before any real market-data
API integration is attempted. The `MockMarketDataService` (GBM-based) and `useMockData` hook
MUST produce a working, visually complete UI experience with no backend required.

**Rules**:
- New backend services MUST expose a mock implementation alongside the real one.
- New frontend components MUST render correctly when fed mock candles/signals from `useMockData`.
- Integration with Alpaca or any external data source is a separate task, gated behind a passing
  mock-mode demo.

**Rationale**: Decouples UI velocity from API availability. Prevents broken dev environments.
Ensures the dashboard is always demonstrable without credentials.

### II. Type-Safe Contracts

All shared data shapes MUST be defined before implementation begins — TypeScript interfaces in
`src/types/market.ts` (frontend) and Pydantic v2 models in `app/models/schemas.py` (backend).
The two definitions MUST remain structurally consistent; any field rename or type change MUST
update both sides atomically.

**Rules**:
- No `any` types on data flowing through the WebSocket pipeline.
- Pydantic models MUST use explicit field types (no bare `dict` or `Any` for domain objects).
- The TypeScript compiler MUST pass (`tsc --noEmit`) with zero errors before a feature is
  considered complete.

**Rationale**: The frontend and backend evolve in the same repo. Type drift between schemas is
the primary source of runtime bugs that are invisible until the dashboard is live.

### III. Real-Time First

WebSocket streaming (`/ws/trades/{ticker}`) is the primary data delivery channel. UI components
MUST read state from the Zustand store (`useUIStore`), which the WebSocket client populates.
Direct REST polling from components is prohibited except during initial page load hydration.

**Rules**:
- New data types pushed from the backend MUST be added to the `WSMessage` discriminated union
  in `app/models/schemas.py` and handled in `useMarketData.ts`.
- Components MUST NOT call REST endpoints on timers or `setInterval`; subscribe to the store.
- WS auto-reconnect MUST remain active (3 s back-off in `useMarketData`); do not remove it.

**Rationale**: The dashboard's value proposition is live signal delivery. A polling architecture
would introduce latency that undermines the "alpha" narrative and the UX.

### IV. UI Consistency (NON-NEGOTIABLE)

The dashboard MUST maintain the dark zinc/emerald glassmorphism aesthetic at all times.
No light-mode surfaces, no off-palette colors, no inline style overrides that bypass the
Tailwind v4 token system.

**Rules**:
- All new card/panel components MUST use `.glass`, `.glass-sm`, or `.glass-bright` utility
  classes defined in `src/app/globals.css`.
- Trading colors MUST come from CSS vars `--bull` (emerald-500) and `--bear` (red-500);
  never hardcode hex values for semantic trading states.
- Charts MUST use the `lightweight-charts` v5 API (`chart.addSeries(CandlestickSeries, opts)`)
  — the deprecated `addCandlestickSeries()` call is forbidden.
- Icons MUST be sourced from `lucide-react`; do not introduce a second icon library.

**Rationale**: Visual consistency is a product requirement, not a preference. The glassmorphism
style is load-bearing for brand identity. One off-palette component breaks the whole dashboard.

### V. Simplicity & YAGNI

The minimum amount of code that satisfies the current requirement MUST be written. Three similar
lines of code are better than a premature abstraction. Complexity MUST be justified in the
Complexity Tracking table of the implementation plan before it is introduced.

**Rules**:
- No helper utilities for one-time operations.
- No feature flags, backwards-compatibility shims, or dual-mode code paths unless explicitly
  required by a spec.
- New dependencies MUST be approved before `npm install` or `pip install`; prefer extending
  existing libraries (recharts, lucide-react, pandas-ta) over adding new ones.
- Do not add error handling for scenarios that cannot happen at runtime.

**Rationale**: The codebase must stay navigable by a single developer. Over-engineering increases
cognitive load with no corresponding user value.

## Technology Stack Constraints

The following stack is locked. Changes require a constitution amendment (MINOR or MAJOR bump).

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | Next.js 16 App Router + React 19 | `src/` dir layout |
| Language (FE) | TypeScript (strict) | `tsc --noEmit` must pass |
| Styling | Tailwind CSS v4 (`@import "tailwindcss"`) | No CSS modules, no styled-components |
| Charts (price) | lightweight-charts v5 | v5 API only |
| Charts (analysis) | recharts | RadialBar for gauges, BarChart for MACD |
| State | Zustand with `subscribeWithSelector` | `src/store/useUIStore.ts` |
| Data fetching | TanStack Query | `QueryClientProvider` in Providers.tsx |
| Icons | lucide-react | Sole icon library |
| Backend framework | FastAPI 0.115 + uvicorn | Pydantic v2 schemas |
| Backend language | Python 3.11+ | |
| Technical analysis | pandas-ta | No TA-Lib unless amended |
| Logging | structlog (JSON in prod, console in dev) | `get_logger(__name__)` pattern |
| Caching | `AsyncTTLCache` in `app/services/cache.py` | ohlcv 30s, indicator 60s, prediction 120s |

**Run commands** (PATH note: `npx`/`next` bin broken in this env):
- Frontend: `node node_modules/next/dist/bin/next dev`
- Backend: `uvicorn app.main:app --reload` (from `backend/`)
- Type check: `node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`

## Development Workflow

**Feature lifecycle** (enforced by speckit commands):

1. `/speckit.specify` — write spec with user stories and acceptance scenarios.
2. `/speckit.clarify` — resolve ambiguities before planning.
3. `/speckit.plan` — produce `plan.md`, `research.md`, `data-model.md` under `specs/###-feature/`.
4. `/speckit.tasks` — generate `tasks.md` ordered by user story priority.
5. `/speckit.implement` — execute tasks; validate Constitution Check gates before Phase 0.
6. TypeScript check + mock-mode smoke test MUST pass before marking a feature complete.

**Constitution Check gates** (referenced in `plan-template.md`):

| Gate | Principle |
|---|---|
| Mock implementation exists | I. Mock-First |
| Types defined in `src/types/` and `app/models/schemas.py` before code | II. Type-Safe Contracts |
| No component-level REST polling added | III. Real-Time First |
| All new UI uses `.glass*` classes and CSS vars | IV. UI Consistency |
| No new dependency without justification | V. Simplicity |
| `tsc --noEmit` passes | II. Type-Safe Contracts |

**Branching**: feature branches named `###-feature-name`; PRs target `main`.
All PRs MUST pass the Constitution Check gates listed above before merge.

## Governance

This constitution supersedes all other practices, READMEs, or verbal agreements. When a
practice in the codebase contradicts a principle here, the constitution governs and the code
MUST be updated.

**Amendment procedure**:
1. Open a PR that modifies `.specify/memory/constitution.md`.
2. Increment `CONSTITUTION_VERSION` per semantic versioning rules.
3. Run `/speckit.constitution` to propagate changes to dependent templates.
4. Include a migration plan in the PR description for any MAJOR changes (principle removal
   or redefinition that affects in-progress features).

**Versioning policy**:
- MAJOR — principle removed, renamed with incompatible scope, or technology locked in
  Technology Stack Constraints changed.
- MINOR — new principle or section added; material guidance expansion.
- PATCH — wording clarifications, typo fixes, non-semantic refinements.

**Compliance review**: Every implementation plan (`plan.md`) MUST include a Constitution Check
section. The implementing agent MUST verify all gates before Phase 0 research and re-check
after Phase 1 design. Any violation MUST be documented in the Complexity Tracking table with
explicit justification.

**Runtime guidance**: See `MEMORY.md` (auto-memory index) for living project context.

---

**Version**: 1.0.0 | **Ratified**: 2026-03-16 | **Last Amended**: 2026-03-16
