# CI/CD Pipeline

```mermaid
flowchart TD
    DEV["Developer pushes code"] --> TRIGGER

    subgraph STAGING["Staging — auto on push to main"]
        TRIGGER["git push → main"]
        PYSETUP["Set up Python 3.11\nInstall requirements"]
        TESTS["pytest\n(54 tests · coverage ≥60%)"]
        SAST["bandit SAST scan\n(HIGH/CRITICAL = fail)"]
        AUTH_GCP["Authenticate to GCP\n(OIDC service account)"]
        DOCKER_BUILD["docker build\nTagged with git SHA + latest"]
        TRIVY["Trivy container scan\n(HIGH/CRITICAL unfixed = fail)"]
        PUSH["docker push → Artifact Registry"]
        DEPLOY_BACKEND["gcloud run deploy\n(Cloud Run staging)"]
        DEPLOY_FE["npm ci → next build\nfirebase deploy --only hosting:staging"]

        TRIGGER --> PYSETUP
        PYSETUP --> TESTS
        TESTS --> SAST
        SAST --> AUTH_GCP
        AUTH_GCP --> DOCKER_BUILD
        DOCKER_BUILD --> TRIVY
        TRIVY --> PUSH
        PUSH --> DEPLOY_BACKEND
        TRIGGER --> DEPLOY_FE
    end

    DEPLOY_BACKEND --> STAGING_URL["🟡 staging API live\napi.staging.predictalpha.online"]
    DEPLOY_FE --> STAGING_FE["🟡 staging frontend live"]

    subgraph PROD["Production — manual trigger on git tag v*"]
        TAG["git tag v1.x.x\ngit push --tags"]
        APPROVE["Manual approval gate\n(GitHub Environment: production)"]
        PROD_BUILD["docker build\nTagged with version tag (immutable)"]
        PROD_TRIVY["Trivy scan"]
        PROD_PUSH["docker push → Artifact Registry"]
        PROD_DEPLOY["gcloud run deploy\n(Cloud Run production)"]
        PROD_FE["npm ci → next build\nfirebase deploy --only hosting:production"]

        TAG --> APPROVE
        APPROVE --> PROD_BUILD
        PROD_BUILD --> PROD_TRIVY
        PROD_TRIVY --> PROD_PUSH
        PROD_PUSH --> PROD_DEPLOY
        TAG --> PROD_FE
    end

    PROD_DEPLOY --> PROD_URL["🟢 production API live\napi.predictalpha.online"]
    PROD_FE --> PROD_FE_URL["🟢 production frontend live"]
```

## Rollback Strategy

**Cloud Run**: Every deploy creates a new revision. Traffic split allows instant rollback:

```bash
# Roll back to previous revision
gcloud run services update-traffic predictive-alpha-api \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=us-west1

# Or gradual canary rollout
gcloud run services update-traffic predictive-alpha-api \
  --to-revisions=NEW=10,PREV=90 \
  --region=us-west1
```

**Helm (Kubernetes path)**:
```bash
helm rollback predictive-alpha 1  # roll back to revision 1
```

## Security Scanning Details

| Tool | Scope | Fail Condition |
|---|---|---|
| **pytest** | Unit + integration tests | Any failure or coverage < 60% |
| **bandit** | Python SAST — app/ source | HIGH or CRITICAL severity finding |
| **Trivy** | Docker image CVE scan | Unfixed HIGH or CRITICAL CVE |
