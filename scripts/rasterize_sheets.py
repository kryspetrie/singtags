#!/usr/bin/env python3
"""Rasterize sample-data sheets to WebP pages (PDF via pdftoppm, images via Pillow)."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

SHEET_IMAGE = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"}


def to_webp(src: Path, dest: Path, quality: int = 82) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(src)
    if img.mode not in {"RGB", "L"}:
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")
    img.save(dest, "WEBP", quality=quality, method=6)


def rasterize_pdf(pdf: Path, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        prefix = Path(tmp) / "page"
        subprocess.run(
            ["pdftoppm", "-png", "-r", "150", str(pdf), str(prefix)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        pages = sorted(Path(tmp).glob("page*.png"))
        result: list[Path] = []
        for i, page in enumerate(pages, start=1):
            dest = out_dir / f"page-{i:02d}.webp"
            to_webp(page, dest)
            result.append(dest)
        return result


def process_tag(sample: Path, tid: int, *, force: bool) -> list[str]:
    meta_path = sample / "tags" / str(tid) / "metadata.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    sheet_rel = meta.get("sheet")
    if not isinstance(sheet_rel, str):
        return []
    sheet = sample / sheet_rel
    if not sheet.is_file():
        return []

    out_dir = sample / "sheets" / str(tid) / "pages"
    existing = sorted(out_dir.glob("page-*.webp"))
    if existing and not force:
        rels = [str(p.relative_to(sample)).replace("\\", "/") for p in existing]
        meta["sheet_pages"] = rels
        meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
        return rels

    if out_dir.exists() and force:
        shutil.rmtree(out_dir)

    suf = sheet.suffix.lower()
    pages: list[Path] = []
    if suf == ".pdf":
        print(f"  PDF #{tid} → WebP")
        pages = rasterize_pdf(sheet, out_dir)
    elif suf in SHEET_IMAGE:
        print(f"  image #{tid} → WebP")
        dest = out_dir / "page-01.webp"
        to_webp(sheet, dest)
        pages = [dest]
    else:
        print(f"  skip #{tid} unknown sheet {suf}")
        return []

    rels = [str(p.relative_to(sample)).replace("\\", "/") for p in pages]
    meta["sheet_pages"] = rels
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return rels


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--sample",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "sample-data",
    )
    p.add_argument("--force", action="store_true")
    p.add_argument("--limit", type=int, default=0)
    args = p.parse_args()
    if shutil.which("pdftoppm") is None:
        raise SystemExit("pdftoppm not found (install poppler-utils)")

    ids = sorted(
        int(p.name)
        for p in (args.sample / "tags").iterdir()
        if p.is_dir() and p.name.isdigit()
    )
    if args.limit:
        ids = ids[: args.limit]
    n = 0
    for tid in ids:
        if process_tag(args.sample, tid, force=args.force):
            n += 1
    print(f"Rasterized sheets for {n}/{len(ids)} tags")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
