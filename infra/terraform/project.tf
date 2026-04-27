resource "google_project" "play" {
  name            = var.project_name
  project_id      = var.project_id
  billing_account = var.billing_account_id
  org_id          = var.org_id != "" ? var.org_id : null

  labels          = var.labels
  deletion_policy = "PREVENT"

  auto_create_network = false
}

locals {
  required_apis = [
    "androidpublisher.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "serviceusage.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.required_apis)

  project = google_project.play.project_id
  service = each.value

  disable_on_destroy         = false
  disable_dependent_services = false
}
