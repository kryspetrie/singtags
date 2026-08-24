#!/usr/bin/env bash
# Deploy SingTags static site to Amazon S3 (CloudFront invalidation optional).
#
# Required:
#   S3_BUCKET=my-bucket
#
# Optional:
#   S3_PREFIX=singtags          # folder inside the bucket (default: site at bucket root)
#   VITE_BASE=/singtags/        # auto-derived from S3_PREFIX if unset
#   VITE_MEDIA_BASE=https://…   # absolute media CDN URL (skips uploading sample-data into dist)
#   SYNC_MEDIA=1                # also sync sample-data/ (large)
#   SAMPLE_DATA=/path/to/data   # media root (default: ./sample-data)
#   CLOUDFRONT_DISTRIBUTION_ID= # invalidate after upload
#   SKIP_BUILD=1                # reuse existing web/dist
#   DRY_RUN=1                   # aws s3 sync --dryrun
#   DEPLOY_ENV=.env.deploy      # optional env file
#
# Example:
#   S3_BUCKET=my-site ./scripts/deploy_s3.sh
#   S3_BUCKET=my-site S3_PREFIX=singtags SYNC_MEDIA=1 ./scripts/deploy_s3.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/deploy_common.sh
source "$SCRIPT_DIR/lib/deploy_common.sh"

ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
deploy_load_env "$ROOT"

BUCKET="${S3_BUCKET:?Set S3_BUCKET (or put it in .env.deploy)}"
PREFIX="$(deploy_normalize_prefix "${S3_PREFIX:-}")"
export VITE_BASE="${VITE_BASE:-$(deploy_vite_base_from_prefix "$PREFIX")}"
DIST="$ROOT/web/dist"
SAMPLE="${SAMPLE_DATA:-$ROOT/sample-data}"
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
  --exclude "sample-data/*" \
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

if [[ "${SYNC_MEDIA:-0}" == "1" ]]; then
  if [[ ! -d "$SAMPLE" ]]; then
    echo "SYNC_MEDIA=1 but SAMPLE_DATA not found: $SAMPLE" >&2
    exit 1
  fi
  echo "Syncing media from $SAMPLE …"
  aws s3 sync "$SAMPLE" "${DEST}sample-data/" \
    "${DRY[@]}" \
    --cache-control "public,max-age=86400"
fi

echo "Deployed site to ${DEST}"

if [[ -n "${CLOUDFRONT_DISTRIBUTION_ID:-}" && "${DRY_RUN:-0}" != "1" ]]; then
  if [[ -z "$PREFIX" ]]; then
    PATHS=("/index.html" "/indexes/*" "/*")
  else
    PATHS=("/${PREFIX}/index.html" "/${PREFIX}/indexes/*" "/${PREFIX}/*")
  fi
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "${PATHS[@]}"
  echo "CloudFront invalidation submitted for ${CLOUDFRONT_DISTRIBUTION_ID}"
fi

cat <<EOF
Done.

CloudFront (one-time):
  - Origin = S3 via OAC
  - ACM cert in us-east-1 for custom domain
  - Custom errors 403/404 → ${VITE_BASE}index.html (HTTP 200) for Vue Router
EOF
