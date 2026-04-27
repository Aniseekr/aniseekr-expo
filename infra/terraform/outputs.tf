output "project_id" {
  value       = google_project.play.project_id
  description = "GCP project ID."
}

output "project_number" {
  value       = google_project.play.number
  description = "GCP project number (used to link Play Console)."
}

output "service_account_email" {
  value       = google_service_account.play_publisher.email
  description = "Invite this email in Play Console -> Users and permissions."
}

output "next_steps" {
  description = "Manual steps that cannot be automated."
  value       = <<-EOT

    ============================================================
    Terraform applied. Manual steps remaining:
    ============================================================

    1) Generate the SA key (NOT stored in tfstate). The bootstrap
       script does this automatically. Manual equivalent:
         gcloud iam service-accounts keys create ./secrets/play-sa-key.json \
           --iam-account=${google_service_account.play_publisher.email} \
           --project=${google_project.play.project_id}

    2) In Google Play Console (https://play.google.com/console):
       Left sidebar -> Users and permissions -> Invite new users
         Email: ${google_service_account.play_publisher.email}
         Account permissions: Release manager
           (or restrict to App admin scoped to AniSeekr only)
         Click "Invite user".

       The legacy "Settings -> API access -> link GCP project"
       flow is deprecated as of 2024+. You no longer need to link
       the GCP project on the Play Console side -- the SA's email
       is the only handle Play needs.

    3) Manually upload the FIRST AAB via the Play Console UI.
       Google requires the very first artifact to be uploaded by a
       human; only after that can the SA take over uploads.

    4) From then on, release via:
         bun run build:android:local
         bun run submit:android

  EOT
}
