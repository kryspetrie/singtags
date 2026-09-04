#!/usr/bin/env bash
# Upload local library + catalog to the mirror S3 bucket (optional site assets).
#
#   ./infra/scripts/sync_site.sh                 # sync tags + state
#   ./infra/scripts/sync_site.sh --dry-run
#
# Expects local library at SITE_ROOT/library/ (website repo) and terraform outputs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/scripts/_common.sh
source "${SCRIPT_DIR}/_common.sh"

DRY=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY=(--dryrun); shift ;;
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

require_cmd aws terraform

BUCKET="$(tf_output bucket_name)"
ROOT_LIB="${SITE_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}/library"
STATE_DIR="${ROOT_LIB}/_state"

echo_banner "Sync state → s3://${BUCKET}/state/"
aws_cli s3 sync "${STATE_DIR}/" "s3://${BUCKET}/state/" \
  "${DRY[@]}" \
  --exclude "*" \
  --include "sync_state.json" \
  --include "catalog.jsonl" \
  --include "catalog.json"

# Optional: full media sync is large — only when SYNC_MEDIA=1
if [[ "${SYNC_MEDIA:-0}" == "1" ]]; then
  echo_banner "Sync library media → s3://${BUCKET}/tags/ (SYNC_MEDIA=1)"
  echo "NOTE: prefer tag_id-keyed layout; this copies folder names as-is under tags/_folders/"
  aws_cli s3 sync "${ROOT_LIB}/" "s3://${BUCKET}/tags/_folders/" \
    "${DRY[@]}" \
    --exclude "_state/*" \
    --exclude "quarantine/*"
else
  echo "Skipping media sync (set SYNC_MEDIA=1 to upload library files)"
fi

DIST_ID="$(tf_output cloudfront_distribution_id || true)"
if [[ -n "${DIST_ID}" && "${DIST_ID}" != "null" && ${#DRY[@]} -eq 0 ]]; then
  echo_banner "Invalidate CloudFront catalog/index"
  aws_cli cloudfront create-invalidation \
    --distribution-id "${DIST_ID}" \
    --paths "/catalog.json" "/catalog.jsonl" "/index.html" "/state/*" \
    >/dev/null || true
fi

echo "Bucket: s3://${BUCKET}"
echo "Site:   $(tf_output cloudfront_url)"
