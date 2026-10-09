#!/usr/bin/env python3
"""Precompute TTBB pitch stacks + Tag Studio JSON into each tag folder.

Writes alongside other assets:
  pitch_stacks.json   — timeline + nature guesses
  pitch_studio.json   — SingTags Tag Studio project (import-ready)
  pitch_summary.txt   — human-readable progression

Updates ``metadata.json`` → ``pitch_extract`` + ``parts.pitch_*``.

Examples::

  python audio/extract_pitch_stacks.py --source ../polecats
  python audio/extract_pitch_stacks.py --id 31 --id 90001 --force
  python audio/extract_pitch_stacks.py --limit 20 --workers 4
"""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
_MIRROR_DIR = _REPO_ROOT / "mirror"
for _p in (_REPO_ROOT, _MIRROR_DIR):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json

from lib.config import ROOT_DOWNLOAD_DIR
from lib.pitch_extract import process_folder
from lib.state import iter_tag_folders, load_metadata


def _work(folder_s: str, force: bool, frames: bool) -> tuple[str, dict]:
    folder = Path(folder_s)
    try:
        r = process_folder(folder, write_frames=frames, force=force, write_metadata=True)
        return folder.name, r
    except Exception as exc:
        return folder.name, {"error": str(exc), "folder": folder.name}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", type=Path, default=ROOT_DOWNLOAD_DIR)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--frames", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--id", type=int, action="append", default=[])
    args = ap.parse_args()

    source = args.source.resolve()
    if not source.is_dir():
        ap.error(f"source not found: {source}")

    folders = list(iter_tag_folders(source))
    if args.id:
        want = set(args.id)
        folders = [
            f
            for f in folders
            if int((load_metadata(f) or {}).get("tag_id")
                   or (load_metadata(f) or {}).get("id")
                   or 0)
            in want
        ]
    if args.limit:
        folders = folders[: args.limit]

    counts: Counter[str] = Counter()
    results: list[dict] = []
    print(f"Pitch extract: {len(folders)} folders under {source}", flush=True)

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futs = {
            pool.submit(_work, str(f), args.force, args.frames): f for f in folders
        }
        for fut in as_completed(futs):
            name, r = fut.result()
            if "error" in r:
                counts["error"] += 1
                print(f"  ERROR {name}: {r['error']}", flush=True)
            elif r.get("skipped"):
                counts["skipped"] += 1
                print(f"  skip {name} (stacks={r.get('stacks')})", flush=True)
            else:
                counts["ok"] += 1
                print(
                    f"  ok   {name} stacks={r.get('stacks')} voiced={r.get('voiced')}",
                    flush=True,
                )
            results.append(r)

    index_path = source / "_pitch_extract_index.json"
    index_path.write_text(
        json.dumps(
            {
                "extracted_at": datetime.now(timezone.utc).isoformat(),
                "source": str(source),
                "counts": dict(counts),
                "results": results,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"\nDone: {dict(counts)} → {index_path}", flush=True)
    return 1 if counts.get("error") else 0


if __name__ == "__main__":
    raise SystemExit(main())
