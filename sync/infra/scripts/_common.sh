#!/usr/bin/env bash
# Shared helpers for deploy scripts (sourced, not executed).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA_DIR="${ROOT_DIR}/infra"
export ROOT_DIR INFRA_DIR

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PLATFORM="${PLATFORM:-linux/amd64}"

aws_cli() {
  if [[ -n "${AWS_PROFILE}" ]]; then
    aws --profile "${AWS_PROFILE}" --region "${AWS_REGION}" "$@"
  else
    aws --region "${AWS_REGION}" "$@"
  fi
}

tf() {
  local extra=()
  if [[ -n "${AWS_PROFILE}" ]]; then
    extra+=(-var="aws_profile=${AWS_PROFILE}")
  fi
  (
    cd "${INFRA_DIR}"
    terraform "$@" "${extra[@]}"
  )
}

require_cmd() {
  local c
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || {
      echo "ERROR: required command not found: $c" >&2
      exit 1
    }
  done
}

tf_output() {
  local key="$1"
  (
    cd "${INFRA_DIR}"
    terraform output -raw "$key" 2>/dev/null
  )
}

echo_banner() {
  echo ""
  echo "==> $*"
}
