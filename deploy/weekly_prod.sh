#!/usr/bin/env bash
# Weekly SingTags production refresh — single S3 bucket (singtags-prod).
#
#   sync (bulk-meta + frontier) → build indexes + offline manifests → publish library + website
#
# Usage (from repo root):
#   ./deploy/weekly_prod.sh
#   ./deploy/weekly_prod.sh --skip-sync          # indexes + publish only
#   ./deploy/weekly_prod.sh --sync-only          # mirror only
#   ./deploy/weekly_prod.sh --miss-limit 100
#   DRY_RUN=1 ./deploy/weekly_prod.sh
#
# Requires: sync/.venv, library/, .env.deploy (S3_BUCKET) for publish steps.
# Docs: sync/docs/WEEKLY_PROD_SYNC.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

SKIP_SYNC=0
SYNC_ONLY=0
MISS_LIMIT="${MISS_LIMIT:-200}"

usage() {
  sed -n '2,16p' "$0"
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-sync) SKIP_SYNC=1; shift ;;
    --sync-only) SYNC_ONLY=1; shift ;;
    --miss-limit)
      MISS_LIMIT="${2:?}"
      shift 2
      ;;
    -h|--help) usage ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      ;;
  esac
done

LIBRARY="$ROOT/library"
if [[ ! -d "$LIBRARY" ]]; then
  echo "library/ missing at $LIBRARY — populate via sync/ first." >&2
  exit 1
fi

VENV="$ROOT/sync/.venv"
if [[ ! -x "$VENV/bin/python" ]]; then
  echo "sync/.venv missing — run: cd sync && ./install.sh" >&2
  exit 1
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"

echo "=== Weekly prod refresh (root=$ROOT, miss_limit=$MISS_LIMIT) ==="

if [[ "$SKIP_SYNC" -eq 0 ]]; then
  echo "--- sync: bulk-meta ---"
  (cd "$ROOT/sync" && python mirror/sync.py --bulk-meta)
  echo "--- sync: frontier ---"
  (cd "$ROOT/sync" && python mirror/sync.py --frontier --miss-limit "$MISS_LIMIT")
else
  echo "--- sync: skipped (--skip-sync) ---"
fi

if [[ "$SYNC_ONLY" -eq 1 ]]; then
  echo "=== Done (sync-only) ==="
  exit 0
fi

echo "--- build: indexes ---"
python3 "$ROOT/build/build_indexes.py"
echo "--- build: offline manifests ---"
python3 "$ROOT/build/build_offline_manifest.py"

echo "--- deploy: library ---"
"$ROOT/deploy/publish.sh" library
echo "--- deploy: website ---"
"$ROOT/deploy/publish.sh" website

echo "=== Weekly prod refresh complete ==="
