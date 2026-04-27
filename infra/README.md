# Play Console Publishing Infrastructure

Local CLI release flow for the AniSeekr Android app, backed by a Terraform-managed
GCP project and a service account whose key is generated **out of band** so it
never lands in `terraform.tfstate` ("clean mode").

```
infra/terraform/  -> GCP project + APIs + SA (no key in state)
secrets/          -> SA JSON key (gitignored, mode 0600)
scripts/          -> bootstrap / rotate / submit helpers
eas.json          -> submit profile points at ./secrets/play-sa-key.json
```

---

## One-time setup

### 0. Prerequisites

```bash
gcloud --version          # any recent
terraform -version        # >= 1.5
eas --version             # already in devDependencies
gcloud auth application-default login   # required for Terraform
```

### 1. Provision GCP + generate SA key

```bash
bun run gcp:bootstrap
```

This:
1. Runs `terraform apply` in `infra/terraform/` — creates the GCP project
   `aniseekr-android-release`, enables `androidpublisher.googleapis.com`,
   creates SA `play-publisher@aniseekr-android-release.iam.gserviceaccount.com`.
2. Calls `gcloud iam service-accounts keys create` to write
   `secrets/play-sa-key.json` (chmod 600). The key never touches tfstate.

Re-running is idempotent. Pass `--rotate-key` to overwrite the local key.

### 2. Manual Play Console steps (cannot be automated)

Open <https://play.google.com/console> as the developer account owner.

> **Note:** The old "Settings → API access → link GCP project" flow is
> deprecated as of 2024+. Per Google's current docs, you do **not** need
> to link the GCP project on the Play Console side any more — the SA's
> email alone is enough. If you can't find an "API access" page in your
> Play Console, that's expected; use the flow below instead.
> Source: <https://developers.google.com/android-publisher/getting_started>

1. Left sidebar → **Users and permissions (使用者和權限)** → **Invite new users (邀請新使用者)**
2. **Email**: paste `terraform output service_account_email`
   (e.g. `play-publisher@aniseekr-android-release.iam.gserviceaccount.com`)
3. **Account permissions**: tick **Release manager** for account-wide release rights.
   For tighter scope, untick that and use **App admin** restricted to AniSeekr only.
4. Click **Invite user**. The SA accepts automatically — no email confirmation step.
5. **Upload the very first AAB by hand** via Play Console UI. Google requires the
   initial release to be made by a human; only after that can the SA upload
   subsequent builds.

### 3. Verify

```bash
bun run build:android:local      # produces build/*.aab
bun run submit:android           # uploads to internal track as draft
```

---

## Day-to-day release flow

```bash
bun run build:android:local                   # local AAB build (gradle)
bun run submit:android                        # default: most recent AAB in build/
bun run submit:android ./path/to/app.aab      # or pass explicit path
```

Defaults in `eas.json → submit.production.android`:

| Field                       | Value             | Why                                                        |
| --------------------------- | ----------------- | ---------------------------------------------------------- |
| `serviceAccountKeyPath`     | `./secrets/play-sa-key.json` | local-only path, gitignored                     |
| `track`                     | `internal`        | safest default; promote in Play Console UI                 |
| `releaseStatus`             | `draft`           | requires manual "Send for review" click in Play Console    |
| `changesNotSentForReview`   | `false`           | normal review pipeline                                     |

To go live without the manual click, change `releaseStatus` to
`completed` and `track` to whichever you intend.

---

## Key rotation

```bash
bun run gcp:rotate-key
```

Creates a new key, leaves the old one active. After confirming the new key
works (`bun run submit:android`), delete the old one manually with the
`gcloud iam service-accounts keys delete` command the script prints.

User-managed SA keys do not auto-expire. Rotate at least quarterly.

---

## Why "clean mode" (key out of tfstate)

`google_service_account_key` would put the private key into tfstate as
plaintext. Anything with read access to the state file (CI logs, `terraform
show`, GCS bucket viewers, future maintainers) would have a Play Console
publishing credential.

By generating the key with `gcloud iam service-accounts keys create` after
`terraform apply`, the key only exists:

- on disk at `./secrets/play-sa-key.json` (chmod 600, gitignored)
- on Google's side as the SA's key material

Terraform still owns the SA's lifecycle (recreate the SA → invalidate all keys),
but tfstate stays free of secrets. This means tfstate can be checked into a
private repo or stored on a non-encrypted backend without leaking credentials.

---

## Destroying

```bash
cd infra/terraform
terraform destroy
```

`google_project` has `deletion_policy = "PREVENT"` to guard against accidents.
To actually delete the project, change it to `"DELETE"` and re-apply first,
then destroy. Manually delete `secrets/play-sa-key.json` afterwards.
