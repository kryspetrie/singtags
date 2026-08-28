#!/usr/bin/env bash
# Dispatcher: deploy website, library, or both.
#
# Usage:
#   ./deploy/publish.sh website
#   ./deploy/publish.sh library
#   ./deploy/publish.sh all
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-}"

usage() {
  echo "Usage: $0 website|library|all" >&2
  exit 2
}

[[ -n "$TARGET" ]] || usage

case "$TARGET" in
  website)
    exec "$SCRIPT_DIR/website_s3.sh"
    ;;
  library)
    exec "$SCRIPT_DIR/library_s3.sh"
    ;;
  all)
    "$SCRIPT_DIR/website_s3.sh"
    "$SCRIPT_DIR/library_s3.sh"
    ;;
  *)
    usage
    ;;
esac
