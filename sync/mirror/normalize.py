#!/usr/bin/env python3
"""Migrate folders/files to normalized names with tag id; map originals in metadata."""

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
import re
import shutil

from lib.config import PART_DISPLAY, ROOT_DOWNLOAD_DIR, SHEET_EXTENSIONS
from lib.names import build_file_name, build_folder_name, sanitize_segment
from lib.state import (
    iter_tag_folders,
    load_metadata,
    read_tag_id_from_folder,
    save_metadata,
)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def detect_part(path: Path) -> str | None:
    name = path.name.lower()
    stem = path.stem.lower()
    suffix = path.suffix.lower()

    if "sheet preview" in name:
        return "sheet_preview"

    if suffix in SHEET_EXTENSIONS or "sheet_music" in name or name.endswith(" - sheet" + suffix):
        if "notation" in name:
            return "notation"
        if suffix in SHEET_EXTENSIONS or "sheet" in name:
            # Avoid treating random pdfs; sheet_music or - Sheet
            if "sheet" in name or suffix in SHEET_EXTENSIONS - {".pdf"}:
                return "sheet"
            if suffix == ".pdf" and ("sheet" in name or "music" in name):
                return "sheet"

    if suffix == ".mp3":
        for part in ("bass", "bari", "lead", "tenor"):
            if part in name:
                return part
        if "full_mix" in name or "allparts" in name or name.endswith(" - mix.mp3"):
            return "mix"
        if "mix" in name:
            return "mix"
    return None


def infer_title_key_arranger(folder: Path, meta: dict) -> tuple[str | None, str | None, str | None]:
    title = meta.get("title")
    key = meta.get("key")
    arranger = meta.get("arranger")
    if title:
        return title, key, arranger

    # Legacy folder: "{name} - {arranger} ({key})"
    name = folder.name
    # Strip trailing " - {id}"
    name = re.sub(r"\s-\s\d+$", "", name)
    m = re.match(r"^(.*?)\s-\s(.*?)\s*\((.*?)\)\s*$", name)
    if m:
        return (
            sanitize_segment(m.group(1)) or m.group(1).strip(),
            sanitize_segment(m.group(3)),
            sanitize_segment(m.group(2)),
        )
    return sanitize_segment(name) or name, key, arranger


def normalize_folder(folder: Path, root: Path, dry_run: bool = False) -> Path | None:
    tag_id = read_tag_id_from_folder(folder)
    if tag_id is None:
        print(f"   Skip (no id): {folder.name}")
        return None

    if folder.name.lower().startswith("tag ") and "not found" in folder.name.lower():
        print(f"   Skip not-found: {folder.name}")
        return None

    meta = load_metadata(folder) if (folder / "metadata.json").exists() else {}
    title, key, arranger = infer_title_key_arranger(folder, meta)
    if arranger in {"Unknown", "Unknown Arranger"}:
        arranger = None
    if key in {"Unknown Key", "unknown", "Unknown"}:
        key = None

    meta["tag_id"] = tag_id
    meta["title"] = title
    meta["key"] = key
    meta["arranger"] = arranger

    target_name = build_folder_name(tag_id, title, key, arranger)
    target = root / target_name

    # Rename media files first inside current folder
    parts = meta.setdefault("parts", {})
    for path in sorted(folder.iterdir()):
        if not path.is_file():
            continue
        if path.name in {"metadata.json"}:
            continue
        if path.name.startswith("."):
            continue

        part = detect_part(path)
        if part is None:
            continue

        new_name = build_file_name(title, key, arranger, part, path.suffix.lower())
        dest = folder / new_name
        entry = parts.setdefault(part, {})
        entry.setdefault("original_filename", entry.get("original_filename") or path.name)
        if path.name != new_name:
            print(f"   file: {path.name} -> {new_name}")
            if not dry_run:
                if dest.exists() and dest != path:
                    # Prefer keeping hashed newer; remove duplicate
                    path.unlink()
                else:
                    path.rename(dest)
            entry["filename"] = new_name
        else:
            entry["filename"] = path.name

        final_path = dest if not dry_run and dest.exists() else (folder / entry["filename"])
        if not dry_run and final_path.exists():
            entry["bytes"] = final_path.stat().st_size
            entry["sha256"] = sha256_file(final_path)
            entry["mime_guess"] = final_path.suffix.lstrip(".").lower()
            if part == "sheet":
                meta["sheet_format"] = final_path.suffix.lstrip(".").lower()

    meta["folder_name"] = target_name

    present = set((meta.get("parts") or {}).keys())
    if meta.get("status") == "not_found":
        pass
    elif "sheet" in present and present & {"bass", "bari", "lead", "tenor", "mix"}:
        meta["status"] = "ok"
    elif present:
        meta["status"] = "partial"
    else:
        meta["status"] = "missing_assets"

    if folder.resolve() != target.resolve():
        print(f"   folder: {folder.name} -> {target_name}")
        if not dry_run:
            if target.exists():
                # Merge files into target
                for item in folder.iterdir():
                    dest = target / item.name
                    if dest.exists():
                        continue
                    shutil.move(str(item), str(dest))
                shutil.rmtree(folder, ignore_errors=True)
                folder = target
            else:
                folder.rename(target)
                folder = target
    else:
        folder = target if target.exists() else folder

    if not dry_run:
        save_metadata(folder, meta)
    return folder


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize folder and file names")
    parser.add_argument("--root", type=Path, default=ROOT_DOWNLOAD_DIR)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--ids", type=str, help="Only these ids")
    args = parser.parse_args()

    wanted = None
    if args.ids:
        wanted = set()
        for chunk in args.ids.split(","):
            chunk = chunk.strip()
            if "-" in chunk:
                a, b = chunk.split("-", 1)
                wanted.update(range(int(a), int(b) + 1))
            else:
                wanted.add(int(chunk))

    count = 0
    for folder in list(iter_tag_folders(args.root)):
        tag_id = read_tag_id_from_folder(folder)
        if wanted is not None and tag_id not in wanted:
            continue
        normalize_folder(folder, args.root, dry_run=args.dry_run)
        count += 1
        if args.limit and count >= args.limit:
            break
    print(f"Normalized {count} folder(s)")


if __name__ == "__main__":
    main()
