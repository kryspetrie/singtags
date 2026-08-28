#!/usr/bin/env python3
"""Download / repair learning tracks and sheet music (PDF + images)."""

from __future__ import annotations

import sys
from pathlib import Path

_MIRROR_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _MIRROR_DIR.parent
for _p in (_REPO_ROOT, _MIRROR_DIR):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import argparse
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from typing import Optional

from lib.complete import advertised_audio_parts, find_sheet_file, lyrics_are_accepted
from lib.audio_tiers import encode_tiers_for_part
from lib.config import PART_DISPLAY, ROOT_DOWNLOAD_DIR, SHEET_EXTENSIONS
from lib.http import (
    absolute_url,
    download_bytes,
    is_guidelines_content,
    last_was_transport_error,
    pause_between_requests,
    sha256_bytes,
    sniff_extension,
)
from lib.names import build_file_name, build_folder_name
from lib.parse_tag_page import download_file_url, tag_page_url
from lib.sheet_export import build_sheet_preview_webp, crop_pdf_bytes
from lib.state import (
    find_folder_for_id,
    load_metadata,
    save_metadata,
)
import hashlib


def _extension_from_name(name: str, data: bytes) -> str:
    lower = name.lower()
    for ext in list(SHEET_EXTENSIONS) + [".mp3", ".zip"]:
        if lower.endswith(ext):
            return ext
    return sniff_extension(data, fallback=".bin")


def _part_entry(meta: dict, part: str) -> dict:
    parts = meta.setdefault("parts", {})
    return parts.setdefault(part, {})


def _normalize_sheet_bytes(data: bytes, ext: str) -> tuple[bytes, dict]:
    """Post-process sheet bytes (footer-aware PDF crop). Returns (bytes, flags)."""
    flags: dict = {}
    if ext.lower() != ".pdf":
        return data, flags
    try:
        cropped = crop_pdf_bytes(data)
    except Exception as exc:
        print(f"   [Warn] PDF crop failed, keeping original: {exc}")
        return data, flags
    flags["sheet_cropped"] = True
    flags["sheet_crop_method"] = "cropbox"
    return cropped, flags


def ensure_sheet_preview(
    folder: Path,
    meta: dict,
    sheet_path: Path,
    *,
    force: bool = False,
) -> Optional[Path]:
    """Generate or refresh 2-bit dither WebP preview for offline/display caching."""
    preview_entry = _part_entry(meta, "sheet_preview")
    filename = build_file_name(
        meta.get("title"),
        meta.get("key"),
        meta.get("arranger"),
        "sheet_preview",
        ".webp",
    )
    dest = folder / filename

    # Drop legacy verbose preview fields; keep filename only.
    for key in list(preview_entry.keys()):
        if key != "filename":
            preview_entry.pop(key, None)
    meta.pop("sheet_preview_format", None)
    meta.pop("sheet_preview_kind", None)

    if not force and preview_entry.get("filename") == filename and dest.is_file():
        return dest

    for old in list(folder.glob("*")):
        if not old.is_file() or old == dest:
            continue
        if old.suffix.lower() == ".webp" and "sheet preview" in old.name.lower():
            try:
                old.unlink()
            except OSError:
                pass

    try:
        size = build_sheet_preview_webp(sheet_path, dest)
    except Exception as exc:
        print(f"   [Warn] sheet preview failed: {exc}")
        return None

    # Replace the whole entry so leftover verbose keys cannot linger.
    meta.setdefault("parts", {})["sheet_preview"] = {"filename": filename}
    print(f"   --> Preview {filename} ({size} bytes)")
    return dest


def save_part_file(
    folder: Path,
    meta: dict,
    part: str,
    data: bytes,
    original_filename: str,
    fldname: Optional[str] = None,
    force: bool = False,
) -> Optional[Path]:
    if is_guidelines_content(data):
        print(f"   [Skip] guidelines content for part={part}")
        return None

    ext = _extension_from_name(original_filename, data)
    source_digest = sha256_bytes(data)
    process_flags: dict = {}
    if part == "sheet":
        data, process_flags = _normalize_sheet_bytes(data, ext)

    filename = build_file_name(
        meta.get("title"),
        meta.get("key"),
        meta.get("arranger"),
        part,
        ext,
    )
    dest = folder / filename
    digest = sha256_bytes(data)

    existing = _part_entry(meta, part)
    if dest.exists() and not force:
        if existing.get("sha256") == digest or dest.stat().st_size == len(data):
            print(f"   [=] exists {filename}")
            existing.setdefault("filename", filename)
            existing.setdefault("original_filename", original_filename)
            existing.setdefault("sha256", digest)
            existing.setdefault("bytes", len(data))
            return dest

    # Remove older sheet/audio with same part but different name/ext
    for old in list(folder.glob("*")):
        if not old.is_file():
            continue
        if old.name == filename:
            continue
        # Heuristic: same part suffix
        label = PART_DISPLAY.get(part, part)
        if old.stem.endswith(f" - {label}") or old.name.endswith(f"_Track_{label}.mp3") or (
            part == "sheet" and "Sheet_Music" in old.name
        ):
            try:
                old.unlink()
            except OSError:
                pass

    dest.write_bytes(data)
    existing.update(
        {
            "filename": filename,
            "original_filename": original_filename,
            "fldname": fldname,
            "sha256": digest,
            "bytes": len(data),
            "mime_guess": ext.lstrip("."),
            "source_sha256": source_digest,
        }
    )
    if part == "sheet":
        meta["sheet_format"] = ext.lstrip(".")
        if process_flags.get("sheet_cropped"):
            meta["sheet_cropped"] = True
            meta["sheet_crop_method"] = process_flags.get("sheet_crop_method", "cropbox")
            existing["cropped"] = True
            existing["crop_method"] = meta["sheet_crop_method"]
            print(f"   --> Saved {filename} ({len(data)} bytes, cropbox)")
        else:
            print(f"   --> Saved {filename} ({len(data)} bytes)")
        ensure_sheet_preview(folder, meta, dest, force=force)
    else:
        print(f"   --> Saved {filename} ({len(data)} bytes)")
        try:
            if encode_tiers_for_part(folder, meta, part, force=force):
                tiers = ((meta.get("parts") or {}).get(part) or {}).get("audio_tiers") or {}
                print(f"   --> Opus tiers for {part}: {', '.join(sorted(tiers.keys()))}")
        except Exception as exc:
            print(f"   [Warn] Opus tier encode failed for {part}: {exc}")
    return dest


def fetch_asset(url: str) -> Optional[tuple[bytes, str]]:
    """Download asset bytes. On failure, check last_was_transport_error() for network vs missing."""
    data = download_bytes(url, max_retries=2)
    if data is None:
        return None
    return data, url


def _mark_http_error(meta: dict, folder: Path, tag_id: int, reason: str) -> dict:
    print(f"   Tag #{tag_id}: {reason}")
    meta["tag_id"] = tag_id
    meta["status"] = "http_error"
    meta["folder_name"] = folder.name
    save_metadata(folder, meta)
    return meta


def ensure_folder(tag_id: int, meta: dict, root: Path) -> Path:
    folder_name = build_folder_name(
        tag_id,
        meta.get("title") or f"Tag {tag_id}",
        meta.get("key"),
        meta.get("arranger"),
    )
    target = root / folder_name
    existing = find_folder_for_id(tag_id, root)
    if existing and existing != target:
        # Work in existing folder until normalize migrates
        return existing
    target.mkdir(parents=True, exist_ok=True)
    return target


def discover_and_parse(tag_id: int) -> Optional[dict]:
    """Resolve metadata for downloads without scraping HTML tag pages.

    Prefer on-disk metadata / cached bulk API export. Per-tag HTML view pages
    are forbidden — they full-scan the origin DB and can take the site down.
    """
    from lib.api import load_cached_export

    export = load_cached_export()
    if export:
        for row in export.get("tags") or []:
            if row.get("tag_id") == tag_id:
                return row
    print(
        f"   Tag #{tag_id}: no cached API row (run enrich.py --bulk); "
        "refusing HTML scrape"
    )
    return {"tag_id": tag_id, "status": "not_found"}


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def register_existing_parts(folder: Path, meta: dict) -> dict:
    """Map on-disk sheet/audio into meta['parts'] without downloading."""
    from normalize import detect_part

    parts = meta.setdefault("parts", {})
    for path in sorted(folder.iterdir()):
        if not path.is_file():
            continue
        if path.name in {"metadata.json"}:
            continue
        part = detect_part(path)
        if part is None:
            # Legacy sheet names
            low = path.name.lower()
            if path.suffix.lower() in SHEET_EXTENSIONS and (
                "sheet" in low or "music" in low or path.suffix.lower() in {".gif", ".jpg", ".jpeg", ".png"}
            ):
                if "guidelines" in low:
                    continue
                part = "sheet"
            else:
                continue
        entry = parts.setdefault(part, {})
        if entry.get("filename") and (folder / entry["filename"]).is_file():
            continue
        entry.update(
            {
                "filename": path.name,
                "original_filename": entry.get("original_filename") or path.name,
                "bytes": path.stat().st_size,
                "sha256": _sha256_file(path),
                "mime_guess": path.suffix.lstrip(".").lower(),
            }
        )
        if part == "sheet":
            meta["sheet_format"] = path.suffix.lstrip(".").lower()
        elif part == "sheet_preview":
            parts["sheet_preview"] = {"filename": path.name}
    return meta


def sheet_already_on_disk(folder: Path, meta: dict) -> bool:
    return find_sheet_file(folder, meta) is not None


def audio_part_on_disk(folder: Path, part: str, meta: dict | None = None) -> bool:
    """True if this voice/mix part already exists locally under any naming scheme."""
    meta = meta or {}
    info = (meta.get("parts") or {}).get(part) or {}
    name = info.get("filename")
    if name and (folder / name).is_file() and (folder / name).stat().st_size > 0:
        return True
    for path in folder.glob("*.mp3"):
        if not path.is_file() or path.stat().st_size <= 0:
            continue
        low = path.name.lower()
        if part == "mix":
            if "full_mix" in low or "allparts" in low or low.endswith(" - mix.mp3") or (
                "mix" in low and "bass" not in low and "bari" not in low and "lead" not in low and "tenor" not in low
            ):
                return True
        elif part in low:
            return True
    return False


def missing_audio_parts(folder: Path, meta: dict) -> list[str]:
    """Parts advertised by bulk metadata that are not on disk yet.

    If ``discovered_assets`` is absent (legacy), falls back to probing all five
    standard parts. If it is present but lists no audio, returns [] — do not
    hit the origin for learning tracks that the export says do not exist.
    """
    expected = advertised_audio_parts(meta)
    if expected is None:
        expected = ["bass", "bari", "lead", "tenor", "mix"]
    return [p for p in expected if not audio_part_on_disk(folder, p, meta)]


def download_parts_for_tag(
    tag_id: int,
    root: Path,
    force_sheet: bool = False,
    skip_audio: bool = True,
    parsed: Optional[dict] = None,
) -> dict:
    """Download only missing sheet/audio. Never re-fetch files already on disk.

    skip_audio defaults to True — be polite to origin; only fetch learning tracks
    when explicitly requested.
    """
    # Prefer existing folder; avoid creating a second empty folder that triggers re-downloads
    existing_folder = find_folder_for_id(tag_id, root)

    if parsed is None and existing_folder is None:
        parsed = discover_and_parse(tag_id)
        if parsed is None:
            return {"tag_id": tag_id, "status": "http_error"}
        if parsed.get("status") == "not_found":
            return parsed
    elif parsed is None:
        # Local folder exists — do not hit origin just to learn URLs; use dbaction by id
        meta_existing = load_metadata(existing_folder) if existing_folder else {}
        parsed = {
            "tag_id": tag_id,
            "status": meta_existing.get("status") or "ok",
            "title": meta_existing.get("title") or f"Tag {tag_id}",
            "key": meta_existing.get("key"),
            "arranger": meta_existing.get("arranger"),
            "discovered_assets": meta_existing.get("discovered_assets") or {},
            "lyrics": meta_existing.get("lyrics"),
        }

    if parsed.get("status") == "not_found":
        return parsed

    folder = existing_folder or ensure_folder(tag_id, parsed, root)
    meta = load_metadata(folder) if (folder / "metadata.json").exists() else {}
    from lib.state import field_has_value

    for key in (
        "title",
        "key",
        "arranger",
        "arranger_source",
        "rating",
        "votes",
        "comments",
        "posted_by",
        "keywords",
        "type",
        "year",
        "source_url",
        "status",
        "subtitle",
        "parts_count",
        "collection",
        "date_posted",
        "download_count",
        "favorites",
        "learning_tracks_by",
        "made_famous_by",
    ):
        # Fill gaps only — never overwrite non-empty local metadata
        if field_has_value(meta.get(key)):
            continue
        if parsed.get(key) is not None:
            meta[key] = parsed[key]
    if parsed.get("lyrics"):
        if not lyrics_are_accepted(meta) and not field_has_value(meta.get("lyrics")):
            meta["lyrics"] = parsed["lyrics"]
            meta["lyrics_source"] = meta.get("lyrics_source") or "html"
    meta["tag_id"] = tag_id
    if parsed.get("discovered_assets") and not field_has_value(meta.get("discovered_assets")):
        meta["discovered_assets"] = parsed["discovered_assets"]
    elif parsed.get("discovered_assets") and isinstance(meta.get("discovered_assets"), dict):
        # Merge asset URL map: add missing part keys only
        discovered = dict(meta["discovered_assets"])
        for part, info in (parsed.get("discovered_assets") or {}).items():
            if part not in discovered and info:
                discovered[part] = info
        meta["discovered_assets"] = discovered
    if not field_has_value(meta.get("source_url")):
        meta["source_url"] = tag_page_url(tag_id)

    register_existing_parts(folder, meta)

    assets = dict(meta.get("discovered_assets") or {})
    need_sheet = force_sheet or not sheet_already_on_disk(folder, meta)
    if need_sheet:
        if force_sheet and sheet_already_on_disk(folder, meta):
            print(f"   re-downloading sheet (forced) for #{tag_id}")
        else:
            print(f"   sheet missing — downloading for #{tag_id}")
    else:
        print(f"   sheet already on disk — skip sheet download")

    sheet_candidates: list[tuple[str, Optional[str], str]] = []
    sheet_asset = assets.get("sheet") or {}
    if sheet_asset.get("url"):
        sheet_candidates.append(
            (
                sheet_asset["url"],
                sheet_asset.get("fldname"),
                sheet_asset.get("original_filename") or sheet_asset["url"],
            )
        )
        if sheet_asset.get("dbaction_url"):
            sheet_candidates.append(
                (sheet_asset["dbaction_url"], "SheetMusic", "dbaction:SheetMusic")
            )
        if sheet_asset.get("alt_url"):
            sheet_candidates.append(
                (sheet_asset["alt_url"], sheet_asset.get("fldname"), sheet_asset["alt_url"])
            )
    alt = meta.get("sheet_alt_url")
    if alt:
        sheet_candidates.append((alt, "SheetMusic", alt))
    sheet_candidates.append(
        (download_file_url(tag_id, "SheetMusic"), "SheetMusic", "dbaction:SheetMusic")
    )

    if need_sheet:
        saved = False
        seen_urls: set[str] = set()
        sheet_transport_error = False
        for url, fld, original in sheet_candidates:
            url = absolute_url(url)
            if url in seen_urls:
                continue
            seen_urls.add(url)
            result = fetch_asset(url)
            if result is None and last_was_transport_error():
                sheet_transport_error = True
                # Site is timing out — don't thrash remaining URLs / zip; let sync poll.
                break
            pause_between_requests()
            if not result:
                continue
            data, _ = result
            if save_part_file(folder, meta, "sheet", data, original, fldname=fld, force=force_sheet):
                saved = True
                break
        if not saved:
            print(f"   Tag #{tag_id}: no sheet music retrieved")
            if sheet_transport_error:
                return _mark_http_error(
                    meta, folder, tag_id, "sheet download failed (origin transport error)"
                )

    if "notation" in assets and "notation" not in (meta.get("parts") or {}):
        na = assets["notation"]
        result = fetch_asset(na["url"])
        pause_between_requests()
        if result:
            save_part_file(
                folder,
                meta,
                "notation",
                result[0],
                na.get("original_filename") or na["url"],
                fldname=na.get("fldname"),
            )

    if skip_audio:
        present = [p for p in ("bass", "bari", "lead", "tenor", "mix") if audio_part_on_disk(folder, p, meta)]
        if present:
            print(f"   audio on disk ({', '.join(present)}) — skip audio download")
        else:
            print("   skip_audio=True — not fetching learning tracks")
    else:
        advertised = advertised_audio_parts(meta)
        missing = missing_audio_parts(folder, meta)
        if advertised == []:
            print("   no learning tracks in metadata — skip audio download")
        elif not missing:
            print("   all advertised audio parts already on disk — skip audio download")
        audio_transport_error = False
        fld_map = {
            "bass": "Bass",
            "bari": "Bari",
            "lead": "Lead",
            "tenor": "Tenor",
            "mix": "AllParts",
        }
        for part in missing:
            print(f"   audio missing ({part}) — downloading")
            asset = assets.get(part) if isinstance(assets.get(part), dict) else None
            urls: list[tuple[str, Optional[str], str]] = []
            if asset and asset.get("url"):
                urls.append(
                    (
                        asset["url"],
                        asset.get("fldname"),
                        asset.get("original_filename") or asset["url"],
                    )
                )
            # dbaction fallback only for parts the export advertised (or legacy probe)
            urls.append(
                (download_file_url(tag_id, fld_map[part]), fld_map[part], f"dbaction:{fld_map[part]}")
            )

            part_saved = False
            for url, fld, original in urls:
                result = fetch_asset(absolute_url(url))
                if result is None and last_was_transport_error():
                    audio_transport_error = True
                    break
                pause_between_requests()
                if not result:
                    continue
                data, _ = result
                if sniff_extension(data) not in {".mp3", ".bin"} and not data.startswith(b"ID3"):
                    if data.lstrip().startswith(b"<"):
                        continue
                if save_part_file(folder, meta, part, data, original, fldname=fld):
                    part_saved = True
                    break
            if not part_saved and audio_transport_error:
                return _mark_http_error(
                    meta, folder, tag_id, f"audio download failed for {part} (origin transport error)"
                )

    # Zip fallback ONLY when sheet still missing (never to refresh existing audio)
    register_existing_parts(folder, meta)
    parts = meta.get("parts") or {}
    if not sheet_already_on_disk(folder, meta) and "_zip" in assets:
        print(f"   trying zip fallback for missing sheet #{tag_id}")
        result = fetch_asset(assets["_zip"]["url"])
        zip_transport = result is None and last_was_transport_error()
        pause_between_requests()
        if result:
            try:
                with zipfile.ZipFile(BytesIO(result[0])) as zf:
                    for name in zf.namelist():
                        lower = name.lower()
                        data = zf.read(name)
                        if is_guidelines_content(data):
                            continue
                        ext = _extension_from_name(name, data)
                        if ext in SHEET_EXTENSIONS and not sheet_already_on_disk(folder, meta):
                            save_part_file(folder, meta, "sheet", data, name)
                        elif ext == ".mp3" and not skip_audio:
                            part = "mix"
                            for cand in ("bass", "bari", "lead", "tenor"):
                                if cand in lower:
                                    part = cand
                                    break
                            if "allparts" in lower:
                                part = "mix"
                            if not audio_part_on_disk(folder, part, meta):
                                save_part_file(folder, meta, part, data, name)
            except zipfile.BadZipFile:
                print(f"   Tag #{tag_id}: bad zip")
        elif zip_transport and not sheet_already_on_disk(folder, meta):
            return _mark_http_error(
                meta, folder, tag_id, "zip fallback failed (origin transport error)"
            )

    register_existing_parts(folder, meta)
    meta["downloaded_at"] = datetime.now(timezone.utc).isoformat()
    meta["folder_name"] = folder.name
    present = set((meta.get("parts") or {}).keys())
    if "sheet" in present and present & {"bass", "bari", "lead", "tenor", "mix"}:
        meta["status"] = "ok"
    elif present:
        meta["status"] = "partial"
    else:
        meta["status"] = "missing_assets"

    save_metadata(folder, meta)
    return meta


def parse_id_list(text: str) -> list[int]:
    ids: list[int] = []
    for chunk in text.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if "-" in chunk:
            a, b = chunk.split("-", 1)
            ids.extend(range(int(a), int(b) + 1))
        else:
            ids.append(int(chunk))
    return ids


def main() -> None:
    parser = argparse.ArgumentParser(description="Download/repair tag assets")
    parser.add_argument("--root", type=Path, default=ROOT_DOWNLOAD_DIR)
    parser.add_argument("--ids", type=str, required=True, help="e.g. 1,2180,5903 or 1-10")
    parser.add_argument("--force-sheet", action="store_true")
    parser.add_argument(
        "--with-audio",
        action="store_true",
        help="Download missing MP3s (still never re-fetches files already on disk)",
    )
    args = parser.parse_args()

    ids = parse_id_list(args.ids)
    print(f"Asset repair for {len(ids)} tag(s)... (skip_audio={not args.with_audio})")
    for tag_id in ids:
        print(f"Processing #{tag_id}...")
        try:
            download_parts_for_tag(
                tag_id,
                args.root,
                force_sheet=args.force_sheet,
                skip_audio=not args.with_audio,
            )
        except Exception as exc:
            print(f"   Tag #{tag_id}: {exc}")
        pause_between_requests()
    print("Done.")


if __name__ == "__main__":
    main()
