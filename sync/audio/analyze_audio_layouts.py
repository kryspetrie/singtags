#!/usr/bin/env python3
"""Analyze learning-track stereo layouts into metadata.json for the whole library."""

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


from lib.audio_layout import ensure_audio_layouts
from lib.config import ROOT_DOWNLOAD_DIR
from lib.state import iter_tag_folders, load_metadata, save_metadata


def _work(folder_s: str, force: bool, dry_run: bool) -> tuple[str, str, dict | None, str | None]:
    folder = Path(folder_s)
    try:
        meta = load_metadata(folder)
        if not meta:
            return folder.name, "no_meta", None, None
        before = meta.get("audio_layout_summary")
        changed = ensure_audio_layouts(folder, meta, force=force)
        summary = meta.get("audio_layout_summary")
        if dry_run:
            return folder.name, "dry", summary, None
        if changed or before != summary:
            save_metadata(folder, meta)
            return folder.name, "updated", summary, None
        return folder.name, "skipped", summary, None
    except Exception as exc:
        return folder.name, "error", None, str(exc)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=ROOT_DOWNLOAD_DIR,
    )
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--id", type=int, action="append", default=[])
    args = parser.parse_args()

    source = args.source.resolve()
    if not source.is_dir():
        parser.error(f"source not found: {source}")

    folders = list(iter_tag_folders(source))
    if args.id:
        want = set(args.id)
        filtered = []
        for folder in folders:
            meta = load_metadata(folder) or {}
            tid = meta.get("tag_id")
            if tid in want or any(folder.name.endswith(f"- {i}") for i in want):
                filtered.append(folder)
        folders = filtered

    if args.limit:
        folders = folders[: args.limit]

    counts: Counter[str] = Counter()
    ultra: Counter[str] = Counter()
    parts: Counter[str] = Counter()
    errors: list[tuple[str, str]] = []

    print(f"Analyzing {len(folders)} tag folders (workers={args.workers})…", flush=True)
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {
            pool.submit(_work, str(f), args.force, args.dry_run): f for f in folders
        }
        done = 0
        for fut in as_completed(futures):
            name, status, summary, err = fut.result()
            counts[status] += 1
            done += 1
            if summary:
                ultra[str(summary.get("ultra_low"))] += 1
                parts[str(summary.get("parts"))] += 1
            if status == "error" and err:
                errors.append((name, err))
                if len(errors) <= 15:
                    print(f"  ERROR {name}: {err}", flush=True)
            if done <= 3 or done % 250 == 0 or done == len(folders):
                print(f"  … {done}/{len(folders)} ({dict(counts)})", flush=True)

    print("\nStatus:", dict(counts), flush=True)
    print("parts summary:", dict(parts.most_common()), flush=True)
    print("ultra_low policy:", dict(ultra.most_common()), flush=True)
    if errors:
        print(f"errors: {len(errors)} (showing up to 15 above)", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
