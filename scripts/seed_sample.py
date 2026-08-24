#!/usr/bin/env python3
"""Seed ~100 finalized tags into sample-data/ with sheets + AAC MP4 tracks.

Reads from the local Barbershop Tags mirror. Does not hit the origin site.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

SHEET_EXTS = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".tif", ".tiff", ".bmp"}
AUDIO_EXTS = {".mp3", ".m4a", ".wav", ".ogg"}
AUDIO_PARTS = ("lead", "tenor", "bari", "bass", "mix")
PART_HINTS = {
    "lead": ("lead",),
    "tenor": ("tenor",),
    "bari": ("bari", "baritone"),
    "bass": ("bass",),
    "mix": ("mix", "allparts", "full_mix", "all_parts"),
}


def load_meta(folder: Path) -> dict:
    path = folder / "metadata.json"
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def is_finalized(meta: dict) -> bool:
    if meta.get("lyrics_finalized"):
        return True
    return meta.get("lyrics_source") in {"final", "manual"} and bool(
        str(meta.get("lyrics") or "").strip()
    )


def is_audio_file(path: Path) -> bool:
    return path.is_file() and path.stat().st_size > 0 and path.suffix.lower() in AUDIO_EXTS


def find_sheet(folder: Path, meta: dict) -> Path | None:
    sheets = find_sheets(folder, meta)
    return sheets[0] if sheets else None


def find_sheets(folder: Path, meta: dict) -> list[Path]:
    """All sheet uploads in a tag folder (PDFs and images), stable order."""
    found: list[Path] = []
    seen: set[Path] = set()

    def add(p: Path) -> None:
        if p in seen:
            return
        if p.is_file() and p.stat().st_size > 0 and p.suffix.lower() in SHEET_EXTS:
            if "guidelines" in p.name.lower():
                return
            seen.add(p)
            found.append(p)

    sheet = (meta.get("parts") or {}).get("sheet") or {}
    name = sheet.get("filename")
    if name:
        add(folder / name)
    # parts.sheets may be a list of {filename} or plain names in richer mirrors
    extra = (meta.get("parts") or {}).get("sheets")
    if isinstance(extra, list):
        for item in extra:
            if isinstance(item, str):
                add(folder / item)
            elif isinstance(item, dict) and item.get("filename"):
                add(folder / str(item["filename"]))
    for p in sorted(folder.iterdir()):
        add(p)
    return found


def find_audio_parts(folder: Path, meta: dict) -> dict[str, Path]:
    found: dict[str, Path] = {}
    parts_meta = meta.get("parts") or {}
    for part in AUDIO_PARTS:
        info = parts_meta.get(part) or {}
        name = info.get("filename")
        if name:
            p = folder / name
            if is_audio_file(p):
                found[part] = p
                continue
        hints = PART_HINTS[part]
        for p in sorted(folder.iterdir()):
            if not is_audio_file(p):
                continue
            low = p.name.lower()
            if not any(h in low for h in hints):
                continue
            if part == "mix":
                if any(x in low for x in ("bass", "bari", "lead", "tenor")) and not any(
                    x in low for x in ("mix", "allparts", "all_parts", "full_mix")
                ):
                    continue
            found[part] = p
            break
    return found


def remux_to_mp4(src: Path, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(src),
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        str(dest),
    ]
    proc = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return proc.returncode == 0 and dest.is_file() and dest.stat().st_size > 0


def iter_tag_folders(root: Path):
    for path in sorted(root.iterdir()):
        if path.is_dir() and not path.name.startswith("_"):
            yield path


def select_candidates(
    library: Path, limit: int
) -> list[tuple[Path, dict, Path, dict[str, Path]]]:
    out: list[tuple[Path, dict, Path, dict[str, Path]]] = []
    for folder in iter_tag_folders(library):
        meta = load_meta(folder)
        if not is_finalized(meta):
            continue
        if not isinstance(meta.get("tag_id"), int):
            continue
        sheet = find_sheet(folder, meta)
        audio = find_audio_parts(folder, meta)
        if sheet is None or not audio:
            continue
        out.append((folder, meta, sheet, audio))
        if len(out) >= limit * 2:  # oversample; remux may skip some
            break
    return out


def seed(library: Path, dest: Path, limit: int, *, force: bool) -> int:
    if dest.exists() and force:
        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)
    media_root = dest / "media"
    sheets_root = dest / "sheets"
    tags_root = dest / "tags"
    media_root.mkdir(exist_ok=True)
    sheets_root.mkdir(exist_ok=True)
    tags_root.mkdir(exist_ok=True)

    candidates = select_candidates(library, limit)
    manifest: list[dict] = []
    skipped = 0

    for folder, meta, sheet, audio in candidates:
        if len(manifest) >= limit:
            break
        tid = meta["tag_id"]
        slim = {
            "tag_id": tid,
            "title": meta.get("title"),
            "alt_title": meta.get("alt_title"),
            "arranger": meta.get("arranger"),
            "key": meta.get("key"),
            "writ_key": meta.get("writ_key"),
            "rating": meta.get("rating"),
            "rating_count": meta.get("rating_count") or meta.get("votes"),
            "download_count": meta.get("download_count"),
            "type": meta.get("type"),
            "collection": meta.get("collection"),
            "classic": meta.get("classic"),
            "year": meta.get("year"),
            "parts_count": meta.get("parts_count"),
            "lyrics": meta.get("lyrics"),
            "lyrics_source": meta.get("lyrics_source"),
            "lyrics_finalized": meta.get("lyrics_finalized"),
            "source_folder": folder.name,
            "sheet": None,
            "audio": {},
        }

        ok_audio: dict[str, str] = {}
        for part, src in audio.items():
            out_mp4 = media_root / str(tid) / f"{part}.mp4"
            if out_mp4.exists() and not force and out_mp4.stat().st_size > 0:
                ok_audio[part] = f"media/{tid}/{part}.mp4"
                continue
            print(f"  remux #{tid} {part}: {src.name} -> {out_mp4.name}")
            if remux_to_mp4(src, out_mp4):
                ok_audio[part] = f"media/{tid}/{part}.mp4"
            else:
                print(f"  skip remux fail #{tid} {part} ({src.name})", file=sys.stderr)
                if out_mp4.exists():
                    out_mp4.unlink()

        if not ok_audio:
            skipped += 1
            continue

        sheet_dir = sheets_root / str(tid)
        sheet_dir.mkdir(parents=True, exist_ok=True)
        all_sheets = find_sheets(folder, meta) or [sheet]
        sheet_rels: list[str] = []
        used_names: set[str] = set()
        for i, src_sheet in enumerate(all_sheets):
            # Keep original basename when unique; otherwise prefix with index
            base = src_sheet.name
            if base.lower() in used_names:
                base = f"{i:02d}-{src_sheet.name}"
            used_names.add(base.lower())
            dest_sheet = sheet_dir / base
            if not dest_sheet.exists() or force:
                shutil.copy2(src_sheet, dest_sheet)
            sheet_rels.append(f"sheets/{tid}/{dest_sheet.name}")
        slim["sheet"] = sheet_rels[0]
        if len(sheet_rels) > 1:
            slim["sheets"] = sheet_rels
        slim["audio"] = ok_audio

        tag_dir = tags_root / str(tid)
        tag_dir.mkdir(exist_ok=True)
        (tag_dir / "metadata.json").write_text(
            json.dumps(slim, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        manifest.append(
            {
                "id": tid,
                "title": slim["title"],
                "arranger": slim["arranger"],
                "key": slim["key"],
                "rating": slim["rating"],
                "type": slim["type"],
                "collection": slim["collection"],
                "hasSheet": True,
                "audioParts": sorted(slim["audio"].keys()),
                "sheet": slim["sheet"],
            }
        )
        print(f"seeded #{tid} {slim['title']} ({len(ok_audio)} tracks)")

    (dest / "manifest.json").write_text(
        json.dumps(
            {
                "count": len(manifest),
                "source": str(library),
                "skipped_no_audio": skipped,
                "tags": manifest,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(manifest)} tags -> {dest} (skipped {skipped})")
    return 0 if len(manifest) >= min(limit, 1) else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--library",
        type=Path,
        default=Path("/media/kpetrie/extradrive1/Barbershop/tags/Barbershop_Tags_Library"),
    )
    parser.add_argument(
        "--dest",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "sample-data",
    )
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--force", action="store_true", help="Rebuild sample-data from scratch")
    args = parser.parse_args()
    if not args.library.is_dir():
        print(f"library not found: {args.library}", file=sys.stderr)
        return 1
    if shutil.which("ffmpeg") is None:
        print("ffmpeg not found on PATH", file=sys.stderr)
        return 1
    return seed(args.library, args.dest, args.limit, force=args.force)


if __name__ == "__main__":
    raise SystemExit(main())
