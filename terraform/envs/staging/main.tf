terraform {
  required_version = ">= 1.7"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "predict-alpha-tfstate-staging"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "artifact_registry" {
  source        = "../../modules/artifact-registry"
  project_id    = var.project_id
  region        = var.region
  repository_id = "cloud-run-source-deploy"
}

module "secrets" {
  source     = "../../modules/secrets"
  project_id = var.project_id
  # Creates secret shells only — values set via gcloud CLI in CI or manually
  secret_names = toset([
    "ALPACA_API_KEY",
    "ALPACA_SECRET_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "RESEND_API_KEY",
  ])
}

module "cloud_run" {
  source       = "../../modules/cloud-run"
  project_id   = var.project_id
  region       = var.region
  service_name = "predictive-alpha-api-staging"
  image        = "${var.region}-docker.pkg.dev/${var.project_id}/cloud-run-source-deploy/predictive-alpha-api:latest"
  app_env      = "staging"
  secret_refs = {
    ALPACA_API_KEY        = { secret_id = "ALPACA_API_KEY" }
    ALPACA_SECRET_KEY     = { secret_id = "ALPACA_SECRET_KEY" }
    STRIPE_SECRET_KEY     = { secret_id = "STRIPE_SECRET_KEY" }
    STRIPE_WEBHOOK_SECRET = { secret_id = "STRIPE_WEBHOOK_SECRET" }
    RESEND_API_KEY        = { secret_id = "RESEND_API_KEY" }
  }
}

output "api_url" { value = module.cloud_run.service_url }
