#!/usr/bin/env python3
"""Convert polecat pitch-stack extractions → Tag Studio project JSON.

Reads ``work/polecat-pitch-stacks/{id}/stacks.json`` and writes
``web/public/tag-studio/polecat-pitch-reviews/{id}.json`` plus ``index.json``.
"""

from __future__ import annotations

import argparse
import json
import math
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
STACKS_ROOT = REPO / "work" / "polecat-pitch-stacks"
OUT_DIR = REPO / "web" / "public" / "tag-studio" / "polecat-pitch-reviews"

PPQ = 480
BPM = 104
MIDI_MIN = 36
MIDI_MAX = 83
SNAP = 240  # 8th @ 480 ppq — polecat charts almost never need 16ths

PART_DEFS = [
    ("tenor", "Tenor", "#c45c26", "upper", "t"),
    ("lead", "Lead", "#1d6a9f", "upper", "l"),
    ("bari", "Bari", "#2f7d4a", "lower", "r"),
    ("bass", "Bass", "#5b3d8f", "lower", "b"),
]

NATURE_TO_SKETCH = {
    "major": "major",
    "minor": "minor",
    "seventh": "seventh",
    "m7": "m7",
    "dim7": "dim7",
    "halfdim": "half-dim",
    "aug": "aug",
    "sixth": "sixth",
    "madd6": "madd6",
    "ninth": "ninth",
    "unknown": "major",
}


def uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4()}"


def clamp_midi(m: int) -> int:
    while m < MIDI_MIN:
        m += 12
    while m > MIDI_MAX:
        m -= 12
    return max(MIDI_MIN, min(MIDI_MAX, m))


def sec_to_tick(sec: float, bpm: float = BPM) -> int:
    return int(round(sec * (bpm / 60.0) * PPQ))


def quantize(tick: int, snap: int = SNAP) -> int:
    return int(round(tick / snap) * snap)


def build_project(stacks_doc: dict, *, title_prefix: str | None = None) -> dict:
    tag_id = int(stacks_doc["id"])
    tonality = int(stacks_doc.get("tonality") or 0)
    mode = stacks_doc.get("mode") or "major"
    prefer_flats = tonality in (1, 3, 5, 8, 10)  # Db Eb F Ab Bb families often flat
    bpm = float(stacks_doc.get("bpm") or BPM)
    if bpm < 40 or bpm > 220:
        bpm = float(BPM)
    ts = stacks_doc.get("timeSignature") if isinstance(stacks_doc.get("timeSignature"), dict) else {}
    ts_num = int(ts.get("numerator") or 4)
    ts_den = int(ts.get("denominator") or 4)
    if ts_num not in (2, 3, 4, 6):
        ts_num = 4
    if ts_den not in (2, 4, 8):
        ts_den = 4
    base_title = (stacks_doc.get("title") or f"Tag {tag_id}").strip()
    if title_prefix:
        title = f"{title_prefix}{base_title}"
    else:
        title = f"{base_title} (pitch)"
    arranger = stacks_doc.get("arranger") or ""

    part_ids = {key: uid("trp") for key, *_ in PART_DEFS}
    parts = [
        {
            "id": part_ids[key],
            "name": name,
            "color": color,
            "midiGroup": group,
            "hotkey": hotkey,
        }
        for key, name, color, group, hotkey in PART_DEFS
    ]
    mix = [
        {
            "partId": part_ids[key],
            "volume": 1.0 if key == "lead" else 0.85,
            "pan": {"tenor": -0.55, "lead": -0.15, "bari": 0.55, "bass": 0.2}[key],
            "mute": False,
            "solo": False,
        }
        for key, *_ in PART_DEFS
    ]

    notes = []
    sketch = []
    end_tick = PPQ * ts_num  # at least one bar
    for i, st in enumerate(stacks_doc.get("stacks") or []):
        t0 = quantize(sec_to_tick(float(st["t0"]), bpm))
        t1 = quantize(sec_to_tick(float(st["t1"]), bpm))
        if t1 <= t0:
            t1 = t0 + SNAP
        dur = max(SNAP, t1 - t0)
        midi = st.get("midi") or {}
        for key in ("tenor", "lead", "bari", "bass"):
            if key not in midi:
                continue
            m = clamp_midi(int(midi[key]))
            notes.append(
                {
                    "id": uid("trn"),
                    "partId": part_ids[key],
                    "midi": m,
                    "startTick": t0,
                    "durationTicks": dur,
                    **({"role": "pmn"} if key == "lead" else {}),
                }
            )
        nature = st.get("natureId") or "unknown"
        quality = NATURE_TO_SKETCH.get(nature, "major")
        if nature != "unknown" and float(st.get("confidence") or 0) >= 0.35:
            sketch.append(
                {
                    "id": uid("ths"),
                    "startTick": t0,
                    "endTick": t0 + dur,
                    "rootPc": int(st.get("rootPc") or 0),
                    "quality": quality,
                    "source": "detect",
                    "locked": False,
                    "pillar": False,
                }
            )
        end_tick = max(end_tick, t0 + dur)

    # Pad a bar of silence at the end for playhead room
    length_ticks = quantize(end_tick + PPQ * ts_num, PPQ)

    lead_id = part_ids["lead"]
    return {
        "schema": "singtags.tagRoll.project.v1",
        "id": f"pitch-tag-{tag_id}",
        "title": title,
        "subtitle": f"Audio pitch extract · tag {tag_id}",
        "composer": "Learning-track YIN extract",
        "arranger": arranger,
        "sheetNote": (
            "Precomputed from learning-track audio (Solo.opus / solo channel + audio_align). "
            "Blown pitch stripped, gaps compressed, tempo-quantized — edit freely."
        ),
        "bpm": bpm,
        "ppq": PPQ,
        "snapTicks": int(stacks_doc.get("snapTicks") or SNAP),
        "lengthTicks": length_ticks,
        "timeSignature": {"numerator": ts_num, "denominator": ts_den},
        "tempoMarkers": [{"id": uid("trt"), "tick": 0, "bpm": bpm}],
        "keyMarkers": [
            {
                "id": uid("trk"),
                "tick": 0,
                "tonality": tonality,
                "tonalityMode": mode,
                "preferFlats": prefer_flats,
            }
        ],
        "expressions": [],
        "soundEngine": "synth",
        "pitchPipeSoundId": "mellow",
        "blowPitchEnabled": False,
        "metronomeEnabled": False,
        "metronomeSwing": True,
        "swing": {"enabled": False, "unit": "eighth", "style": "triplet", "amount": 0},
        "midiBakeSwing": True,
        "soundEnvelope": {
            "attackSec": 0.05,
            "decaySec": 0.05,
            "phraseDecaySec": 0.6,
        },
        "tonality": tonality,
        "tonalityMode": mode,
        "preferFlats": prefer_flats,
        "clefFamily": "ttbb",
        "parts": parts,
        "mix": mix,
        "notes": notes,
        "melodyPasses": [],
        "harmonySketch": sketch,
        "localEntryId": None,
        "view": {
            "cellW": 22,
            "cellH": 14,
            "scrollX": 0,
            "scrollY": (MIDI_MAX - 60) * 14,
            "lockPiano": False,
            "mode": "compose",
            "activePartId": lead_id,
            "melodyPartId": lead_id,
            "playheadTick": 0,
            "focusActivePart": False,
            "scaleHighlight": True,
            "roleDisplay": "off",
            "showNoteNames": True,
            "showNoteLyrics": False,
            "scoreSurface": "roll",
            "sheetZoom": 40,
            "sheetShowLyrics": False,
            "sheetLayout": "continuous",
            "sheetMeasureSizing": "dynamic",
            "sheetNoteColors": False,
            "sheetStaveGap": "normal",
            "sheetMeasureScale": 1,
            "sheetNoteSpacing": 1,
            "sheetBeatStretch": 1,
            "sheetStaveGapFine": 1,
            "sheetSystemGap": 1,
            "sheetTopMargin": 1,
            "sheetLyricSize": 12,
            "sheetLyricOffsets": {},
            "sheetPlaybackHighlight": True,
            "sheetShowSketchChords": True,
            "sheetShowDetectedChords": True,
            "sheetShowEngravedHeader": True,
            "sheetShowEngravedFooter": True,
            "sheetPadding": 1,
            "sheetMinBarWidth": 1,
            "sheetClefGutter": 1,
            "sheetTimeFactor": 1,
            "sheetBottomMargin": 1,
            "sheetMarginLeftIn": 0.5,
            "sheetMarginRightIn": 0.5,
            "sheetMarginTopIn": 0.5,
            "sheetMarginBottomIn": 0.5,
            "sheetEngravingScale": 1,
            "sheetScoreScale": 1,
            "sheetPageWidthIn": 8.5,
            "sheetPageHeightIn": 11,
            "sheetPageDpi": 96,
            "sheetMusicFont": "bravura",
            "sheetTextFont": "sans",
            "sheetStaffLineWeight": 1,
            "sheetPartNames": True,
            "sheetFormatByLayout": {},
            "sheetScrollX": 0,
            "sheetScrollY": 0,
        },
        "createdAt": 0,
        "updatedAt": 0,
        "source": {
            "kind": "polecat-pitch-extract",
            "tagId": tag_id,
            "method": stacks_doc.get("method"),
            "stackCount": stacks_doc.get("stack_count"),
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--stacks-root", type=Path, default=STACKS_ROOT)
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    index = []
    for path in sorted(args.stacks_root.glob("*/stacks.json")):
        doc = json.loads(path.read_text())
        project = build_project(doc)
        out_path = args.out / f"{doc['id']}.json"
        # Strip non-schema helper before write? keep source — normalize may drop unknown keys
        out_path.write_text(json.dumps(project, indent=2) + "\n")
        index.append(
            {
                "id": project["id"],
                "tagId": doc["id"],
                "title": project["title"],
                "file": out_path.name,
                "notes": len(project["notes"]),
                "stacks": len(project["harmonySketch"]),
            }
        )
        print(f"→ {out_path.name}  notes={len(project['notes'])} sketch={len(project['harmonySketch'])}")

    (args.out / "index.json").write_text(
        json.dumps({"projects": index, "count": len(index)}, indent=2) + "\n"
    )
    print(f"Wrote {len(index)} projects → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
