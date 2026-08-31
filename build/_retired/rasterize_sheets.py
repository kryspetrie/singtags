#!/usr/bin/env python3
"""Rasterize sample-data sheets to 2-bit dither WebP previews for offline caching."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

SHEET_IMAGE = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".pdf"}

DEFAULT_TAGS_MIRROR = Path("/media/kpetrie/extradrive1/Barbershop/tags")


def _import_sheet_export():
    mirror = Path(os.environ.get("TAGS_MIRROR", DEFAULT_TAGS_MIRROR))
    venv_py = mirror / "venv" / "bin" / "python"
    if venv_py.is_file() and Path(sys.executable).resolve() != venv_py.resolve():
        # Re-exec under tags mirror venv (needs pypdfium2 for PDF sheets).
        os.execv(str(venv_py), [str(venv_py), *sys.argv])
    if str(mirror) not in sys.path:
        sys.path.insert(0, str(mirror))
    from lib.sheet_export import build_sheet_preview_webp

    return build_sheet_preview_webp


def process_tag(sample: Path, tid: int, *, force: bool, build_preview) -> str | None:
    meta_path = sample / "tags" / str(tid) / "metadata.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    sheet_rel = meta.get("sheet")
    if not isinstance(sheet_rel, str):
        return None
    sheet = sample / sheet_rel
    if not sheet.is_file():
        return None

    out_dir = sample / "sheets" / str(tid)
    out_dir.mkdir(parents=True, exist_ok=True)
    preview = out_dir / "preview.webp"
    if preview.is_file() and not force:
        rel = str(preview.relative_to(sample)).replace("\\", "/")
        meta["sheet_preview"] = rel
        meta["sheet_pages"] = [rel]
        meta.pop("sheet_preview_kind", None)
        meta.pop("sheet_preview_bytes", None)
        meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return rel

    print(f"  preview #{tid} ({sheet.suffix.lower()})")
    build_preview(sheet, preview)
    rel = str(preview.relative_to(sample)).replace("\\", "/")
    meta["sheet_preview"] = rel
    meta["sheet_pages"] = [rel]
    meta.pop("sheet_preview_kind", None)
    meta.pop("sheet_preview_bytes", None)
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return rel


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--sample",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "sample-data",
    )
    p.add_argument("--force", action="store_true")
    p.add_argument("--limit", type=int, default=0)
    args = p.parse_args()

    build_preview = _import_sheet_export()
    ids = sorted(
        int(p.name)
        for p in (args.sample / "tags").iterdir()
        if p.is_dir() and p.name.isdigit()
    )
    if args.limit:
        ids = ids[: args.limit]
    n = 0
    for tid in ids:
        if process_tag(args.sample, tid, force=args.force, build_preview=build_preview):
            n += 1
    print(f"Built sheet previews for {n}/{len(ids)} tags")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
