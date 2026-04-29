resource "google_service_account" "api" {
  project      = var.project_id
  account_id   = "${var.service_name}-sa"
  display_name = "Predictive Alpha API Service Account"
}

# Least-privilege: only allow reading secrets
resource "google_project_iam_member" "secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.api.email}"
}

# Allow writing traces to Google Cloud Trace
resource "google_project_iam_member" "cloudtrace_agent" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_cloud_run_v2_service" "api" {
  project  = var.project_id
  name     = var.service_name
  location = var.region

  template {
    service_account = google_service_account.api.email

    containers {
      image = var.image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      # Non-secret configuration
      env {
        name  = "APP_ENV"
        value = var.app_env
      }
      env {
        name  = "LOG_LEVEL"
        value = "INFO"
      }

      # Secrets mounted from Secret Manager
      dynamic "env" {
        for_each = var.secret_refs
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }

      liveness_probe {
        http_get { path = "/health" }
        initial_delay_seconds = 10
        period_seconds        = 30
      }

      startup_probe {
        http_get { path = "/health" }
        failure_threshold = 5
        period_seconds    = 10
      }
    }

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# Allow unauthenticated public access (Firebase auth is enforced at app layer)
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "service_url" {
  value = google_cloud_run_v2_service.api.uri
}
