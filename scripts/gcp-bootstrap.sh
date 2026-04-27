#!/usr/bin/env bash
#
# One-shot bootstrap: terraform apply + generate SA key out-of-band.
# Idempotent — safe to re-run; key is regenerated only if --rotate-key is passed.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="${ROOT}/infra/terraform"
KEY_PATH="${ROOT}/secrets/play-sa-key.json"
ROTATE=0

for arg in "$@"; do
  case "$arg" in
    --rotate-key) ROTATE=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

echo "==> Checking gcloud auth"
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  echo "ADC not configured. Run: gcloud auth application-default login" >&2
  exit 1
fi

echo "==> terraform apply"
cd "${TF_DIR}"
terraform init -upgrade >/dev/null
terraform apply -auto-approve

SA_EMAIL="$(terraform output -raw service_account_email)"
PROJECT_ID="$(terraform output -raw project_id)"

mkdir -p "${ROOT}/secrets"
chmod 700 "${ROOT}/secrets"

if [[ -f "${KEY_PATH}" && "${ROTATE}" -eq 0 ]]; then
  echo "==> Key already exists at ${KEY_PATH#${ROOT}/} (skip; pass --rotate-key to regenerate)"
else
  if [[ -f "${KEY_PATH}" ]]; then
    echo "==> Rotating key (old file will be overwritten)"
  else
    echo "==> Generating SA key"
  fi
  gcloud iam service-accounts keys create "${KEY_PATH}" \
    --iam-account="${SA_EMAIL}" \
    --project="${PROJECT_ID}"
  chmod 600 "${KEY_PATH}"
  echo "==> Key written to ${KEY_PATH#${ROOT}/}"
fi

echo
terraform output -raw next_steps
