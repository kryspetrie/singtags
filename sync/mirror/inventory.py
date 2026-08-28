#!/usr/bin/env python3
"""Phase 0: inventory existing library; quarantine guidelines PDFs and not-found folders."""

from __future__ import annotations

import sys
from pathlib import Path

_MIRROR_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _MIRROR_DIR.parent
for _p in (_REPO_ROOT, _MIRROR_DIR):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import argparse
import hashlib
import shutil
from datetime import datetime, timezone

from lib.config import GUIDELINES_MD5, GUIDELINES_SIZE, ROOT_DOWNLOAD_DIR
from lib.state import (
    ensure_state_dir,
    extract_id_from_folder_name,
    iter_tag_folders,
    read_tag_id_from_folder,
    save_json,
    state_path,
)


def file_md5(path: Path, chunk: int = 1024 * 1024) -> str:
    h = hashlib.md5()
    with path.open("rb") as fh:
        while True:
            data = fh.read(chunk)
            if not data:
                break
            h.update(data)
    return h.hexdigest()


def is_guidelines_pdf(path: Path) -> bool:
    try:
        size = path.stat().st_size
    except OSError:
        return False
    if size == GUIDELINES_SIZE:
        return file_md5(path) == GUIDELINES_MD5
    # Still check hash for resized copies (unlikely)
    if path.suffix.lower() == ".pdf" and size > 500_000 and size < 530_000:
        return file_md5(path) == GUIDELINES_MD5
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Inventory local tags library")
    parser.add_argument("--root", type=Path, default=ROOT_DOWNLOAD_DIR)
    parser.add_argument(
        "--quarantine",
        action="store_true",
        help="Move guidelines PDFs and not-found folders into _state/quarantine",
    )
    parser.add_argument(
        "--delete-guidelines",
        action="store_true",
        help="Delete guidelines PDFs instead of quarantining",
    )
    args = parser.parse_args()

    ensure_state_dir()
    quarantine_root = state_path("quarantine")
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root": str(args.root),
        "folders": 0,
        "ids_found": [],
        "missing_ids": [],
        "duplicate_ids": {},
        "guidelines_pdfs": [],
        "not_found_folders": [],
        "zero_byte_files": [],
        "id_to_path": {},
    }

    id_map: dict[int, list[str]] = {}

    for folder in iter_tag_folders(args.root):
        report["folders"] += 1
        tag_id = read_tag_id_from_folder(folder)
        name = folder.name

        if name.lower().startswith("tag ") and "not found" in name.lower():
            report["not_found_folders"].append(str(folder))
            if args.quarantine:
                dest = quarantine_root / "not_found" / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                if not dest.exists():
                    shutil.move(str(folder), str(dest))
            continue

        if tag_id is not None:
            id_map.setdefault(tag_id, []).append(str(folder))
            report["id_to_path"][str(tag_id)] = str(folder)
        else:
            # try trailing id only
            trailing = extract_id_from_folder_name(name)
            if trailing is not None:
                id_map.setdefault(trailing, []).append(str(folder))

        for path in folder.rglob("*"):
            if not path.is_file():
                continue
            try:
                size = path.stat().st_size
            except OSError:
                continue
            if size == 0:
                report["zero_byte_files"].append(str(path))
            if path.suffix.lower() == ".pdf" and is_guidelines_pdf(path):
                report["guidelines_pdfs"].append(str(path))
                if args.delete_guidelines:
                    path.unlink(missing_ok=True)
                elif args.quarantine:
                    rel = path.relative_to(args.root)
                    dest = quarantine_root / "guidelines" / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    if path.exists():
                        shutil.move(str(path), str(dest))

    ids = sorted(id_map.keys())
    report["ids_found"] = ids
    for tag_id, paths in id_map.items():
        if len(paths) > 1:
            report["duplicate_ids"][str(tag_id)] = paths

    if ids:
        full = set(range(1, max(ids) + 1))
        report["missing_ids"] = sorted(full - set(ids))
        report["max_id"] = max(ids)
        report["min_id"] = min(ids)
    else:
        report["max_id"] = 0
        report["min_id"] = 0

    report["counts"] = {
        "folders": report["folders"],
        "unique_ids": len(ids),
        "missing": len(report["missing_ids"]),
        "guidelines_pdfs": len(report["guidelines_pdfs"]),
        "not_found_folders": len(report["not_found_folders"]),
        "zero_byte_files": len(report["zero_byte_files"]),
        "duplicate_id_keys": len(report["duplicate_ids"]),
    }

    out = state_path("inventory_report.json")
    # id_to_path can be huge; still useful
    save_json(out, report)

    print("Inventory complete")
    for key, val in report["counts"].items():
        print(f"  {key}: {val}")
    print(f"  report: {out}")


if __name__ == "__main__":
    main()
