variable "project_id" {
  type        = string
  description = "GCP project ID to create. Must be globally unique, 6-30 chars, lowercase + digits + hyphens."
  default     = "aniseekr-android-release"
}

variable "project_name" {
  type        = string
  description = "Display name for the new GCP project."
  default     = "AniSeekr Android Release"
}

variable "billing_account_id" {
  type        = string
  description = "Billing account ID, e.g. 000000-000000-000000 (gcloud billing accounts list)."
}

variable "org_id" {
  type        = string
  description = "GCP org ID. Leave empty for a standalone (no-org) project."
  default     = ""
}

variable "sa_account_id" {
  type        = string
  description = "Service account account_id (the part before @). 6-30 chars."
  default     = "play-publisher"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.sa_account_id))
    error_message = "sa_account_id must be 6-30 chars, lowercase letters/digits/hyphens, starting with a letter."
  }
}

variable "labels" {
  type        = map(string)
  description = "Labels applied to the project."
  default = {
    managed_by = "terraform"
    purpose    = "play-console-publishing"
  }
}
