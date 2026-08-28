#!/usr/bin/env python3
"""Build 2-bit dither sheet preview WebPs for all tags with sheets."""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
_MIRROR_DIR = _REPO_ROOT / "mirror"
for _p in (_REPO_ROOT, _MIRROR_DIR):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import argparse


from assets import ensure_sheet_preview
from lib.complete import find_sheet_file
from lib.config import ROOT_DOWNLOAD_DIR
from lib.state import iter_tag_folders, load_metadata, save_metadata


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT_DOWNLOAD_DIR)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    source = args.source.resolve()
    if not source.is_dir():
        parser.error(f"source not found: {source}")

    built = skipped = errors = 0
    for folder in iter_tag_folders(source):
        if args.limit and built + skipped + errors >= args.limit:
            break
        meta = load_metadata(folder)
        sheet = find_sheet_file(folder, meta)
        if sheet is None:
            skipped += 1
            continue
        preview = (meta.get("parts") or {}).get("sheet_preview") or {}
        filename = preview.get("filename")
        preview_path = (folder / str(filename)) if filename else None
        preview_ok = (
            preview_path is not None
            and preview_path.is_file()
            and preview_path.stat().st_size >= 200
        )
        if (
            not args.force
            and filename
            and preview_ok
            and len(preview) == 1
            and "sheet_preview_kind" not in meta
            and "sheet_preview_format" not in meta
        ):
            skipped += 1
            continue
        # Slim already-built previews to filename-only metadata without regenerating.
        if (
            not args.force
            and filename
            and preview_ok
        ):
            meta.setdefault("parts", {})["sheet_preview"] = {"filename": filename}
            meta.pop("sheet_preview_format", None)
            meta.pop("sheet_preview_kind", None)
            if not args.dry_run:
                save_metadata(folder, meta)
            skipped += 1
            continue
        if args.dry_run:
            print(f"would build: {folder.name}")
            built += 1
            continue
        try:
            out = ensure_sheet_preview(folder, meta, sheet, force=True)
            if out:
                save_metadata(folder, meta)
                built += 1
                if built <= 5 or built % 500 == 0:
                    print(f"built [{built}] {folder.name}")
            else:
                errors += 1
        except Exception as exc:
            errors += 1
            if errors <= 10:
                print(f"ERROR {folder.name}: {exc}")

    print(
        f"\nbuilt={built} skipped={skipped} errors={errors} source={source}"
    )
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
