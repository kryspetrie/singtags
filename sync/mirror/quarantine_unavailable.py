#!/usr/bin/env python3
"""Quarantine library folders with no usable sheet/audio (effectively deleted tags).

Moves them under library/_state/quarantine/unavailable/ and marks metadata
status=unavailable so sync/index builds keep skipping them.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "sync"))

from lib.complete import has_usable_media  # noqa: E402

SKIP_DIRS = {"_state", "_codec_demos_opus", "_codec_demos", ".venv", "venv"}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--library", type=Path, default=ROOT / "library")
    p.add_argument(
        "--quarantine",
        type=Path,
        default=None,
        help="Destination (default: library/_state/quarantine/unavailable)",
    )
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    library: Path = args.library
    dest_root = args.quarantine or (library / "_state" / "quarantine" / "unavailable")
    dest_root.mkdir(parents=True, exist_ok=True)

    moved = 0
    for folder in sorted(library.iterdir()):
        if not folder.is_dir() or folder.name in SKIP_DIRS or folder.name.startswith("."):
            continue
        if folder.resolve() == dest_root.resolve() or dest_root in folder.resolve().parents:
            continue
        meta_path = folder / "metadata.json"
        if not meta_path.is_file():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if has_usable_media(folder, meta):
            continue
        meta["status"] = "unavailable"
        meta["unavailable_reason"] = meta.get("unavailable_reason") or "no_usable_media"
        meta["quarantined_at"] = datetime.now(timezone.utc).isoformat()
        target = dest_root / folder.name
        if target.exists():
            target = dest_root / f"{folder.name}__{meta.get('tag_id') or 'unknown'}"
        print(f"{'DRY ' if args.dry_run else ''}quarantine {folder.name} → {target.relative_to(library)}")
        if args.dry_run:
            moved += 1
            continue
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        shutil.move(str(folder), str(target))
        moved += 1

    print(f"{'Would move' if args.dry_run else 'Moved'} {moved} empty tag folder(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
