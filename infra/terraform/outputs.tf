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

output "revenuecat_service_account_email" {
  value       = google_service_account.revenuecat.email
  description = "Invite this email in Play Console; grant order/financial read access for RevenueCat."
}

output "next_steps" {
  description = "Manual steps that cannot be automated."
  value       = <<-EOT

    ============================================================
    Terraform applied. Two service accounts now exist.
    Keys are generated out-of-band (never in tfstate):
      bun run gcp:bootstrap   # writes both keys under ./secrets/
    ============================================================

    --- A) PLAY PUBLISHER SA  (uploads AABs) -------------------
    SA: ${google_service_account.play_publisher.email}

    1) Key -> ./secrets/play-sa-key.json (bootstrap does this).
       Manual equivalent:
         gcloud iam service-accounts keys create ./secrets/play-sa-key.json \
           --iam-account=${google_service_account.play_publisher.email} \
           --project=${google_project.play.project_id}

    2) Play Console (https://play.google.com/console)
       -> Users and permissions -> Invite new users
         Email:      ${google_service_account.play_publisher.email}
         Permission: Release manager
       The legacy "API access -> link GCP project" flow is
       deprecated as of 2024+; the SA email is the only handle
       Play needs.

    3) Upload the FIRST AAB by hand via the Play Console UI.
       Google requires a human for the initial release; the SA
       takes over uploads after that.

    4) From then on, release via:
         bun run build:android:local && bun run submit:android

    --- B) REVENUECAT SA  (validates purchases) ----------------
    SA: ${google_service_account.revenuecat.email}

    1) Key -> ./secrets/revenuecat-sa-key.json (bootstrap does
       this). This JSON is uploaded to the RevenueCat dashboard;
       it is NOT bundled into the app or EAS.

    2) Play Console -> Users and permissions -> Invite new users
         Email: ${google_service_account.revenuecat.email}
       Grant these App permissions for AniSeekr (RevenueCat's
       setup wizard shows the exact current labels):
         - View app information (read-only)
         - View financial data, orders, cancellation surveys
         - Manage orders and subscriptions
       Do NOT grant Release manager -- least privilege; this SA
       only reads purchase state.

    3) RevenueCat dashboard -> project -> Google Play app:
       upload ./secrets/revenuecat-sa-key.json. Allow a few hours
       for Google to propagate the new SA permissions before
       RevenueCat's credential check passes.

  EOT
}
