#!/usr/bin/env python3
"""Build Classic Tags chord-sequence fixtures from library pitch_stacks.json.

Same labeling as polecats/build_gold_sequences.py (mirrors labelSequence.ts).
All Classic tags are advisory corpus (no Tag Studio gold gate yet).
"""

from __future__ import annotations

import argparse
import gzip
import json
import statistics
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[2]
LIBRARY = SITE / "library"
OUT_DIR = SITE / "web" / "src" / "domain" / "arranging" / "classicGold" / "fixtures"
IDS_PATH = SITE / "work" / "classic_tag_ids.json"
CORE = SITE / "web" / "public" / "indexes" / "core.json.gz"

# Reuse polecat labeling by import path hack.
sys.path.insert(0, str(SITE / "polecats"))
from build_gold_sequences import build_one  # noqa: E402


def classic_ids() -> list[dict]:
    if IDS_PATH.is_file():
        doc = json.loads(IDS_PATH.read_text())
        return list(doc.get("byClassic") or [])
    with gzip.open(CORE, "rt") as f:
        tags = json.load(f)["tags"]
    classic = sorted(
        [t for t in tags if str(t.get("collection", "")).lower() == "classic"],
        key=lambda t: int(t.get("classic") or 0),
    )
    return [
        {"classic": t.get("classic"), "id": t["id"], "title": t["title"]}
        for t in classic
    ]


def folder_for(tid: int) -> Path | None:
    hits = list(LIBRARY.glob(f"* - {tid}")) + list(LIBRARY.glob(f"*- {tid}"))
    for h in hits:
        if h.is_dir() and (h / "pitch_stacks.json").is_file():
            return h
    # looser: ends with " - {tid}"
    for h in LIBRARY.iterdir():
        if h.is_dir() and h.name.endswith(f" - {tid}") and (h / "pitch_stacks.json").is_file():
            return h
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    ap.add_argument("--id", type=int, action="append", default=[])
    ap.add_argument(
        "--min-pillars",
        type=int,
        default=4,
        help="Skip extracts with fewer pillars (default 4)",
    )
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    meta = classic_ids()
    if args.id:
        want = set(args.id)
        meta = [m for m in meta if int(m["id"]) in want]

    index = []
    skipped = []
    for m in meta:
        tid = int(m["id"])
        folder = folder_for(tid)
        if folder is None:
            skipped.append((tid, "no pitch_stacks"))
            continue
        fix = build_one(folder / "pitch_stacks.json")
        # Enrich with catalog classic #
        fix["classic"] = m.get("classic")
        fix["collection"] = "classic"
        if fix["pillarCount"] < args.min_pillars:
            skipped.append((tid, f"pillars={fix['pillarCount']}"))
            continue
        out = args.out / f"{tid}.json"
        out.write_text(json.dumps(fix, indent=2) + "\n")
        index.append(
            {
                "tagId": tid,
                "classic": m.get("classic"),
                "role": "corpus",
                "file": out.name,
                "title": fix["title"],
                "pillars": fix["pillarCount"],
                "tokens": fix["tokenCount"],
                "pillarRomans": fix["pillarRomans"][:24],
            }
        )
        print(
            f"→ {out.name} c#{m.get('classic')} tokens={fix['tokenCount']} "
            f"pillars={fix['pillarCount']} "
            f"highway={' '.join(fix['pillarRomans'][:12])}"
        )

    ids = [e["tagId"] for e in index]
    (args.out / "index.json").write_text(
        json.dumps(
            {
                "collection": "classic",
                "corpus": ids,
                "gold": [],
                "holdout": ids,
                "fixtures": index,
                "skipped": [{"tagId": t, "reason": r} for t, r in skipped],
            },
            indent=2,
        )
        + "\n"
    )
    print(
        f"Wrote {len(index)} fixtures → {args.out} "
        f"(skipped={len(skipped)})"
    )
    return 0 if index else 1


if __name__ == "__main__":
    raise SystemExit(main())
