#!/usr/bin/env bash
# Shared helpers for static deploy scripts. Source from repo scripts only.
# shellcheck shell=bash

deploy_root() {
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
  cd "$here/.." && pwd
}

# Load optional env file: DEPLOY_ENV, else repo-root .env.deploy
deploy_load_env() {
  local root="$1"
  local file="${DEPLOY_ENV:-}"
  if [[ -z "$file" && -f "$root/.env.deploy" ]]; then
    file="$root/.env.deploy"
  fi
  if [[ -n "$file" ]]; then
    if [[ ! -f "$file" ]]; then
      echo "DEPLOY_ENV file not found: $file" >&2
      exit 1
    fi
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

# Normalize S3/R2 key prefix (no leading/trailing slash). Empty = bucket root.
deploy_normalize_prefix() {
  local p="${1:-}"
  p="${p#/}"
  p="${p%/}"
  printf '%s' "$p"
}

# Vite base from prefix: "" → "/", "singtags" → "/singtags/"
deploy_vite_base_from_prefix() {
  local prefix
  prefix="$(deploy_normalize_prefix "${1:-}")"
  if [[ -z "$prefix" ]]; then
    printf '/'
  else
    printf '/%s/' "$prefix"
  fi
}

deploy_require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

# Build the Vue app into web/dist. Honors SKIP_BUILD=1, VITE_BASE, VITE_MEDIA_BASE.
deploy_build_web() {
  local root="$1"
  if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
    if [[ ! -f "$root/web/dist/index.html" ]]; then
      echo "SKIP_BUILD=1 but web/dist/index.html is missing — run a build first." >&2
      exit 1
    fi
    echo "Skipping build (SKIP_BUILD=1)"
    return 0
  fi
  echo "Building web (VITE_BASE=${VITE_BASE:-/}${VITE_MEDIA_BASE:+ VITE_MEDIA_BASE=$VITE_MEDIA_BASE})"
  (cd "$root/web" && npm run build)
}

deploy_s3_uri() {
  local bucket="$1"
  local prefix
  prefix="$(deploy_normalize_prefix "${2:-}")"
  if [[ -z "$prefix" ]]; then
    printf 's3://%s/' "$bucket"
  else
    printf 's3://%s/%s/' "$bucket" "$prefix"
  fi
}
