#!/usr/bin/env bash
# Deploy the SingTags SPA (+ indexes) to S3. Never syncs library/.
#
# Required: S3_BUCKET
# Optional: S3_PREFIX, VITE_BASE, VITE_MEDIA_BASE, CLOUDFRONT_DISTRIBUTION_ID,
#           SKIP_BUILD=1, DRY_RUN=1, DEPLOY_ENV=.env.deploy
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/deploy_common.sh
source "$SCRIPT_DIR/lib/deploy_common.sh"

ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
deploy_load_env "$ROOT"

BUCKET="${S3_BUCKET:?Set S3_BUCKET (or put it in .env.deploy)}"
PREFIX="$(deploy_normalize_prefix "${S3_PREFIX:-}")"
export VITE_BASE="${VITE_BASE:-$(deploy_vite_base_from_prefix "$PREFIX")}"
# Production media lives on the library prefix (or a CDN in front of it).
if [[ -z "${VITE_MEDIA_BASE:-}" ]]; then
  if [[ -z "$PREFIX" ]]; then
    export VITE_MEDIA_BASE="/library"
  else
    export VITE_MEDIA_BASE="/${PREFIX}/library"
  fi
fi

DIST="$ROOT/web/dist"
DEST="$(deploy_s3_uri "$BUCKET" "$PREFIX")"
DRY=()
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  DRY=(--dryrun)
fi

deploy_require_cmd aws
deploy_build_web "$ROOT"

echo "Syncing app shell → ${DEST}"
aws s3 sync "$DIST" "$DEST" \
  "${DRY[@]}" \
  --delete \
  --cache-control "public,max-age=300" \
  --exclude "library/*" \
  --exclude "indexes/*" \
  --exclude "assets/*"

if [[ -d "$DIST/assets" ]]; then
  echo "Syncing hashed assets (immutable)…"
  aws s3 sync "$DIST/assets" "${DEST}assets/" \
    "${DRY[@]}" \
    --cache-control "public,max-age=31536000,immutable"
fi

if [[ -d "$DIST/indexes" ]]; then
  echo "Syncing indexes…"
  aws s3 sync "$DIST/indexes" "${DEST}indexes/" \
    "${DRY[@]}" \
    --cache-control "public,max-age=3600"
fi

# Slim per-tag metadata published next to the app (not the media library).
if [[ -d "$DIST/tags" ]]; then
  echo "Syncing tag detail JSON…"
  aws s3 sync "$DIST/tags" "${DEST}tags/" \
    "${DRY[@]}" \
    --cache-control "public,max-age=3600"
fi

echo "Website deployed to ${DEST} (library not synced)"

if [[ -n "${CLOUDFRONT_DISTRIBUTION_ID:-}" && "${DRY_RUN:-0}" != "1" ]]; then
  if [[ -z "$PREFIX" ]]; then
    PATHS=("/index.html" "/indexes/*" "/tags/*" "/*")
  else
    PATHS=("/${PREFIX}/index.html" "/${PREFIX}/indexes/*" "/${PREFIX}/tags/*" "/${PREFIX}/*")
  fi
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "${PATHS[@]}"
  echo "CloudFront invalidation submitted"
fi
