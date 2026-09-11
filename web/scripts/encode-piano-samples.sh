#!/usr/bin/env bash
# Encode Leethring piano MP3s → Ogg Opus at web/public/instruments/piano/m{midi}.opus
#
# Usage:
#   ./web/scripts/encode-piano-samples.sh
#   ./web/scripts/encode-piano-samples.sh --midi-min 36 --midi-max 89
#
# Requires: curl, ffmpeg
# Source: https://github.com/Leethring/piano-sound-samples (MIT)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/web/public/instruments/piano"
SRC_BASE="https://raw.githubusercontent.com/Leethring/piano-sound-samples/master/sound_keyboard_staff"
TMP="${TMPDIR:-/tmp}/singtags-piano-encode-$$"
MIDI_MIN=36
MIDI_MAX=101
BITRATE="48k"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --midi-min) MIDI_MIN="$2"; shift 2 ;;
    --midi-max) MIDI_MAX="$2"; shift 2 ;;
    --bitrate) BITRATE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$OUT" "$TMP"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

# Mirror of web/src/audio/pianoSamples.ts leethringStemForMidi
stem_for_midi() {
  local midi=$1
  local pc=$((midi % 12))
  local sharp=0
  case $pc in 1|3|6|8|10) sharp=1 ;; esac
  local letters=(C C D D E F F G G A A B)
  local letter=${letters[$pc]}
  local natural_midi=$midi
  if [[ $sharp -eq 1 ]]; then natural_midi=$((midi - 1)); fi
  local nat_oct=$((natural_midi / 12 - 1))
  local base=""
  if [[ $natural_midi -le 23 ]]; then
    base="${letter}_2"
  elif [[ $nat_oct -eq 1 ]]; then
    base="${letter}_1"
  elif [[ $nat_oct -eq 2 ]]; then
    base="$letter"
  elif [[ $nat_oct -eq 3 ]]; then
    local L
    L=$(echo "$letter" | tr '[:upper:]' '[:lower:]')
    base="${L}${L}"
  elif [[ $nat_oct -ge 4 && $nat_oct -le 7 ]]; then
    local L n
    L=$(echo "$letter" | tr '[:upper:]' '[:lower:]')
    n=$((nat_oct - 3))
    base="${L}${n}"
  elif [[ $natural_midi -eq 108 ]]; then
    base="c5"
  else
    return 1
  fi
  if [[ $sharp -eq 1 ]]; then
    echo "${base}s"
  else
    echo "$base"
  fi
}

echo "Encoding MIDI $MIDI_MIN–$MIDI_MAX → $OUT (opus $BITRATE)"
ok=0
fail=0
for midi in $(seq "$MIDI_MIN" "$MIDI_MAX"); do
  stem="$(stem_for_midi "$midi" || true)"
  if [[ -z "${stem:-}" ]]; then
    echo "skip $midi (no stem)"
    continue
  fi
  # URL-encode spaces in names like "a high"
  enc_stem=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$stem")
  url="$SRC_BASE/${enc_stem}.mp3"
  mp3="$TMP/m${midi}.mp3"
  opus="$OUT/m${midi}.opus"
  if [[ -f "$opus" && -s "$opus" ]]; then
    echo "exists m${midi}.opus"
    ok=$((ok + 1))
    continue
  fi
  if ! curl -fsSL "$url" -o "$mp3"; then
    echo "FAIL download midi=$midi stem=$stem" >&2
    fail=$((fail + 1))
    continue
  fi
  if ! ffmpeg -y -loglevel error -i "$mp3" -c:a libopus -b:a "$BITRATE" -ac 1 -ar 48000 "$opus"; then
    echo "FAIL encode midi=$midi" >&2
    fail=$((fail + 1))
    rm -f "$opus"
    continue
  fi
  echo "ok m${midi}.opus ← ${stem}.mp3"
  ok=$((ok + 1))
done

cat > "$OUT/NOTICE" <<'EOF'
Acoustic piano samples
======================

Derived from Leethring / Liam Lee “piano-sound-samples” (MIT License):
https://github.com/Leethring/piano-sound-samples

Files here are re-encoded as Ogg Opus (mono, ~48 kbps) for SingTags.
Original MuseScore exports © contributors; keep this NOTICE with redistributions.

Re-encode:
  ./web/scripts/encode-piano-samples.sh
EOF

echo "Done: $ok ok, $fail failed"
exit $([[ $fail -eq 0 ]] && echo 0 || echo 1)
