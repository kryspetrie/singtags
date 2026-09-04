#!/bin/bash
# Install deps for the mirror pipeline (shared venv at sync/.venv).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec "$ROOT/mirror/install.sh"
