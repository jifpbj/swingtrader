#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-staging.sh
# One-time GCP CLI setup for the predict-alpha-staging project.
#
# Run from repo root after:
#   1. Installing gcloud CLI and running `gcloud auth login`
#   2. Creating the Firebase staging project manually in the console first
#      (console.firebase.google.com → Import GCP project → predict-alpha-staging)
#
# Usage:
#   chmod +x scripts/setup-staging.sh
#   BILLING_ACCOUNT=<your-billing-id> ./scripts/setup-staging.sh
#
# Get your billing account ID:
#   gcloud billing accounts list
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_ID="predict-alpha-staging"
REGION="us-west1"
SA_NAME="github-actions-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_OUT="/tmp/staging-sa-key.json"

# ── Colour helpers ─────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}▶ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠  $*${NC}"; }

# ── 0. Validate billing ID is set ─────────────────────────────────────────────
if [[ -z "${BILLING_ACCOUNT:-}" ]]; then
  echo "Error: set BILLING_ACCOUNT env var before running."
  echo "  gcloud billing accounts list"
  echo "  export BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX"
  exit 1
fi

# ── 1. Create project ──────────────────────────────────────────────────────────
info "Creating GCP project ${PROJECT_ID}…"
if gcloud projects describe "$PROJECT_ID" &>/dev/null; then
  warn "Project ${PROJECT_ID} already exists — skipping creation"
else
  gcloud projects create "$PROJECT_ID" \
    --name="Predictive Alpha — Staging"
fi

# ── 2. Link billing ────────────────────────────────────────────────────────────
info "Linking billing account ${BILLING_ACCOUNT}…"
gcloud billing projects link "$PROJECT_ID" \
  --billing-account="$BILLING_ACCOUNT"

# ── 3. Enable required APIs ────────────────────────────────────────────────────
info "Enabling APIs…"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iap.googleapis.com \
  compute.googleapis.com \
  cloudbuild.googleapis.com \
  --project="$PROJECT_ID"

# ── 4. Artifact Registry repo ─────────────────────────────────────────────────
info "Creating Artifact Registry repo…"
if gcloud artifacts repositories describe cloud-run-source-deploy \
    --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  warn "Artifact Registry repo already exists — skipping"
else
  gcloud artifacts repositories create cloud-run-source-deploy \
    --repository-format=docker \
    --location="$REGION" \
    --project="$PROJECT_ID"
fi

# ── 5. GitHub Actions service account ─────────────────────────────────────────
info "Creating service account ${SA_NAME}…"
if gcloud iam service-accounts describe "$SA_EMAIL" \
    --project="$PROJECT_ID" &>/dev/null; then
  warn "Service account already exists — skipping creation"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="GitHub Actions Deploy" \
    --project="$PROJECT_ID"
fi

info "Granting IAM roles to ${SA_EMAIL}…"
for ROLE in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/iam.serviceAccountUser \
  roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" \
    --quiet
done

info "Creating SA key at ${KEY_OUT}…"
gcloud iam service-accounts keys create "$KEY_OUT" \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT_ID"

echo ""
warn "ACTION REQUIRED: Add the contents of ${KEY_OUT} as a GitHub secret:"
warn "  GitHub → Settings → Secrets → GCP_SA_KEY_STAGING"
echo ""

# ── 6. Cloud Run default SA → Firestore access ────────────────────────────────
info "Granting Firestore access to default compute SA…"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/datastore.user" \
  --quiet

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

# ── 7. Secret Manager — create placeholder secrets ────────────────────────────
info "Creating Secret Manager secrets (with placeholder values)…"
warn "You MUST update these with real staging/test values afterwards!"
echo ""

for SECRET_NAME in \
  ALPACA_API_KEY \
  ALPACA_SECRET_KEY \
  STRIPE_SECRET_KEY \
  STRIPE_WEBHOOK_SECRET \
  RESEND_API_KEY; do
  if gcloud secrets describe "$SECRET_NAME" \
      --project="$PROJECT_ID" &>/dev/null; then
    warn "Secret ${SECRET_NAME} already exists — skipping"
  else
    echo -n "PLACEHOLDER_UPDATE_ME" | \
      gcloud secrets create "$SECRET_NAME" \
        --data-file=- \
        --project="$PROJECT_ID"
    info "  Created secret: ${SECRET_NAME}"
  fi
done

echo ""
warn "Update secrets with real values using:"
warn "  echo -n 'YOUR_VALUE' | gcloud secrets versions add SECRET_NAME --data-file=- --project=${PROJECT_ID}"
echo ""

# ── 8. Update staging secrets helper ──────────────────────────────────────────
echo "Commands to set real secret values (fill in your values):"
echo ""
echo "  # Alpaca paper trading keys (from paper.alpaca.markets)"
echo "  echo -n 'PK...' | gcloud secrets versions add ALPACA_API_KEY    --data-file=- --project=${PROJECT_ID}"
echo "  echo -n 'sk...' | gcloud secrets versions add ALPACA_SECRET_KEY --data-file=- --project=${PROJECT_ID}"
echo ""
echo "  # Stripe test-mode keys (from dashboard.stripe.com → Developers → API keys → Test)"
echo "  echo -n 'sk_test_...' | gcloud secrets versions add STRIPE_SECRET_KEY        --data-file=- --project=${PROJECT_ID}"
echo "  echo -n 'whsec_...'   | gcloud secrets versions add STRIPE_WEBHOOK_SECRET    --data-file=- --project=${PROJECT_ID}"
echo ""
echo "  # Resend API key (same as prod is fine, or create a staging key)"
echo "  echo -n 're_...' | gcloud secrets versions add RESEND_API_KEY --data-file=- --project=${PROJECT_ID}"
echo ""

# ── 9. Reserve static IP for the Global LB ────────────────────────────────────
info "Reserving global static IP for staging API LB…"
if gcloud compute addresses describe staging-api-ip \
    --global --project="$PROJECT_ID" &>/dev/null; then
  warn "Static IP already exists — skipping"
else
  gcloud compute addresses create staging-api-ip \
    --global --project="$PROJECT_ID"
fi

STATIC_IP=$(gcloud compute addresses describe staging-api-ip \
  --global --project="$PROJECT_ID" --format='value(address)')

echo ""
info "Static IP reserved: ${STATIC_IP}"
warn "ACTION REQUIRED: Add this DNS record at your domain registrar:"
warn "  api.staging.predictalpha.online  A  ${STATIC_IP}"
echo ""

# ── 10. Rename prod project display name (cosmetic) ───────────────────────────
info "Updating prod project display name…"
gcloud projects update predict-alpha-4ed0c \
  --name="Predictive Alpha — Production" || true

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Staging GCP project setup complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo ""
echo "  1. Upload GCP SA key to GitHub:"
echo "     cat ${KEY_OUT} | pbcopy"
echo "     → GitHub → Settings → Secrets → New: GCP_SA_KEY_STAGING"
echo ""
echo "  2. Update Secret Manager placeholders (commands printed above)"
echo ""
echo "  3. Create Firebase staging project:"
echo "     https://console.firebase.google.com → Add project"
echo "     → Import Google Cloud project → predict-alpha-staging"
echo "     Enable: Firestore (us-west1), Authentication (Email+Google), Hosting"
echo "     Download service account → add as FIREBASE_SERVICE_ACCOUNT_STAGING"
echo "     Copy web app config → add STAGING_FIREBASE_* GitHub secrets"
echo ""
echo "  4. Add DNS record:"
echo "     api.staging.predictalpha.online  A  ${STATIC_IP}"
echo ""
echo "  5. After first 'main' push deploys the staging Cloud Run service,"
echo "     run:  ./scripts/setup-staging-iap.sh"
echo "     to configure the Load Balancer + IAP."
echo ""
echo "  6. Create GitHub Environments:"
echo "     → GitHub → Settings → Environments"
echo "     → 'production' with required reviewers"
echo "     → 'staging' (no reviewers)"
echo ""
