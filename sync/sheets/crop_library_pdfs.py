#!/usr/bin/env python3
"""Crop all sheet PDFs via CropBox (footer-aware; never re-rasterize) and update metadata."""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
_MIRROR_DIR = _REPO_ROOT / "mirror"
for _p in (_REPO_ROOT, _MIRROR_DIR):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import argparse


from lib.complete import find_sheet_file
from lib.config import ROOT_DOWNLOAD_DIR
from lib.http import sha256_bytes
from lib.sheet_export import crop_pdf_file
from lib.state import iter_tag_folders, load_metadata, save_metadata


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT_DOWNLOAD_DIR)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-crop even when metadata already has sheet_cropped=True",
    )
    args = parser.parse_args()

    source = args.source.resolve()
    if not source.is_dir():
        parser.error(f"source not found: {source}")

    cropped = skipped = errors = already = 0
    for folder in iter_tag_folders(source):
        meta = load_metadata(folder)
        if meta.get("sheet_cropped") and not args.force:
            already += 1
            continue
        sheet = find_sheet_file(folder, meta)
        if sheet is None or sheet.suffix.lower() != ".pdf":
            skipped += 1
            continue
        try:
            before = sheet.stat().st_size
            if args.dry_run:
                print(f"would crop: {folder.name}")
                cropped += 1
                continue
            source_sha = sha256_bytes(sheet.read_bytes())
            crop_pdf_file(sheet)
            after = sheet.stat().st_size
            digest = sha256_bytes(sheet.read_bytes())
            part = (meta.setdefault("parts", {})).setdefault("sheet", {})
            part.update(
                {
                    "filename": sheet.name,
                    "sha256": digest,
                    "bytes": after,
                    "source_sha256": part.get("source_sha256") or source_sha,
                    "cropped": True,
                    "mime_guess": "pdf",
                }
            )
            meta["sheet_format"] = "pdf"
            meta["sheet_cropped"] = True
            meta["sheet_crop_method"] = "cropbox"
            part["crop_method"] = "cropbox"
            save_metadata(folder, meta)
            cropped += 1
            if cropped % 50 == 0 or cropped <= 5:
                print(f"cropped [{cropped}] {folder.name}: {before} -> {after} bytes")
        except Exception as exc:
            errors += 1
            if errors <= 20:
                print(f"ERROR {folder.name}: {exc}")

    print(
        f"\ndone: cropped={cropped} already={already} skipped_non_pdf={skipped} errors={errors}"
    )
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
