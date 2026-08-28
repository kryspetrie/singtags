#!/usr/bin/env python3
"""Build SingTags indexes (+ slim per-tag JSON) directly from library/.

Does not copy or remux media. Paths in published metadata are library-relative
(URL-encoded folder + filename) so the SPA can fetch from VITE_MEDIA_BASE=/library.
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
from pathlib import Path
from urllib.parse import quote

SITE_ROOT = Path(__file__).resolve().parents[1]

# Bidirectional lyric expansions (pre-fold forms → meaning variants).
BASE_EXPANSIONS: dict[str, list[str]] = {
    "em": ["them"],
    "them": ["em"],
    "every": ["evry", "every"],
    "evry": ["every"],
    "everything": ["evrything", "everything"],
    "evrything": ["everything"],
    "everyone": ["evryone", "everyone"],
    "evryone": ["everyone"],
    "everybody": ["evrybody", "everybody"],
    "evrybody": ["everybody"],
    "oer": ["over"],
    "over": ["oer"],
    "neer": ["never"],
    "never": ["neer"],
    "goin": ["going"],
    "going": ["goin"],
    "lovin": ["loving"],
    "loving": ["lovin"],
    "nothin": ["nothing"],
    "nothing": ["nothin"],
    "somethin": ["something"],
    "something": ["somethin"],
    "darlin": ["darling"],
    "darling": ["darlin"],
    "mornin": ["morning"],
    "morning": ["mornin"],
    "waitin": ["waiting"],
    "waiting": ["waitin"],
    "lookin": ["looking"],
    "looking": ["lookin"],
    "gonna": ["going", "to"],
    "wanna": ["want", "to"],
    "gotta": ["got", "to"],
    "aint": ["aint", "are", "not", "is", "not"],
    "thru": ["through"],
    "through": ["thru"],
    "til": ["until"],
    "until": ["til"],
    "memry": ["memory"],
    "memory": ["memry"],
    "heavn": ["heaven"],
    "heaven": ["heavn"],
    "cause": ["because"],
    "because": ["cause"],
    "round": ["around"],
    "around": ["round"],
    "bout": ["about"],
    "about": ["bout"],
    "cross": ["across"],
    "across": ["cross"],
}

AUDIO_PARTS = ("lead", "tenor", "bari", "bass", "mix")
SKIP_DIRS = {"_state", "_codec_demos_opus", "_codec_demos", ".venv", "venv"}


def fold(text: str) -> str:
    s = text.lower()
    s = s.replace("'", "").replace("'", "").replace("`", "")
    s = re.sub(r"[^a-z0-9\s]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def lib_url(folder: str, filename: str) -> str:
    """Library-relative URL path (percent-encoded segments)."""
    return f"{quote(folder, safe='')}/{quote(filename, safe='')}"


def part_filename(parts: dict, part: str) -> str | None:
    entry = parts.get(part)
    if isinstance(entry, dict):
        name = entry.get("filename")
        return name if isinstance(name, str) and name else None
    if isinstance(entry, str) and entry:
        return entry
    return None


def find_tier_file(folder: Path, stem_hint: str, *needles: str) -> str | None:
    """Find an opus/m4a file in folder whose name contains all needles (case-insensitive)."""
    needles_l = [n.lower() for n in needles]
    for f in folder.iterdir():
        if not f.is_file():
            continue
        if f.suffix.lower() not in {".opus", ".m4a", ".mp3", ".ogg", ".webm"}:
            continue
        name = f.name.lower()
        if all(n in name for n in needles_l):
            return f.name
    # fallback: try stem from original part file
    if stem_hint:
        base = Path(stem_hint).stem.lower()
        for f in folder.iterdir():
            if not f.is_file():
                continue
            if f.suffix.lower() not in {".opus", ".m4a", ".mp3"}:
                continue
            name = f.name.lower()
            if base.split(" - ")[0][:20] in name and all(n in name for n in needles_l):
                return f.name
    return None


def tag_id_of(meta: dict, folder: Path) -> int | None:
    for key in ("id", "tag_id"):
        v = meta.get(key)
        if isinstance(v, int):
            return v
        if isinstance(v, str) and v.isdigit():
            return int(v)
    # folder names end with " - {id}"
    m = re.search(r"-\s*(\d+)\s*$", folder.name)
    return int(m.group(1)) if m else None


def spa_metadata(folder: Path, meta: dict, tid: int) -> dict:
    """SPA-shaped metadata with library-relative media paths."""
    parts = meta.get("parts") if isinstance(meta.get("parts"), dict) else {}
    audio: dict[str, str] = {}
    audio_tiers: dict[str, dict[str, str]] = {}

    for part in AUDIO_PARTS:
        fname = part_filename(parts, part)
        if not fname:
            # try discover original mp3
            for f in folder.iterdir():
                if f.is_file() and f.suffix.lower() == ".mp3" and part in f.name.lower():
                    if part == "mix" and "ultra" in f.name.lower():
                        continue
                    fname = f.name
                    break
        if not fname:
            continue
        orig_path = lib_url(folder.name, fname)
        audio[part] = orig_path
        tiers: dict[str, str] = {"original": orig_path}
        playback = find_tier_file(folder, fname, part, "playback")
        if playback:
            tiers["playback"] = lib_url(folder.name, playback)
        if part == "mix":
            ultra = find_tier_file(folder, fname, "ultra mix") or find_tier_file(
                folder, fname, part, "ultra"
            )
            if ultra:
                tiers["ultra_mix"] = lib_url(folder.name, ultra)
        else:
            ultra = find_tier_file(folder, fname, part, "ultra")
            if ultra:
                # Prefer stereo ultra label used by the SPA when present
                tiers["ultra_stereo"] = lib_url(folder.name, ultra)
        audio_tiers[part] = tiers

    sheet_name = part_filename(parts, "sheet")
    preview_name = part_filename(parts, "sheet_preview")
    sheets: list[str] = []
    sheet_pages: list[str] = []
    sheet_preview: str | None = None
    if sheet_name and (folder / sheet_name).is_file():
        sheets.append(lib_url(folder.name, sheet_name))
    if preview_name and (folder / preview_name).is_file():
        sheet_preview = lib_url(folder.name, preview_name)
        sheet_pages.append(sheet_preview)
        sheets.append(sheet_preview)
    elif sheet_preview is None:
        for f in folder.iterdir():
            if f.is_file() and "preview" in f.name.lower() and f.suffix.lower() == ".webp":
                sheet_preview = lib_url(folder.name, f.name)
                sheet_pages.append(sheet_preview)
                sheets.append(sheet_preview)
                break

    layout = meta.get("audio_layout_summary") or meta.get("audio_layouts") or {}
    title = meta.get("title")
    if not title and isinstance(meta.get("identity"), dict):
        title = meta["identity"].get("title")

    return {
        "tag_id": tid,
        "title": title,
        "alt_title": meta.get("alt_title"),
        "arranger": meta.get("arranger"),
        "key": meta.get("key"),
        "writ_key": meta.get("writ_key") or meta.get("written_key"),
        "rating": meta.get("rating"),
        "rating_count": meta.get("rating_count"),
        "download_count": meta.get("download_count"),
        "type": meta.get("type"),
        "collection": meta.get("collection"),
        "classic": meta.get("classic"),
        "year": meta.get("year") or meta.get("date_posted"),
        "parts_count": meta.get("parts_count"),
        "lyrics": meta.get("lyrics"),
        "lyrics_source": meta.get("lyrics_source"),
        "lyrics_finalized": meta.get("lyrics_finalized"),
        "audio": audio,
        "audio_tiers": audio_tiers,
        "audio_layout_summary": layout if isinstance(layout, dict) else {},
        "sheet": sheets[0] if sheets else None,
        "sheets": sheets,
        "sheet_pages": sheet_pages,
        "sheet_preview": sheet_preview,
        "source_folder": folder.name,
        "parts_recombinable": meta.get("parts_recombinable"),
    }


def build(library: Path, indexes_out: Path, tags_out: Path) -> None:
    core: list[dict] = []
    lyrics_docs: list[dict] = []
    tags_out.mkdir(parents=True, exist_ok=True)

    folders = sorted(
        p for p in library.iterdir() if p.is_dir() and p.name not in SKIP_DIRS and not p.name.startswith(".")
    )
    for folder in folders:
        meta_path = folder / "metadata.json"
        if not meta_path.is_file():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        tid = tag_id_of(meta, folder)
        if tid is None:
            continue

        published = spa_metadata(folder, meta, tid)
        tag_dir = tags_out / str(tid)
        tag_dir.mkdir(parents=True, exist_ok=True)
        (tag_dir / "metadata.json").write_text(
            json.dumps(published, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        audio = published.get("audio") or {}
        audio_tiers = published.get("audio_tiers") or {}
        tier_kinds: list[str] = []
        if isinstance(audio_tiers, dict):
            tier_kinds = sorted(
                {
                    t
                    for part_tiers in audio_tiers.values()
                    if isinstance(part_tiers, dict)
                    for t in part_tiers
                    if t != "original"
                }
            )
        layout = published.get("audio_layout_summary") or {}
        row = {
            "id": tid,
            "title": published.get("title"),
            "altTitle": published.get("alt_title"),
            "arranger": published.get("arranger"),
            "key": published.get("key"),
            "writKey": published.get("writ_key"),
            "rating": published.get("rating"),
            "ratingCount": published.get("rating_count"),
            "downloads": published.get("download_count"),
            "type": published.get("type"),
            "collection": published.get("collection"),
            "classic": published.get("classic"),
            "year": published.get("year"),
            "parts": published.get("parts_count"),
            "hasSheet": bool(published.get("sheet_pages") or published.get("sheet") or published.get("sheets")),
            "audioParts": sorted(audio.keys()) if isinstance(audio, dict) else [],
            "audioTiers": tier_kinds,
            "ultraLow": layout.get("ultra_low") if isinstance(layout, dict) else None,
            "sheetPages": published.get("sheet_pages") or [],
            "sheetPreview": published.get("sheet_preview"),
            "sheet": published.get("sheet"),
            "partsRecombinable": published.get("parts_recombinable"),
        }
        core.append(row)
        lyr = published.get("lyrics")
        if lyr:
            lyrics_docs.append({"id": tid, "lyrics": lyr})

    indexes_out.mkdir(parents=True, exist_ok=True)

    def write_gz(name: str, payload: object) -> None:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        path = indexes_out / name
        with gzip.open(path, "wb", compresslevel=9) as fh:
            fh.write(raw)
        print(f"  {name}: {len(raw)} bytes → {path.stat().st_size} gzip")

    write_gz("core.json.gz", {"version": 1, "tags": core})
    write_gz("lyrics.json.gz", {"version": 1, "docs": lyrics_docs})
    (indexes_out / "expansions.json").write_text(
        json.dumps({"version": 1, "map": BASE_EXPANSIONS}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote indexes for {len(core)} tags ({len(lyrics_docs)} with lyrics) → {indexes_out}")
    print(f"Wrote slim tag JSON → {tags_out}")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--library",
        type=Path,
        default=SITE_ROOT / "library",
        help="Working library root (default: ./library)",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=SITE_ROOT / "web" / "public" / "indexes",
        help="Indexes output directory",
    )
    p.add_argument(
        "--tags-out",
        type=Path,
        default=SITE_ROOT / "web" / "public" / "tags",
        help="Per-tag metadata JSON output (SPA detail URLs)",
    )
    args = p.parse_args()
    if not args.library.is_dir():
        raise SystemExit(f"Library not found: {args.library}")
    build(args.library, args.out, args.tags_out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
