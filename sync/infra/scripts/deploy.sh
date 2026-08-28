#!/usr/bin/env bash
# One-shot: bootstrap infra (if needed) → build/push image → full infra → publish.
#
#   ./infra/scripts/deploy.sh           # interactive terraform applies
#   ./infra/scripts/deploy.sh -y        # auto-approve terraform
#   ./infra/scripts/deploy.sh --publish-only   # only rebuild/push/update Lambda
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/_common.sh
source "${SCRIPT_DIR}/_common.sh"

AUTO_APPROVE=0
PUBLISH_ONLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes|--auto-approve) AUTO_APPROVE=1; shift ;;
    --publish-only) PUBLISH_ONLY=1; shift ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

TF_YES=()
[[ "${AUTO_APPROVE}" -eq 1 ]] && TF_YES=(--yes)

if [[ "${PUBLISH_ONLY}" -eq 1 ]]; then
  "${SCRIPT_DIR}/lambda_publish.sh"
  exit 0
fi

require_cmd terraform aws docker

# Detect whether Lambda already exists
HAS_LAMBDA=0
if [[ -d "${INFRA_DIR}/.terraform" ]] || [[ -f "${INFRA_DIR}/terraform.tfstate" ]]; then
  FN="$(tf_output sync_lambda_name 2>/dev/null || true)"
  if [[ -n "${FN}" && "${FN}" != "null" ]]; then
    HAS_LAMBDA=1
  fi
fi

if [[ "${HAS_LAMBDA}" -eq 0 ]]; then
  echo_banner "First-time deploy"
  "${SCRIPT_DIR}/infra_apply.sh" --bootstrap "${TF_YES[@]}"
  "${SCRIPT_DIR}/lambda_build_push.sh"
  "${SCRIPT_DIR}/infra_apply.sh" "${TF_YES[@]}"
  # Ensure live alias tracks a published version
  "${SCRIPT_DIR}/lambda_publish.sh" --skip-build
else
  echo_banner "Update deploy (infra + new Lambda image)"
  "${SCRIPT_DIR}/infra_apply.sh" "${TF_YES[@]}"
  "${SCRIPT_DIR}/lambda_publish.sh"
fi

echo_banner "Done"
tf output
