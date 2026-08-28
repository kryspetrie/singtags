#!/usr/bin/env bash
# Create / update AWS infra (S3, CloudFront, ECR, Lambda, Step Functions, EventBridge).
#
# First-time flow (no image in ECR yet):
#   ./infra/scripts/infra_apply.sh --bootstrap   # ECR + S3 + CF only
#   ./infra/scripts/lambda_build_push.sh
#   ./infra/scripts/infra_apply.sh               # create Lambda + SFN + schedule
#
# Later:
#   ./infra/scripts/infra_apply.sh
#
# Env: AWS_PROFILE, AWS_REGION (default us-east-1)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/_common.sh
source "${SCRIPT_DIR}/_common.sh"

BOOTSTRAP=0
AUTO_APPROVE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --bootstrap) BOOTSTRAP=1; shift ;;
    -y|--yes|--auto-approve) AUTO_APPROVE=1; shift ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

require_cmd terraform aws

echo_banner "Terraform init (${INFRA_DIR})"
tf init -upgrade

APPROVE_FLAG=()
if [[ "${AUTO_APPROVE}" -eq 1 ]]; then
  APPROVE_FLAG=(-auto-approve)
fi

if [[ ! -f "${INFRA_DIR}/terraform.tfvars" && -f "${INFRA_DIR}/terraform.tfvars.example" ]]; then
  echo "NOTE: no infra/terraform.tfvars — using example defaults / -var flags"
fi

if [[ "${BOOTSTRAP}" -eq 1 ]]; then
  echo_banner "Bootstrap apply (create_lambda=false) — ECR + S3 + CloudFront"
  tf apply "${APPROVE_FLAG[@]}" -var="create_lambda=false" -var="aws_region=${AWS_REGION}"
  echo ""
  echo "Next:"
  echo "  ./infra/scripts/lambda_build_push.sh"
  echo "  ./infra/scripts/infra_apply.sh"
  echo ""
  echo "ECR: $(tf_output ecr_repository_url || true)"
  exit 0
fi

echo_banner "Full infra apply (create_lambda=true)"
tf apply "${APPROVE_FLAG[@]}" -var="create_lambda=true" -var="aws_region=${AWS_REGION}" -var="image_tag=${IMAGE_TAG}"

echo_banner "Outputs"
tf output
