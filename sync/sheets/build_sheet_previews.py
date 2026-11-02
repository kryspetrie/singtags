#!/usr/bin/env python3
"""Build display sheet previews + tiny Open Graph thumbs for tags with sheets.

- sheet_preview: stacked 2-bit dither WebP (viewer / offline)
- sheet_og: first-page 300px 3-bit (8-grey) WebP (Discord/Slack link cards)
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


from assets import ensure_sheet_og, ensure_sheet_preview
from lib.complete import find_sheet_file
from lib.config import ROOT_DOWNLOAD_DIR
from lib.state import iter_tag_folders, load_metadata, save_metadata


def _part_file_ok(folder: Path, meta: dict, part: str, *, min_bytes: int) -> bool:
    entry = (meta.get("parts") or {}).get(part) or {}
    filename = entry.get("filename")
    if not filename:
        return False
    path = folder / str(filename)
    return path.is_file() and path.stat().st_size >= min_bytes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT_DOWNLOAD_DIR)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument(
        "--og-only",
        action="store_true",
        help="Only build missing/forced sheet_og thumbs (skip display preview rebuild)",
    )
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

        preview_ok = _part_file_ok(folder, meta, "sheet_preview", min_bytes=200)
        og_ok = _part_file_ok(folder, meta, "sheet_og", min_bytes=80)
        need_preview = not args.og_only and (args.force or not preview_ok)
        need_og = args.force or not og_ok

        if not need_preview and not need_og:
            # Slim already-built preview metadata without regenerating.
            preview = (meta.get("parts") or {}).get("sheet_preview") or {}
            filename = preview.get("filename")
            if filename and preview_ok:
                meta.setdefault("parts", {})["sheet_preview"] = {"filename": filename}
                meta.pop("sheet_preview_format", None)
                meta.pop("sheet_preview_kind", None)
                if not args.dry_run:
                    save_metadata(folder, meta)
            skipped += 1
            continue

        if args.dry_run:
            bits = []
            if need_preview:
                bits.append("preview")
            if need_og:
                bits.append("og")
            print(f"would build ({'+'.join(bits)}): {folder.name}")
            built += 1
            continue

        try:
            # ensure_sheet_preview also builds sheet_og; og-only skips display rebuild.
            if need_preview:
                out = ensure_sheet_preview(folder, meta, sheet, force=True)
            else:
                out = ensure_sheet_og(folder, meta, sheet, force=args.force)
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
