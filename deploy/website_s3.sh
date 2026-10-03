#!/usr/bin/env bash
# Deploy the SingTags SPA (+ indexes) to S3. Never syncs library/.
#
# Cost notes:
# - Never `aws s3 sync` the whole dist → bucket root. That LISTs library/ too.
# - Sync each website-owned prefix on its own (scoped LIST + optional --delete).
# - Use --size-only on bulk trees so Vite/index rebuilds don't re-PUT identical
#   tags/*.json just because mtimes changed (default sync treats newer mtime as dirty).
# - Copy root shell files with `aws s3 cp` (no bucket-wide LIST).
#
# Required: S3_BUCKET
# Optional: S3_PREFIX, VITE_BASE, VITE_MEDIA_BASE, SKIP_BUILD=1, DRY_RUN=1,
#           SIZE_ONLY=0 (disable --size-only on prefix syncs), DEPLOY_ENV=.env.deploy
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

SIZE_ONLY_ARGS=()
if [[ "${SIZE_ONLY:-1}" != "0" ]]; then
  SIZE_ONLY_ARGS=(--size-only)
fi

deploy_require_cmd aws
deploy_require_cmd python3
deploy_build_web "$ROOT"

# Upload hashed assets BEFORE index.html. Otherwise a mid-deploy visitor (or
# Cloudflare) can cache 404s for immutable /assets/* URLs and the shell breaks
# until purge / new hashes.
sync_site_prefix() {
  local rel="$1"
  local cache_control="$2"
  local src="$DIST/$rel"
  if [[ ! -d "$src" ]]; then
    return 0
  fi
  echo "Syncing ${rel}/…"
  aws s3 sync "$src" "${DEST}${rel}/" \
    "${DRY[@]}" \
    "${SIZE_ONLY_ARGS[@]}" \
    --delete \
    --cache-control "$cache_control"
}

sync_site_prefix assets "public,max-age=31536000,immutable"
sync_site_prefix indexes "public,max-age=3600"
# Slim per-tag metadata published next to the app (not the media library).
sync_site_prefix tags "public,max-age=3600"
sync_site_prefix education "public,max-age=300"
sync_site_prefix instruments "public,max-age=300"
sync_site_prefix install-help "public,max-age=300"

# Root shell / PWA files: copy by name so we never LIST library/ (or tags/).
echo "Uploading app shell (root files)…"
shopt -s nullglob
root_files=("$DIST"/*)
shopt -u nullglob
for f in "${root_files[@]}"; do
  [[ -f "$f" ]] || continue
  base="$(basename "$f")"
  # Always upload shell files (no --size-only): same-size HTML/JS edits must ship.
  aws s3 cp "$f" "${DEST}${base}" \
    "${DRY[@]}" \
    --cache-control "public,max-age=300"
done

# Remove obsolete root-level website objects (e.g. old workbox-*.js). Uses a
# delimiter listing so library/ and other prefixes are not enumerated.
echo "Cleaning obsolete root objects…"
LIST_PREFIX=""
if [[ -n "$PREFIX" ]]; then
  LIST_PREFIX="${PREFIX}/"
fi

# Collect remote root keys (basename → full key) via delimiter listing.
mapfile -t remote_root_keys < <(
  PREFIX_Q="$LIST_PREFIX" BUCKET_Q="$BUCKET" python3 - <<'PY'
import json, os, subprocess, sys

bucket = os.environ["BUCKET_Q"]
prefix = os.environ.get("PREFIX_Q", "")
token = None
while True:
    cmd = [
        "aws", "s3api", "list-objects-v2",
        "--bucket", bucket,
        "--delimiter", "/",
        "--output", "json",
    ]
    if prefix:
        cmd.extend(["--prefix", prefix])
    if token:
        cmd.extend(["--continuation-token", token])
    out = subprocess.check_output(cmd, text=True)
    data = json.loads(out or "{}")
    for obj in data.get("Contents") or []:
        key = obj.get("Key") or ""
        if key and not key.endswith("/"):
            print(key)
    token = data.get("NextContinuationToken")
    if not token:
        break
PY
)

declare -A local_root=()
for f in "${root_files[@]}"; do
  [[ -f "$f" ]] || continue
  local_root["$(basename "$f")"]=1
done

for key in "${remote_root_keys[@]:-}"; do
  [[ -n "$key" ]] || continue
  base="$(basename "$key")"
  if [[ -n "${local_root[$base]:-}" ]]; then
    continue
  fi
  echo "delete: s3://${BUCKET}/${key}"
  aws s3 rm "s3://${BUCKET}/${key}" "${DRY[@]}"
done

echo "Website deployed to ${DEST} (library not synced)"
