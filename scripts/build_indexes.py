#!/usr/bin/env python3
"""Build SingTags static indexes from sample-data (or a full publish root)."""

from __future__ import annotations

import argparse
import gzip
import json
import re
from pathlib import Path

# Bidirectional lyric expansions (pre-fold forms → meaning variants).
BASE_EXPANSIONS: dict[str, list[str]] = {
    "em": ["them"],
    "them": ["em"],
    "every": ["evry", "every"],
    "evry": ["every"],
    "everything": ["evrything", "everything"],
    "evrything": ["everything"],
    "everyone": ["evryone", "everyone"],
    "evryone": ["everyone"],
    "everybody": ["evrybody", "everybody"],
    "evrybody": ["everybody"],
    "oer": ["over"],
    "over": ["oer"],
    "neer": ["never"],
    "never": ["neer"],
    "goin": ["going"],
    "going": ["goin"],
    "lovin": ["loving"],
    "loving": ["lovin"],
    "nothin": ["nothing"],
    "nothing": ["nothin"],
    "somethin": ["something"],
    "something": ["somethin"],
    "darlin": ["darling"],
    "darling": ["darlin"],
    "mornin": ["morning"],
    "morning": ["mornin"],
    "waitin": ["waiting"],
    "waiting": ["waitin"],
    "lookin": ["looking"],
    "looking": ["lookin"],
    "gonna": ["going", "to"],
    "wanna": ["want", "to"],
    "gotta": ["got", "to"],
    "aint": ["aint", "are", "not", "is", "not"],
    "thru": ["through"],
    "through": ["thru"],
    "til": ["until"],
    "until": ["til"],
    "memry": ["memory"],
    "memory": ["memry"],
    "heavn": ["heaven"],
    "heaven": ["heavn"],
    "cause": ["because"],
    "because": ["cause"],
    "round": ["around"],
    "around": ["round"],
    "bout": ["about"],
    "about": ["bout"],
    "cross": ["across"],
    "across": ["cross"],
}


def fold(text: str) -> str:
    s = text.lower()
    s = s.replace("'", "").replace("'", "").replace("`", "")
    s = re.sub(r"[^a-z0-9\s]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def tokens(text: str) -> list[str]:
    f = fold(text)
    return f.split() if f else []


def build(sample: Path, out: Path) -> None:
    tags_dir = sample / "tags"
    core: list[dict] = []
    lyrics: list[dict] = []

    for meta_path in sorted(tags_dir.glob("*/metadata.json")):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        tid = meta.get("tag_id")
        if not isinstance(tid, int):
            continue
        audio = meta.get("audio") or {}
        sheet = meta.get("sheet")
        sheets = meta.get("sheets") if isinstance(meta.get("sheets"), list) else []
        sheet_pages = meta.get("sheet_pages") or (
            [sheet] if isinstance(sheet, str) else []
        )
        row = {
            "id": tid,
            "title": meta.get("title"),
            "altTitle": meta.get("alt_title"),
            "arranger": meta.get("arranger"),
            "key": meta.get("key"),
            "writKey": meta.get("writ_key"),
            "rating": meta.get("rating"),
            "ratingCount": meta.get("rating_count"),
            "downloads": meta.get("download_count"),
            "type": meta.get("type"),
            "collection": meta.get("collection"),
            "classic": meta.get("classic"),
            "year": meta.get("year"),
            "parts": meta.get("parts_count"),
            "hasSheet": bool(sheet_pages or sheet or sheets),
            "audioParts": sorted(audio.keys()) if isinstance(audio, dict) else [],
            "sheetPages": sheet_pages if isinstance(sheet_pages, list) else [],
            "sheet": sheet,
        }
        core.append(row)
        lyr = meta.get("lyrics")
        if lyr:
            lyrics.append({"id": tid, "lyrics": lyr})

    out.mkdir(parents=True, exist_ok=True)

    def write_gz(name: str, payload: object) -> None:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        path = out / name
        with gzip.open(path, "wb", compresslevel=9) as fh:
            fh.write(raw)
        print(f"  {name}: {len(raw)} bytes → {path.stat().st_size} gzip")

    write_gz("core.json.gz", {"version": 1, "tags": core})
    write_gz("lyrics.json.gz", {"version": 1, "docs": lyrics})
    (out / "expansions.json").write_text(
        json.dumps({"version": 1, "map": BASE_EXPANSIONS}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote indexes for {len(core)} tags ({len(lyrics)} with lyrics) → {out}")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--sample",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "sample-data",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "web" / "public" / "indexes",
    )
    args = p.parse_args()
    build(args.sample, args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
