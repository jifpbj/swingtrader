variable "project_id" {
  type = string
}

variable "secret_names" {
  description = "List of Secret Manager secret names to create (shells only — set values via gcloud or CI)"
  type        = set(string)
}

# Create the secret shells (names are non-sensitive — safe as for_each keys)
resource "google_secret_manager_secret" "secrets" {
  for_each  = var.secret_names
  project   = var.project_id
  secret_id = each.value
  replication {
    auto {}
  }
}

output "secret_ids" {
  value = { for k, v in google_secret_manager_secret.secrets : k => v.id }
}

# Secret *values* are NOT managed by Terraform to avoid storing sensitive data in state.
# Set values via CI (GitHub Actions secret → gcloud secrets versions add) or manually:
#
#   gcloud secrets versions add ALPACA_API_KEY \
#     --data-file=- <<< "$ALPACA_API_KEY" \
#     --project=PROJECT_ID
