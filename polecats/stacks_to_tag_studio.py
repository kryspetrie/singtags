#!/usr/bin/env python3
"""Copy gold-standard polecat ``pitch_studio.json`` files into Tag Studio seeds.

Expects ``python polecats/extract_pitch_stacks.py`` (or sync audio extract) first.

Only the Coach-eval gold set is published (not every polecat folder).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

POLECATS = Path(__file__).resolve().parent
OUT_DIR = POLECATS.parent / "web" / "public" / "tag-studio" / "polecat-pitch-reviews"

# Quintessential basic charts for Coach / weight validation.
GOLD_TAG_IDS = frozenset(
    {
        90001,  # My Wild Irish Rose
        90003,  # Sweet And Lovely
        90006,  # Let Me Call You Sweetheart
        90009,  # The Story of the Rose (Heart of My Heart)
    }
)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    ap.add_argument(
        "--all",
        action="store_true",
        help="Publish every polecat with pitch_studio.json (default: gold set only).",
    )
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    index = []
    kept_files: set[str] = set()
    for folder in sorted(POLECATS.iterdir()):
        if not folder.is_dir():
            continue
        studio_path = folder / "pitch_studio.json"
        stacks_path = folder / "pitch_stacks.json"
        if not studio_path.is_file() or not stacks_path.is_file():
            continue
        stacks = json.loads(stacks_path.read_text())
        tag_id = int(stacks.get("id") or 0)
        if not tag_id:
            continue
        if not args.all and tag_id not in GOLD_TAG_IDS:
            continue
        doc = json.loads(studio_path.read_text())
        doc["id"] = f"seed-polecat-pitch-{tag_id}"
        base = (stacks.get("title") or doc.get("title") or str(tag_id)).strip()
        if base.endswith(" (pitch)"):
            base = base[: -len(" (pitch)")]
        doc["title"] = f"Polecat pitch · {base}"
        out_path = args.out / f"{tag_id}.json"
        out_path.write_text(json.dumps(doc, indent=2) + "\n")
        kept_files.add(out_path.name)
        index.append(
            {
                "id": doc["id"],
                "tagId": tag_id,
                "title": doc["title"],
                "file": out_path.name,
                "notes": len(doc.get("notes") or []),
                "stacks": len(doc.get("harmonySketch") or []),
            }
        )
        print(f"→ {out_path.name}")

    # Drop stale seed JSON left from a broader publish.
    for stale in args.out.glob("*.json"):
        if stale.name in ("index.json",):
            continue
        if stale.name not in kept_files:
            stale.unlink()
            print(f"✗ removed {stale.name}")

    index.sort(key=lambda e: e["tagId"])
    (args.out / "index.json").write_text(
        json.dumps({"projects": index, "count": len(index), "gold": sorted(GOLD_TAG_IDS)}, indent=2)
        + "\n"
    )
    print(f"Wrote {len(index)} → {args.out}")
    return 0 if index else 1


if __name__ == "__main__":
    raise SystemExit(main())
