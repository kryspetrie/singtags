#!/usr/bin/env python3
"""Build catalog.jsonl for search / S3 mirror indexing."""

from __future__ import annotations

import sys
from pathlib import Path

_MIRROR_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _MIRROR_DIR.parent
for _p in (_REPO_ROOT, _MIRROR_DIR):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import argparse
import json

from lib.catalog_fields import compact_part_lyrics
from lib.config import ROOT_DOWNLOAD_DIR, STATE_DIR
from lib.state import iter_tag_folders, load_metadata, read_tag_id_from_folder


def catalog_row(meta: dict) -> dict:
    """Compact row for catalog.jsonl / future catalog.json (no ocr_raw / ASR raw)."""
    row = {
        "tag_id": meta.get("tag_id"),
        "title": meta.get("title"),
        "key": meta.get("key"),
        "arranger": meta.get("arranger"),
        "rating": meta.get("rating"),
        "votes": meta.get("votes"),
        "posted_by": meta.get("posted_by"),
        "type": meta.get("type"),
        "lyrics": meta.get("lyrics"),
        "lyrics_source": meta.get("lyrics_source"),
        "keywords": meta.get("keywords"),
        "parts": list((meta.get("parts") or {}).keys()),
        "sheet_format": meta.get("sheet_format"),
        "folder_name": meta.get("folder_name"),
        "source_url": meta.get("source_url"),
        "status": meta.get("status"),
    }
    parts_lyrics = compact_part_lyrics(meta)
    if parts_lyrics:
        row["part_lyrics"] = parts_lyrics
    return row


def main() -> None:
    parser = argparse.ArgumentParser(description="Build catalog.jsonl from metadata.json files")
    parser.add_argument("--root", type=Path, default=ROOT_DOWNLOAD_DIR)
    parser.add_argument(
        "--out",
        type=Path,
        default=STATE_DIR / "catalog.jsonl",
    )
    args = parser.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with args.out.open("w", encoding="utf-8") as fh:
        for folder in iter_tag_folders(args.root):
            meta = load_metadata(folder)
            if not meta:
                tag_id = read_tag_id_from_folder(folder)
                if tag_id is None:
                    continue
                meta = {"tag_id": tag_id, "folder_name": folder.name, "status": "no_metadata"}
            meta.setdefault("folder_name", folder.name)
            fh.write(json.dumps(catalog_row(meta), ensure_ascii=False) + "\n")
            count += 1
    print(f"Wrote {count} rows → {args.out}")


if __name__ == "__main__":
    main()
