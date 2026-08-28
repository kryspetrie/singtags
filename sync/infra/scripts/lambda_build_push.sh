#!/usr/bin/env bash
# Build mirror/Dockerfile.lambda (bakes small.en) and push to ECR.
#
# Env:
#   AWS_PROFILE, AWS_REGION (default us-east-1)
#   IMAGE_TAG (default latest) — also tags with git short SHA when available
#   PLATFORM (default linux/amd64)
#   SKIP_BAKE_CHECK=1 — skip local docker smoke of ASR import
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/_common.sh
source "${SCRIPT_DIR}/_common.sh"

require_cmd docker aws terraform

echo_banner "Resolve ECR repository"
if ! ECR_URL="$(tf_output ecr_repository_url)"; then
  echo "ERROR: terraform output ecr_repository_url missing. Run:" >&2
  echo "  ./infra/scripts/infra_apply.sh --bootstrap" >&2
  exit 1
fi
ECR_NAME="$(tf_output ecr_repository_name)"
ACCOUNT_ID="$(aws_cli sts get-caller-identity --query Account --output text)"

GIT_SHA=""
if command -v git >/dev/null 2>&1 && git -C "${ROOT_DIR}" rev-parse --short HEAD >/dev/null 2>&1; then
  GIT_SHA="$(git -C "${ROOT_DIR}" rev-parse --short HEAD)"
fi

LOCAL_IMAGE="${ECR_NAME}:${IMAGE_TAG}"
REMOTE_LATEST="${ECR_URL}:latest"
REMOTE_TAG="${ECR_URL}:${IMAGE_TAG}"
REMOTE_SHA=""
if [[ -n "${GIT_SHA}" ]]; then
  REMOTE_SHA="${ECR_URL}:${GIT_SHA}"
fi

echo_banner "ECR login (${AWS_REGION})"
aws_cli ecr get-login-password \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo_banner "Docker build (${PLATFORM}) — baking small.en (slow first time)"
docker build \
  --platform "${PLATFORM}" \
  -f "${ROOT_DIR}/mirror/Dockerfile.lambda" \
  -t "${LOCAL_IMAGE}" \
  "${ROOT_DIR}"

docker tag "${LOCAL_IMAGE}" "${REMOTE_LATEST}"
docker tag "${LOCAL_IMAGE}" "${REMOTE_TAG}"
if [[ -n "${REMOTE_SHA}" ]]; then
  docker tag "${LOCAL_IMAGE}" "${REMOTE_SHA}"
fi

echo_banner "Push ${REMOTE_LATEST}"
docker push "${REMOTE_LATEST}"
if [[ "${IMAGE_TAG}" != "latest" ]]; then
  docker push "${REMOTE_TAG}"
fi
if [[ -n "${REMOTE_SHA}" ]]; then
  echo_banner "Push ${REMOTE_SHA}"
  docker push "${REMOTE_SHA}"
fi

echo ""
echo "Pushed:"
echo "  ${REMOTE_LATEST}"
[[ "${IMAGE_TAG}" != "latest" ]] && echo "  ${REMOTE_TAG}"
[[ -n "${REMOTE_SHA}" ]] && echo "  ${REMOTE_SHA}"
echo ""
echo "Publish to Lambda with: ./infra/scripts/lambda_publish.sh"
