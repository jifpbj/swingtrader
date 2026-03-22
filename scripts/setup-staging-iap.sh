#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-staging-iap.sh
# Configures Global HTTPS Load Balancer + Cloud IAP in front of the
# (already-deployed) staging Cloud Run service.
#
# Prerequisites:
#   - setup-staging.sh has already been run
#   - The staging Cloud Run service 'predictive-alpha-api' exists
#   - DNS record api.staging.predictalpha.online → static IP is propagated
#   - OAuth consent screen is configured (see step 0 below)
#
# Usage:
#   TESTER_EMAIL=you@gmail.com ./scripts/setup-staging-iap.sh
#   # Add more testers: TESTER_EMAIL=other@gmail.com ./scripts/setup-staging-iap.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_ID="predict-alpha-staging"
REGION="us-west1"
SERVICE="predictive-alpha-api"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}▶ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠  $*${NC}"; }

if [[ -z "${TESTER_EMAIL:-}" ]]; then
  echo "Error: set TESTER_EMAIL env var before running."
  echo "  TESTER_EMAIL=you@example.com ./scripts/setup-staging-iap.sh"
  exit 1
fi

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

# ── STEP 0: Manual prerequisite reminder ──────────────────────────────────────
warn "MANUAL PREREQUISITE (do this first in the GCP Console if not done):"
warn "  GCP Console → predict-alpha-staging → APIs & Services → OAuth consent screen"
warn "  → External → App name: 'Predictive Alpha Staging' → Support email → Save"
echo ""
read -rp "Press Enter once the OAuth consent screen is configured…"
echo ""

# ── 1. Serverless Network Endpoint Group ──────────────────────────────────────
info "Creating Serverless NEG (Cloud Run backend)…"
if gcloud compute network-endpoint-groups describe staging-api-neg \
    --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  warn "NEG already exists — skipping"
else
  gcloud compute network-endpoint-groups create staging-api-neg \
    --region="$REGION" \
    --network-endpoint-type=serverless \
    --cloud-run-service="$SERVICE" \
    --project="$PROJECT_ID"
fi

# ── 2. Backend service ─────────────────────────────────────────────────────────
info "Creating backend service…"
if gcloud compute backend-services describe staging-api-backend \
    --global --project="$PROJECT_ID" &>/dev/null; then
  warn "Backend service already exists — skipping"
else
  gcloud compute backend-services create staging-api-backend \
    --global \
    --project="$PROJECT_ID"

  gcloud compute backend-services add-backend staging-api-backend \
    --global \
    --network-endpoint-group=staging-api-neg \
    --network-endpoint-group-region="$REGION" \
    --project="$PROJECT_ID"
fi

# ── 3. URL map ─────────────────────────────────────────────────────────────────
info "Creating URL map…"
if gcloud compute url-maps describe staging-api-urlmap \
    --global --project="$PROJECT_ID" &>/dev/null; then
  warn "URL map already exists — skipping"
else
  gcloud compute url-maps create staging-api-urlmap \
    --default-service=staging-api-backend \
    --project="$PROJECT_ID"
fi

# ── 4. Google-managed SSL certificate ─────────────────────────────────────────
info "Creating Google-managed SSL certificate for api.staging.predictalpha.online…"
warn "Certificate provisioning takes 10–60 min after DNS is confirmed pointing to the LB IP."
if gcloud compute ssl-certificates describe staging-api-cert \
    --global --project="$PROJECT_ID" &>/dev/null; then
  warn "SSL cert already exists — skipping"
else
  gcloud compute ssl-certificates create staging-api-cert \
    --domains=api.staging.predictalpha.online \
    --global \
    --project="$PROJECT_ID"
fi

# ── 5. HTTPS proxy + forwarding rule ──────────────────────────────────────────
info "Creating target HTTPS proxy…"
if gcloud compute target-https-proxies describe staging-api-proxy \
    --global --project="$PROJECT_ID" &>/dev/null; then
  warn "HTTPS proxy already exists — skipping"
else
  gcloud compute target-https-proxies create staging-api-proxy \
    --url-map=staging-api-urlmap \
    --ssl-certificates=staging-api-cert \
    --project="$PROJECT_ID"
fi

info "Creating forwarding rule (attaches LB static IP)…"
if gcloud compute forwarding-rules describe staging-api-fwd \
    --global --project="$PROJECT_ID" &>/dev/null; then
  warn "Forwarding rule already exists — skipping"
else
  gcloud compute forwarding-rules create staging-api-fwd \
    --address=staging-api-ip \
    --global \
    --target-https-proxy=staging-api-proxy \
    --ports=443 \
    --project="$PROJECT_ID"
fi

# ── 6. Enable IAP ─────────────────────────────────────────────────────────────
info "Enabling IAP on the backend service…"
gcloud iap web enable \
  --resource-type=backend-services \
  --service=staging-api-backend \
  --project="$PROJECT_ID"

# ── 7. Grant tester access ────────────────────────────────────────────────────
info "Granting IAP access to ${TESTER_EMAIL}…"
gcloud iap web add-iam-policy-binding \
  --resource-type=backend-services \
  --service=staging-api-backend \
  --member="user:${TESTER_EMAIL}" \
  --role="roles/iap.httpsResourceAccessor" \
  --project="$PROJECT_ID"

# ── 8. Allow IAP service account to invoke Cloud Run ─────────────────────────
info "Allowing IAP SA to invoke the Cloud Run service…"
IAP_SA="service-${PROJECT_NUMBER}@gcp-sa-iap.iam.gserviceaccount.com"
gcloud run services add-iam-policy-binding "$SERVICE" \
  --region="$REGION" \
  --member="serviceAccount:${IAP_SA}" \
  --role="roles/run.invoker" \
  --project="$PROJECT_ID"

# ── Summary ───────────────────────────────────────────────────────────────────
STATIC_IP=$(gcloud compute addresses describe staging-api-ip \
  --global --project="$PROJECT_ID" --format='value(address)')

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Cloud IAP setup complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "  LB static IP : ${STATIC_IP}"
echo "  Staging API  : https://api.staging.predictalpha.online"
echo "  IAP tester   : ${TESTER_EMAIL}"
echo ""
echo "To add more testers:"
echo "  TESTER_EMAIL=another@gmail.com ./scripts/setup-staging-iap.sh"
echo ""
echo "To add a Google Group (all group members get access):"
echo "  gcloud iap web add-iam-policy-binding \\"
echo "    --resource-type=backend-services \\"
echo "    --service=staging-api-backend \\"
echo "    --member='group:testers@yourdomain.com' \\"
echo "    --role='roles/iap.httpsResourceAccessor' \\"
echo "    --project=${PROJECT_ID}"
echo ""
warn "SSL cert provisioning can take up to 60 min. Check status:"
warn "  gcloud compute ssl-certificates describe staging-api-cert --global --project=${PROJECT_ID}"
echo ""
