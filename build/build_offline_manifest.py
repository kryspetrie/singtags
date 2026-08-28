#!/usr/bin/env python3
"""Build offline pack manifests (sheets + audio) from published tag JSON + library/.

Reads slim metadata under web/public/tags/ (from build_indexes.py) and sizes files
under library/. Paths stay library-relative (percent-encoded) for VITE_MEDIA_BASE.
"""

from __future__ import annotations

import argparse
import gzip
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote


SITE_ROOT = Path(__file__).resolve().parents[1]


# Offline pack only ships decodable audio (legacy learning stems are often `.bin` MPEG).
AUDIO_EXTENSIONS = {".opus", ".ogg", ".m4a", ".mp3", ".mp4", ".aac", ".wav", ".webm", ".bin"}
MIN_AUDIO_BYTES = 256


def is_offline_audio_path(library: Path, rel: str) -> bool:
    """True when path exists, is large enough, and looks like audio (ext or MPEG/Ogg magic)."""
    if not rel:
        return False
    path = library / unquote(rel)
    try:
        size = path.stat().st_size if path.is_file() else 0
    except OSError:
        return False
    if size < MIN_AUDIO_BYTES:
        return False
    suffix = path.suffix.lower()
    if suffix not in AUDIO_EXTENSIONS:
        return False
    if suffix != ".bin":
        return True
    try:
        head = path.read_bytes()[:16]
    except OSError:
        return False
    # MPEG ADTS / ID3 / Ogg / ftyp
    if head.startswith(b"OggS") or head.startswith(b"ID3"):
        return True
    if len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0:
        return True
    if len(head) >= 8 and head[4:8] == b"ftyp":
        return True
    return False



def file_size(library: Path, rel: str) -> int:
    """Size of a library-relative (possibly percent-encoded) path."""
    if not rel:
        return 0
    p = library / unquote(rel)
    try:
        return p.stat().st_size if p.is_file() else 0
    except OSError:
        return 0


def pick_audio_paths(meta: dict) -> tuple[list[str], str | None]:
    """Choose offline-pack audio paths (prefer ultra tiers, else playback)."""
    audio_tiers = meta.get("audio_tiers") or {}
    audio = meta.get("audio") or {}
    layout = meta.get("audio_layout_summary") or {}
    ultra_policy = layout.get("ultra_low") if isinstance(layout, dict) else None
    if not isinstance(ultra_policy, str):
        ultra_policy = None

    paths: list[str] = []
    if isinstance(audio_tiers, dict) and audio_tiers:
        for part, tiers in audio_tiers.items():
            if not isinstance(tiers, dict):
                continue
            chosen = None
            if ultra_policy == "mono_solos":
                if part == "mix" and (
                    layout.get("mix_disjoint") or layout.get("parts_recombinable") is False
                ):
                    chosen = tiers.get("ultra_mix") or tiers.get("ultra_stereo")
                elif layout.get("parts_recombinable") is False:
                    chosen = tiers.get("ultra_stereo") or tiers.get("playback")
                else:
                    # Voice solos only — mix is reconstructed client-side.
                    if part == "mix":
                        chosen = None
                    else:
                        chosen = tiers.get("ultra_solo")
            elif ultra_policy == "mono_downmix":
                chosen = tiers.get("ultra_downmix") or tiers.get("ultra_solo")
            elif part == "mix" and tiers.get("ultra_mix"):
                chosen = tiers.get("ultra_mix")
            elif ultra_policy == "stereo_fallback":
                if part == "mix":
                    chosen = tiers.get("ultra_mix") or tiers.get("ultra_stereo")
                else:
                    chosen = tiers.get("ultra_stereo")
            if not chosen and ultra_policy not in {
                "mono_solos",
                "mono_downmix",
                "stereo_fallback",
            }:
                chosen = (
                    tiers.get("ultra_solo")
                    or tiers.get("ultra_mix")
                    or tiers.get("ultra_stereo")
                    or tiers.get("playback")
                    or tiers.get("original")
                )
            # Always have something for offline when policy left a gap
            if not chosen and part != "mix":
                chosen = (
                    tiers.get("ultra_solo")
                    or tiers.get("ultra_stereo")
                    or tiers.get("playback")
                    or tiers.get("original")
                )
            if not chosen and part == "mix" and ultra_policy != "mono_solos":
                chosen = (
                    tiers.get("ultra_mix")
                    or tiers.get("playback")
                    or tiers.get("original")
                )
            if isinstance(chosen, str) and chosen:
                paths.append(chosen)
    elif isinstance(audio, dict):
        paths = [p for p in audio.values() if isinstance(p, str)]

    # Dedupe while preserving order
    seen: set[str] = set()
    out: list[str] = []
    for p in paths:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out, ultra_policy


def build(tags_dir: Path, library: Path, out: Path) -> None:
    sheet_entries: list[dict] = []
    audio_entries: list[dict] = []
    sheet_total = 0
    audio_total = 0

    for meta_path in sorted(tags_dir.glob("*/metadata.json"), key=lambda p: int(p.parent.name)):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        tid = meta.get("tag_id")
        if not isinstance(tid, int):
            continue

        pages = meta.get("sheet_pages")
        if not isinstance(pages, list):
            pages = []
        page_paths = [p for p in pages if isinstance(p, str)]
        detail_rel = f"/tags/{tid}/metadata.json"
        preview = meta.get("sheet_preview")
        if isinstance(preview, str) and preview:
            cache_paths = [preview] if file_size(library, preview) > 0 else []
            bytes_sheets = file_size(library, preview) if cache_paths else 0
        elif page_paths:
            cache_paths = [p for p in page_paths if file_size(library, p) > 0]
            bytes_sheets = sum(file_size(library, p) for p in cache_paths)
        else:
            cache_paths = []
            bytes_sheets = 0
        # Include slim tag JSON size (served from app origin, not library)
        try:
            bytes_sheets += meta_path.stat().st_size
        except OSError:
            pass
        if cache_paths:
            sheet_entries.append(
                {
                    "tagId": tid,
                    "paths": cache_paths,
                    "bytes": bytes_sheets,
                    "detailPath": detail_rel,
                }
            )
            sheet_total += bytes_sheets

        audio_paths, ultra_policy = pick_audio_paths(meta)
        # Drop missing / empty files so we never publish broken pack URLs.
        audio_paths = [p for p in audio_paths if is_offline_audio_path(library, p)]
        bytes_audio = sum(file_size(library, p) for p in audio_paths)
        if audio_paths:
            entry: dict = {
                "tagId": tid,
                "paths": audio_paths,
                "bytes": bytes_audio,
            }
            if ultra_policy:
                entry["ultraLow"] = ultra_policy
            audio_entries.append(entry)
            audio_total += bytes_audio

    out.mkdir(parents=True, exist_ok=True)
    built_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def write_gz(name: str, payload: object) -> None:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        path = out / name
        with gzip.open(path, "wb", compresslevel=9) as fh:
            fh.write(raw)
        print(f"  {name}: {len(raw)} bytes → {path.stat().st_size} gzip")

    write_gz(
        "offline-sheets.json.gz",
        {
            "version": len(sheet_entries),
            "kind": "sheets",
            "builtAt": built_at,
            "totalBytes": sheet_total,
            "entries": sheet_entries,
        },
    )
    write_gz(
        "offline-audio.json.gz",
        {
            "version": len(audio_entries),
            "kind": "audio",
            "builtAt": built_at,
            "totalBytes": audio_total,
            "entries": audio_entries,
        },
    )
    print(
        f"Wrote offline manifests: {len(sheet_entries)} sheet tags "
        f"({sheet_total / 1e6:.1f} MB), {len(audio_entries)} audio tags "
        f"({audio_total / 1e6:.1f} MB) → {out}"
    )


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--tags",
        type=Path,
        default=SITE_ROOT / "web" / "public" / "tags",
        help="Slim per-tag JSON from build_indexes.py",
    )
    p.add_argument(
        "--library",
        type=Path,
        default=SITE_ROOT / "library",
        help="Working library root (for byte sizes)",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=SITE_ROOT / "web" / "public" / "indexes",
    )
    args = p.parse_args()
    if not args.tags.is_dir():
        raise SystemExit(f"tags dir missing: {args.tags} — run build/build_indexes.py first")
    if not args.library.is_dir():
        raise SystemExit(f"library missing: {args.library}")
    build(args.tags, args.library, args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
