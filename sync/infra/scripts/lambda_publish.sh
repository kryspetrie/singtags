#!/usr/bin/env bash
# Build/push a new container image and point the sync Lambda at it.
# Publishes a numbered Lambda version and moves the "live" alias to it.
#
# Env: AWS_PROFILE, AWS_REGION, IMAGE_TAG (default latest), SKIP_BUILD=1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/_common.sh
source "${SCRIPT_DIR}/_common.sh"

SKIP_BUILD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1; shift ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

require_cmd aws docker terraform

FN_NAME="$(tf_output sync_lambda_name || true)"
if [[ -z "${FN_NAME}" || "${FN_NAME}" == "null" ]]; then
  echo "ERROR: sync Lambda not created yet. Run:" >&2
  echo "  ./infra/scripts/infra_apply.sh --bootstrap" >&2
  echo "  ./infra/scripts/lambda_build_push.sh" >&2
  echo "  ./infra/scripts/infra_apply.sh" >&2
  exit 1
fi

ECR_URL="$(tf_output ecr_repository_url)"
IMAGE_URI="${ECR_URL}:${IMAGE_TAG}"

if [[ "${SKIP_BUILD}" -eq 0 ]]; then
  "${SCRIPT_DIR}/lambda_build_push.sh"
else
  echo_banner "Skip build; using ${IMAGE_URI}"
fi

echo_banner "Update Lambda image → ${IMAGE_URI}"
aws_cli lambda update-function-code \
  --function-name "${FN_NAME}" \
  --image-uri "${IMAGE_URI}" \
  >/dev/null

echo_banner "Wait for function update"
aws_cli lambda wait function-updated --function-name "${FN_NAME}"

echo_banner "Publish version"
VERSION="$(aws_cli lambda publish-version \
  --function-name "${FN_NAME}" \
  --description "publish $(date -u +%Y-%m-%dT%H:%M:%SZ) ${IMAGE_URI}" \
  --query Version --output text)"

echo_banner "Point alias 'live' → version ${VERSION}"
if aws_cli lambda get-alias --function-name "${FN_NAME}" --name live >/dev/null 2>&1; then
  aws_cli lambda update-alias \
    --function-name "${FN_NAME}" \
    --name live \
    --function-version "${VERSION}" \
    >/dev/null
else
  aws_cli lambda create-alias \
    --function-name "${FN_NAME}" \
    --name live \
    --function-version "${VERSION}" \
    >/dev/null
fi

# Prefer Step Functions invoke the versioned alias when possible — update SFN
# definition is owned by Terraform; alias update is enough if SFN uses unqualified
# ARN ($LATEST). Re-apply infra if you switch SFN to :live later.
SFN_ARN="$(tf_output sync_state_machine_arn || true)"

echo ""
echo "Published Lambda ${FN_NAME}"
echo "  image:   ${IMAGE_URI}"
echo "  version: ${VERSION}"
echo "  alias:   ${FN_NAME}:live"
[[ -n "${SFN_ARN}" && "${SFN_ARN}" != "null" ]] && echo "  sfn:     ${SFN_ARN}"
echo ""
echo "Manual test:"
echo "  aws stepfunctions start-execution --state-machine-arn ${SFN_ARN} --input '{\"attempt\":1,\"limit\":0}'"
