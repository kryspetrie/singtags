#!/usr/bin/env bash
# Download Tag Studio sheet fonts into public/tag-studio/sheet-fonts/
# (mirrors VexFlow Font.FILES paths under @vexflow-fonts).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FONTS_DIR="$ROOT/public/tag-studio/sheet-fonts"
BASE='https://cdn.jsdelivr.net/npm/@vexflow-fonts'
mkdir -p "$FONTS_DIR"

download() {
  local rel="$1"
  local pkg="${rel%%/*}"
  local file="${rel#*/}"
  local out="$FONTS_DIR/$rel"
  mkdir -p "$(dirname "$out")"
  if [[ -f "$out" && -s "$out" ]]; then
    echo "exists $rel"
    return 0
  fi
  local url="$BASE/$pkg/$file"
  echo "GET $url"
  curl -fsSL "$url" -o "$out"
}

# Picker music + text faces (woff2 for screen/raster, otf for vector outlines).
for rel in \
  bravura/bravura.woff2 bravura/bravura.otf \
  petaluma/petaluma.woff2 petaluma/petaluma.otf \
  leland/leland.woff2 leland/leland.otf \
  finalemaestro/finalemaestro.woff2 finalemaestro/finalemaestro.otf \
  academico/academico.woff2 academico/academico.otf \
  academico/academico-bold.woff2 academico/academico-bold.otf \
  petalumatext/petalumatext.woff2 petalumatext/petalumatext.otf \
  petalumascript/petalumascript.woff2 petalumascript/petalumascript.otf \
  lelandtext/lelandtext.woff2 lelandtext/lelandtext.otf \
  robotoslab/robotoslab-regular-400.woff2 robotoslab/robotoslab-regular-400.otf \
  finalemaestrotext/finalemaestrotext-regular.woff2 \
  finalemaestrotext/finalemaestrotext-regular.otf
do
  download "$rel"
done

echo "Fonts ready under $FONTS_DIR ($(du -sh "$FONTS_DIR" | awk '{print $1}'))"
