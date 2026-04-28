# System Overview

C4 context diagram — Predictive Alpha platform.

```mermaid
graph TB
    subgraph Client["Browser / Mobile"]
        FE["Next.js 16 Frontend<br/>React 19 · Zustand · TanStack Query"]
    end

    subgraph GCP["Google Cloud Platform"]
        subgraph Firebase["Firebase"]
            AUTH["Firebase Auth<br/>ID token issuer"]
            FS["Cloud Firestore<br/>User config · Subscription state"]
            HOST["Firebase Hosting<br/>CDN-served Next.js bundle"]
        end

        subgraph CloudRun["Cloud Run (us-west1)"]
            API["FastAPI Backend<br/>Python 3.11 · Uvicorn"]
        end

        SM["Secret Manager<br/>Alpaca / Stripe / Resend keys"]
        AR["Artifact Registry<br/>Docker images"]
        CL["Cloud Logging<br/>structlog JSON + OTel traces"]
    end

    subgraph External["External APIs"]
        ALPACA["Alpaca Markets<br/>OHLCV REST + WS"]
        YF["Yahoo Finance<br/>Historical fallback"]
        STRIPE["Stripe<br/>Subscription billing"]
        RESEND["Resend<br/>Email notifications"]
    end

    FE -- "HTTPS REST /api/v1/*" --> API
    FE -- "WSS /ws/trades/{ticker}" --> API
    FE -- "Auth sign-in/out" --> AUTH
    FE -- "Static assets" --> HOST

    API -- "Verify Firebase ID token" --> AUTH
    API -- "Read/write user data" --> FS
    API -- "Fetch OHLCV bars" --> ALPACA
    API -- "Historical OHLCV" --> YF
    API -- "Stripe webhook verify" --> STRIPE
    API -- "Send emails" --> RESEND
    API -- "Read secrets at startup" --> SM
    API -- "Emit structured logs + spans" --> CL

    AR -- "Pull image at deploy" --> CloudRun
```

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Compute | Cloud Run (serverless) | Zero-ops scaling; no idle cost; instant revision rollback |
| Auth | Firebase ID tokens | Managed OAuth; row-level Firestore rules tied to UID |
| Database | Firestore | Schemaless user config; no migration overhead; owner-only ACL built-in |
| Secrets | Secret Manager | Injected at deploy time; zero code changes to rotate |
| Caching | In-process TTLCache | Sufficient for single-instance; Redis path documented for scale-out |
| WS registry | In-memory dict | Correct for Cloud Run single-process; Redis pub/sub for multi-instance |
