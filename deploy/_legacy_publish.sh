#!/usr/bin/env bash
# One entrypoint for publishing SingTags.
#
# Usage:
#   ./scripts/publish.sh s3
#   ./scripts/publish.sh pages    # Cloudflare Pages
#   ./scripts/publish.sh r2       # Cloudflare R2
#   ./scripts/publish.sh help
#
# Pass through env vars documented in each deploy_*.sh (or use .env.deploy).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-}"

usage() {
  cat <<'EOF'
Publish SingTags static site.

  ./scripts/publish.sh s3       Amazon S3 (+ optional CloudFront)
  ./scripts/publish.sh pages    Cloudflare Pages
  ./scripts/publish.sh r2       Cloudflare R2 (S3-compatible)

Copy .env.deploy.example → .env.deploy and fill in credentials/bucket names.
EOF
}

case "$TARGET" in
  s3|S3)
    exec "$SCRIPT_DIR/deploy_s3.sh"
    ;;
  pages|cf|cloudflare|cloudflare-pages)
    exec "$SCRIPT_DIR/deploy_cloudflare_pages.sh"
    ;;
  r2|R2)
    exec "$SCRIPT_DIR/deploy_r2.sh"
    ;;
  help|-h|--help|"")
    usage
    [[ -n "$TARGET" ]] || exit 1
    exit 0
    ;;
  *)
    echo "Unknown target: $TARGET" >&2
    usage >&2
    exit 1
    ;;
esac
