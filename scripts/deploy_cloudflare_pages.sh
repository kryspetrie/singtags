#!/usr/bin/env bash
# Deploy SingTags to Cloudflare Pages (static SPA).
#
# Required once:
#   npx wrangler login
#   CF_PAGES_PROJECT=singtags   # create via: npx wrangler pages project create singtags
#
# Optional:
#   VITE_BASE=/                 # Pages custom domains are usually site root
#   VITE_MEDIA_BASE=https://…   # point media at R2 public URL / custom domain
#   SYNC_MEDIA=1                # include sample-data inside the Pages upload (can be huge)
#   BRANCH=main                 # production branch name for Pages
#   SKIP_BUILD=1
#   DEPLOY_ENV=.env.deploy
#
# Large media tip: keep SYNC_MEDIA=0, host sample-data on R2, set VITE_MEDIA_BASE
# to the R2 public URL, then run ./scripts/deploy_r2.sh for media only.
#
# Example:
#   CF_PAGES_PROJECT=singtags ./scripts/deploy_cloudflare_pages.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/deploy_common.sh
source "$SCRIPT_DIR/lib/deploy_common.sh"

ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
deploy_load_env "$ROOT"

PROJECT="${CF_PAGES_PROJECT:?Set CF_PAGES_PROJECT (Pages project name)}"
export VITE_BASE="${VITE_BASE:-/}"
DIST="$ROOT/web/dist"
SAMPLE="${SAMPLE_DATA:-$ROOT/sample-data}"
BRANCH="${BRANCH:-main}"

deploy_require_cmd npx
deploy_build_web "$ROOT"

if [[ "${SYNC_MEDIA:-0}" == "1" ]]; then
  if [[ ! -d "$SAMPLE" ]]; then
    echo "SYNC_MEDIA=1 but SAMPLE_DATA not found: $SAMPLE" >&2
    exit 1
  fi
  echo "Copying media into dist for Pages upload…"
  mkdir -p "$DIST/sample-data"
  rsync -a --delete "$SAMPLE/" "$DIST/sample-data/"
elif [[ -d "$DIST/sample-data" && -n "${VITE_MEDIA_BASE:-}" ]]; then
  echo "VITE_MEDIA_BASE is set — leaving dist/sample-data as built (omit SYNC_MEDIA for smaller uploads)."
fi

echo "Publishing $DIST → Cloudflare Pages project '$PROJECT' (branch=$BRANCH)"
npx --yes wrangler@4 pages deploy "$DIST" \
  --project-name "$PROJECT" \
  --branch "$BRANCH"

cat <<EOF
Done.

SPA routing: in the Cloudflare dashboard → Pages → $PROJECT → Settings → Functions,
or add public/_redirects (copied into dist) with:
  /*    /index.html   200

If media lives on R2, set VITE_MEDIA_BASE to that public URL before build.
EOF
