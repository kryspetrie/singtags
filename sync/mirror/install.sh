#!/bin/bash
# Install mirror pipeline deps into the shared venv at the repo root.
set -euo pipefail

MIRROR_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$MIRROR_DIR/.." && pwd)"
cd "$REPO_ROOT"

python3 -m venv ./.venv
# shellcheck disable=SC1091
source ./.venv/bin/activate
python -m pip install --upgrade pip
pip install -r "$MIRROR_DIR/requirements.txt"

# Prefer user-space micromamba tesseract when system package isn't installed
TESS_BIN="$HOME/micromamba/envs/tesseract/bin"
if [[ -x "$TESS_BIN/tesseract" ]]; then
  export PATH="$TESS_BIN:$PATH"
  echo "Using tesseract from $TESS_BIN"
elif ! command -v tesseract >/dev/null 2>&1; then
  echo "NOTE: tesseract not found. Install with:"
  echo "  micromamba create -y -n tesseract -c conda-forge tesseract"
  echo "  # or: sudo apt-get install tesseract-ocr"
fi

echo ""
echo "Setup complete. Activate with: source ./sync/.venv/bin/activate  (from repo root)"
echo "  or: cd sync && source .venv/bin/activate"
echo "Optional ASR (local GPU): pip install -r mirror/requirements-asr.txt"
echo "Optional ASR (CPU/Lambda): pip install -r mirror/requirements-asr-cpu.txt"
echo "Library path: ../library  (SITE_ROOT/library via sync/lib/config.py)"
echo "Typical workflow:"
echo "  python mirror/inventory.py --delete-guidelines"
echo "  python mirror/sync.py --ids 1,2180,5903   # smoke test"
echo "  python mirror/sync.py --repair --limit 50"
echo "  python mirror/sync.py --frontier"
echo "  python mirror/build_catalog.py"
echo "Lyric review (progress in ../library/_state/):"
echo "  python lyrics/review_queue_gui.py"
