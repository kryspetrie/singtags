#!/usr/bin/env python3
"""Seed finalized tags into sample-data/ with sheets + AAC originals + Opus tiers.

Reads from the local Barbershop Tags mirror. Does not hit the origin site.

Media layout per tag id::

    media/{id}/{part}.m4a              # original (AAC remux of mirrored MP3)
    media/{id}/{part}.playback.opus    # 64 kbps online playback
    media/{id}/{part}.solo.opus        # 16 kbps mono solo (mono_solos)
    media/{id}/{part}.downmix.opus     # 16 kbps mono downmix
    media/{id}/{part}.ultra.opus       # 32 kbps stereo ultra fallback
    media/{id}/mix.ultra_mix.opus      # 32 kbps mix-only ultra

Tag ``metadata.json`` exposes ``audio`` (originals), ``audio_tiers`` (per-part
tier paths), plus ``audio_layout_*`` / ``audio_align*`` from the mirror.
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
# Mirror tier id → sample-data filename suffix (before .opus)
TIER_SUFFIX = {
    "playback": "playback",
    "ultra_solo": "solo",
    "ultra_downmix": "downmix",
    "ultra_stereo": "ultra",
    "ultra_mix": "ultra_mix",
}
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


def build_library_index(library: Path) -> dict[int, Path]:
    """Map tag_id → folder (one pass over the mirror)."""
    by_id: dict[int, Path] = {}
    for folder in library.iterdir():
        if not folder.is_dir() or folder.name.startswith("_"):
            continue
        meta_path = folder / "metadata.json"
        tid: int | None = None
        if meta_path.is_file():
            try:
                raw = json.loads(meta_path.read_text(encoding="utf-8")).get("tag_id")
                if isinstance(raw, int):
                    tid = raw
            except (json.JSONDecodeError, OSError):
                pass
        if tid is None:
            # Fallback: trailing " - {id}"
            try:
                tid = int(folder.name.rsplit("-", 1)[-1].strip())
            except ValueError:
                continue
        by_id.setdefault(tid, folder)
    return by_id


def select_existing_sample_ids(
    library: Path, dest: Path
) -> list[tuple[Path, dict, Path, dict[str, Path]]]:
    """Refresh tags already present under ``dest/tags`` from the mirror."""
    out: list[tuple[Path, dict, Path, dict[str, Path]]] = []
    tags_dir = dest / "tags"
    if not tags_dir.is_dir():
        return out
    index = build_library_index(library)
    print(f"  library index: {len(index)} tags", flush=True)
    for meta_path in sorted(tags_dir.glob("*/metadata.json"), key=lambda p: int(p.parent.name)):
        try:
            tid = int(meta_path.parent.name)
        except ValueError:
            continue
        folder = index.get(tid)
        if folder is None:
            print(f"  warn: library folder missing for sample #{tid}", file=sys.stderr)
            continue
        meta = load_meta(folder)
        if not meta:
            continue
        meta["tag_id"] = tid
        sheet = find_sheet(folder, meta)
        audio = find_audio_parts(folder, meta)
        if sheet is None or not audio:
            print(f"  warn: incomplete assets for sample #{tid}", file=sys.stderr)
            continue
        out.append((folder, meta, sheet, audio))
    return out


def find_library_folder(library: Path, tag_id: int) -> Path | None:
    """Resolve mirror folder for a single tag_id (prefer metadata match)."""
    return build_library_index(library).get(tag_id)


def remux_to_m4a(src: Path, dest: Path) -> bool:
    """Remux/encode learning track to AAC in an .m4a container."""
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


def copy_opus_tiers(
    folder: Path,
    meta: dict,
    tid: int,
    media_root: Path,
    parts: list[str],
    *,
    force: bool,
) -> dict[str, dict[str, str]]:
    """Copy mirror Opus tier files into ``media/{tid}/{part}.{suffix}.opus``."""
    out: dict[str, dict[str, str]] = {p: {} for p in parts}
    parts_meta = meta.get("parts") or {}
    dest_dir = media_root / str(tid)
    dest_dir.mkdir(parents=True, exist_ok=True)

    for part in parts:
        info = parts_meta.get(part) or {}
        tiers = info.get("audio_tiers") or {}
        if not isinstance(tiers, dict):
            continue
        for tier_id, suffix in TIER_SUFFIX.items():
            entry = tiers.get(tier_id)
            if not isinstance(entry, dict):
                continue
            name = entry.get("filename")
            if not name:
                continue
            src = folder / name
            if not src.is_file() or src.stat().st_size <= 0:
                continue
            dest_name = f"{part}.{suffix}.opus"
            dest = dest_dir / dest_name
            if force or not dest.is_file() or dest.stat().st_size <= 0:
                shutil.copy2(src, dest)
                print(f"  tier #{tid} {part}.{tier_id}: {src.name} -> {dest_name}")
            out[part][tier_id] = f"media/{tid}/{dest_name}"
    return out


def slim_align_entry(entry: dict) -> dict:
    keep = (
        "ref_part",
        "offset_ms",
        "corr",
        "zero_corr",
        "trusted",
        "applied_ms",
        "method",
        "min_offset_ms",
        "analyzed_at",
    )
    return {k: entry[k] for k in keep if k in entry}


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
        if len(out) >= limit * 2:
            break
    return out


def select_by_ids(
    library: Path, tag_ids: list[int]
) -> list[tuple[Path, dict, Path, dict[str, Path]]]:
    """Resolve specific tag ids from the mirror for seeding fixtures."""
    index = build_library_index(library)
    out: list[tuple[Path, dict, Path, dict[str, Path]]] = []
    for tid in tag_ids:
        folder = index.get(tid)
        if folder is None:
            print(f"  warn: library folder missing for #{tid}", file=sys.stderr)
            continue
        meta = load_meta(folder)
        if not meta:
            print(f"  warn: no metadata for #{tid}", file=sys.stderr)
            continue
        meta["tag_id"] = tid
        sheet = find_sheet(folder, meta)
        audio = find_audio_parts(folder, meta)
        if sheet is None or not audio:
            print(f"  warn: incomplete assets for #{tid}", file=sys.stderr)
            continue
        out.append((folder, meta, sheet, audio))
    return out


def seed(
    library: Path,
    dest: Path,
    limit: int,
    *,
    force: bool,
    refresh: bool,
    tag_ids: list[int] | None = None,
) -> int:
    if dest.exists() and force and not refresh and not tag_ids:
        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)
    media_root = dest / "media"
    sheets_root = dest / "sheets"
    tags_root = dest / "tags"
    media_root.mkdir(exist_ok=True)
    sheets_root.mkdir(exist_ok=True)
    tags_root.mkdir(exist_ok=True)

    if tag_ids:
        candidates = select_by_ids(library, tag_ids)
        print(f"Seeding {len(candidates)} tag(s) by id: {tag_ids}…")
    elif refresh:
        candidates = select_existing_sample_ids(library, dest)
        print(f"Refreshing {len(candidates)} existing sample tag(s)…")
    else:
        candidates = select_candidates(library, limit)

    manifest: list[dict] = []
    skipped = 0

    for folder, meta, sheet, audio in candidates:
        if not refresh and not tag_ids and len(manifest) >= limit:
            break
        tid = meta["tag_id"]
        slim: dict = {
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
            out_m4a = media_root / str(tid) / f"{part}.m4a"
            stale_mp4 = media_root / str(tid) / f"{part}.mp4"
            if stale_mp4.is_file():
                stale_mp4.unlink()
            if out_m4a.exists() and out_m4a.stat().st_size > 0 and not force:
                ok_audio[part] = f"media/{tid}/{part}.m4a"
                continue
            print(f"  remux #{tid} {part}: {src.name} -> {out_m4a.name}")
            if remux_to_m4a(src, out_m4a):
                ok_audio[part] = f"media/{tid}/{part}.m4a"
            else:
                print(f"  skip remux fail #{tid} {part} ({src.name})", file=sys.stderr)
                if out_m4a.exists():
                    out_m4a.unlink()

        if not ok_audio:
            skipped += 1
            continue

        tier_map = copy_opus_tiers(
            folder,
            meta,
            tid,
            media_root,
            list(ok_audio.keys()),
            force=force or refresh,
        )
        audio_tiers: dict[str, dict[str, str]] = {}
        for part, rel in ok_audio.items():
            entry = {"original": rel}
            entry.update(tier_map.get(part) or {})
            audio_tiers[part] = entry
        slim["audio"] = ok_audio
        slim["audio_tiers"] = audio_tiers

        sheet_dir = sheets_root / str(tid)
        sheet_dir.mkdir(parents=True, exist_ok=True)
        all_sheets = find_sheets(folder, meta) or [sheet]
        sheet_rels: list[str] = []
        used_names: set[str] = set()
        for i, src_sheet in enumerate(all_sheets):
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

        preview_name = ((meta.get("parts") or {}).get("sheet_preview") or {}).get("filename")
        if preview_name:
            src_preview = folder / preview_name
            if src_preview.is_file():
                dest_preview = sheet_dir / "preview.webp"
                if not dest_preview.exists() or force:
                    shutil.copy2(src_preview, dest_preview)
                rel = f"sheets/{tid}/preview.webp"
                slim["sheet_preview"] = rel
                slim["sheet_pages"] = [rel]

        summary = meta.get("audio_layout_summary")
        if isinstance(summary, dict) and summary.get("parts"):
            slim["audio_layout_summary"] = {
                k: summary[k]
                for k in (
                    "parts",
                    "mix",
                    "ultra_low",
                    "solo_side",
                    "mix_correlation",
                    "mix_disjoint",
                    "mix_cache",
                    "parts_recombinable",
                    "recombine_reason",
                    "analyzed_at",
                )
                if k in summary
            }
        layouts: dict[str, dict] = {}
        for part in ok_audio:
            al = ((meta.get("parts") or {}).get(part) or {}).get("audio_layout")
            if isinstance(al, dict) and al.get("kind"):
                layouts[part] = {
                    k: al[k]
                    for k in (
                        "kind",
                        "solo_side",
                        "channels",
                        "balance",
                        "correlation",
                        "side_mid",
                    )
                    if k in al
                }
        if layouts:
            slim["audio_layouts"] = layouts

        align_summary = meta.get("audio_align_summary")
        if isinstance(align_summary, dict) and align_summary.get("status"):
            slim["audio_align_summary"] = {
                k: align_summary[k]
                for k in (
                    "status",
                    "ref_part",
                    "min_offset_ms",
                    "trusted_parts",
                    "applied_ms",
                    "analyzed_at",
                )
                if k in align_summary
            }
        align_parts: dict[str, dict] = {}
        for part in ok_audio:
            aa = ((meta.get("parts") or {}).get(part) or {}).get("audio_align")
            if isinstance(aa, dict) and "offset_ms" in aa:
                align_parts[part] = slim_align_entry(aa)
        if align_parts:
            slim["audio_align"] = align_parts

        tiers_summary = meta.get("audio_tiers_summary")
        if isinstance(tiers_summary, dict):
            slim["audio_tiers_summary"] = {
                k: tiers_summary[k]
                for k in (
                    "ultra_policy",
                    "mix_only",
                    "mix_disjoint",
                    "mix_cache",
                    "parts_recombinable",
                    "recombine_reason",
                    "playback_kbps",
                    "align_status",
                    "align_applied_ms",
                    "align_min_offset_ms",
                    "encoded_at",
                )
                if k in tiers_summary
            }

        tag_dir = tags_root / str(tid)
        tag_dir.mkdir(exist_ok=True)
        (tag_dir / "metadata.json").write_text(
            json.dumps(slim, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        tier_kinds = sorted(
            {
                t
                for part_tiers in audio_tiers.values()
                for t in part_tiers
                if t != "original"
            }
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
                "audioTiers": tier_kinds,
                "ultraLow": (slim.get("audio_layout_summary") or {}).get("ultra_low"),
                "sheet": slim["sheet"],
            }
        )
        n_tiers = sum(len(v) - 1 for v in audio_tiers.values())
        print(f"seeded #{tid} {slim['title']} ({len(ok_audio)} originals, {n_tiers} tier files)")

    if tag_ids:
        # Keep other sample tags; rebuild manifest from everything under tags/.
        manifest = []
        for meta_path in sorted(
            tags_root.glob("*/metadata.json"),
            key=lambda p: int(p.parent.name) if p.parent.name.isdigit() else 0,
        ):
            try:
                slim = json.loads(meta_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            tid = slim.get("tag_id")
            if not isinstance(tid, int):
                continue
            audio = slim.get("audio") or {}
            tiers = slim.get("audio_tiers") or {}
            tier_kinds = sorted(
                {
                    t
                    for part_tiers in tiers.values()
                    if isinstance(part_tiers, dict)
                    for t in part_tiers
                    if t != "original"
                }
            )
            manifest.append(
                {
                    "id": tid,
                    "title": slim.get("title"),
                    "arranger": slim.get("arranger"),
                    "key": slim.get("key"),
                    "rating": slim.get("rating"),
                    "type": slim.get("type"),
                    "collection": slim.get("collection"),
                    "hasSheet": True,
                    "audioParts": sorted(audio.keys()) if isinstance(audio, dict) else [],
                    "audioTiers": tier_kinds,
                    "ultraLow": (slim.get("audio_layout_summary") or {}).get("ultra_low"),
                    "sheet": slim.get("sheet"),
                }
            )

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
    return 0 if len(manifest) >= 1 else 1


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
        default=Path(__file__).resolve().parents[2] / "sample-data",
    )
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild sample-data from scratch (re-remux AAC + recopy tiers)",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Update existing sample tags in place (keeps AAC remuxes; recopies Opus tiers)",
    )
    parser.add_argument(
        "--ids",
        type=str,
        default="",
        help="Comma-separated tag ids to seed/update (e.g. 3068,1929)",
    )
    args = parser.parse_args()
    if not args.library.is_dir():
        print(f"library not found: {args.library}", file=sys.stderr)
        return 1
    if shutil.which("ffmpeg") is None:
        print("ffmpeg not found on PATH", file=sys.stderr)
        return 1
    tag_ids: list[int] | None = None
    if args.ids.strip():
        try:
            tag_ids = [int(x.strip()) for x in args.ids.split(",") if x.strip()]
        except ValueError:
            print(f"invalid --ids: {args.ids}", file=sys.stderr)
            return 1
    refresh = (not tag_ids) and (
        args.refresh
        or (not args.force and (args.dest / "tags").is_dir() and any((args.dest / "tags").iterdir()))
    )
    return seed(
        args.library,
        args.dest,
        args.limit,
        force=args.force or bool(tag_ids),
        refresh=refresh,
        tag_ids=tag_ids,
    )


if __name__ == "__main__":
    raise SystemExit(main())
