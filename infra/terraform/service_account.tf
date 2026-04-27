resource "google_service_account" "play_publisher" {
  project = google_project.play.project_id

  account_id   = var.sa_account_id
  display_name = "Play Console Publisher"
  description  = "Uploads AABs to Google Play via Android Publisher API. Key generated out-of-band, never stored in tfstate."

  depends_on = [google_project_service.apis]
}
