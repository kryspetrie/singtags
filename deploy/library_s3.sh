#!/usr/bin/env bash
# Sync local library/ to S3. Never rebuilds or uploads the SPA.
#
# Required: S3_BUCKET
# Optional: S3_PREFIX (site prefix), S3_LIBRARY_PREFIX (default: library),
#           DRY_RUN=1, DEPLOY_ENV=.env.deploy
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/deploy_common.sh
source "$SCRIPT_DIR/lib/deploy_common.sh"

ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
deploy_load_env "$ROOT"

BUCKET="${S3_BUCKET:?Set S3_BUCKET (or put it in .env.deploy)}"
SITE_PREFIX="$(deploy_normalize_prefix "${S3_PREFIX:-}")"
LIB_PREFIX="$(deploy_normalize_prefix "${S3_LIBRARY_PREFIX:-library}")"

if [[ -n "$SITE_PREFIX" ]]; then
  FULL_PREFIX="${SITE_PREFIX}/${LIB_PREFIX}"
else
  FULL_PREFIX="$LIB_PREFIX"
fi

LIBRARY="$ROOT/library"
if [[ ! -d "$LIBRARY" ]]; then
  echo "library/ not found at $LIBRARY — rsync the mirror first." >&2
  exit 1
fi

DEST="$(deploy_s3_uri "$BUCKET" "$FULL_PREFIX")"
DRY=()
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  DRY=(--dryrun)
fi

deploy_require_cmd aws

echo "Syncing library → ${DEST}"
aws s3 sync "$LIBRARY" "$DEST" \
  "${DRY[@]}" \
  --delete \
  --cache-control "public,max-age=86400" \
  --exclude ".venv/*" \
  --exclude "**/__pycache__/*"

echo "Library deployed to ${DEST}"
