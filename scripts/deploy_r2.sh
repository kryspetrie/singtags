#!/usr/bin/env bash
# Sync SingTags static site (and optional media) to Cloudflare R2 via S3 API.
#
# Required:
#   R2_BUCKET=my-bucket
#   R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
#   AWS credentials with R2 access (env or profile):
#     AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
#     or AWS_PROFILE=r2
#
# Optional:
#   R2_PREFIX=                  # folder inside the bucket (default: root)
#   VITE_BASE=/ or /prefix/     # auto from R2_PREFIX if unset
#   VITE_MEDIA_BASE=https://…   # if media is on a separate public hostname
#   SYNC_MEDIA=1
#   SAMPLE_DATA=/path/to/data
#   SKIP_BUILD=1
#   DRY_RUN=1
#   SITE_ONLY=1                 # upload app+indexes only (no media); same as SYNC_MEDIA=0
#   MEDIA_ONLY=1                # skip app build/sync; only sync sample-data
#   DEPLOY_ENV=.env.deploy
#
# Create an R2 API token in Cloudflare → R2 → Manage R2 API Tokens.
# Endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
#
# Example:
#   R2_BUCKET=singtags R2_ACCOUNT_ID=abc123 ./scripts/deploy_r2.sh
#   MEDIA_ONLY=1 SYNC_MEDIA=1 ./scripts/deploy_r2.sh   # refresh media only
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/deploy_common.sh
source "$SCRIPT_DIR/lib/deploy_common.sh"

ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
deploy_load_env "$ROOT"

BUCKET="${R2_BUCKET:?Set R2_BUCKET}"
ACCOUNT_ID="${R2_ACCOUNT_ID:?Set R2_ACCOUNT_ID}"
PREFIX="$(deploy_normalize_prefix "${R2_PREFIX:-${S3_PREFIX:-}}")"
export VITE_BASE="${VITE_BASE:-$(deploy_vite_base_from_prefix "$PREFIX")}"
DIST="$ROOT/web/dist"
SAMPLE="${SAMPLE_DATA:-$ROOT/sample-data}"
ENDPOINT="https://${ACCOUNT_ID}.r2.cloudflarestorage.com"
DEST="$(deploy_s3_uri "$BUCKET" "$PREFIX")"
DRY=()
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  DRY=(--dryrun)
fi

AWS=(aws --endpoint-url "$ENDPOINT")
deploy_require_cmd aws

if [[ "${MEDIA_ONLY:-0}" != "1" ]]; then
  deploy_build_web "$ROOT"

  echo "Syncing app shell → ${DEST} (R2)"
  "${AWS[@]}" s3 sync "$DIST" "$DEST" \
    "${DRY[@]}" \
    --delete \
    --cache-control "public,max-age=300" \
    --exclude "sample-data/*" \
    --exclude "indexes/*" \
    --exclude "assets/*"

  if [[ -d "$DIST/assets" ]]; then
    echo "Syncing hashed assets (immutable)…"
    "${AWS[@]}" s3 sync "$DIST/assets" "${DEST}assets/" \
      "${DRY[@]}" \
      --cache-control "public,max-age=31536000,immutable"
  fi

  if [[ -d "$DIST/indexes" ]]; then
    echo "Syncing indexes…"
    "${AWS[@]}" s3 sync "$DIST/indexes" "${DEST}indexes/" \
      "${DRY[@]}" \
      --cache-control "public,max-age=3600"
  fi
fi

if [[ "${SYNC_MEDIA:-0}" == "1" || "${MEDIA_ONLY:-0}" == "1" ]]; then
  if [[ ! -d "$SAMPLE" ]]; then
    echo "Media sync requested but SAMPLE_DATA not found: $SAMPLE" >&2
    exit 1
  fi
  echo "Syncing media from $SAMPLE → ${DEST}sample-data/"
  "${AWS[@]}" s3 sync "$SAMPLE" "${DEST}sample-data/" \
    "${DRY[@]}" \
    --cache-control "public,max-age=86400"
fi

echo "Deployed to R2 ${DEST}"
echo "Public access: attach a custom domain or R2.dev subdomain in the Cloudflare R2 dashboard."
echo "For SPA routing behind a custom domain, use a Worker or Cloudflare CDN rules to serve index.html."
