"""Stable tag identity — tag_id is a mutable pseudo-key on the origin.

Correlate local folders ↔ remote export rows using a content fingerprint built from
stable descriptive fields (title, arranger, key, version, alt title, posted date).
Optional secondary match via sheet-alt basename or on-disk file sha256 indexes.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any, Optional

from .names import sanitize_segment
from .state import (
    extract_id_from_folder_name,
    iter_tag_folders,
    load_metadata,
    read_tag_id_from_folder,
)


def _norm(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip().lower()
    text = re.sub(r"\s+", " ", text)
    # Drop decorative punctuation that differs across HTML vs API
    text = re.sub(r"[\"'`´]", "", text)
    return text


def normalize_writ_key(writ_key: Optional[str]) -> Optional[str]:
    """Convert API WritKey like 'Major:F' / 'Minor:Eb' → 'F Major' / 'Eb Minor'."""
    if not writ_key:
        return None
    raw = str(writ_key).strip()
    if not raw:
        return None
    if ":" in raw:
        mode, pitch = raw.split(":", 1)
        mode = mode.strip()
        pitch = pitch.strip()
        if mode and pitch:
            return f"{pitch} {mode}"
    return raw


def identity_components(meta: dict) -> dict[str, str]:
    """Fields that define a tag independent of mutable remote id."""
    title = meta.get("title") or meta.get("Title")
    arranger = meta.get("arranger") or meta.get("Arranger")
    key = meta.get("key") or normalize_writ_key(meta.get("WritKey") or meta.get("writ_key"))
    version = meta.get("version") or meta.get("Version")
    alt = (
        meta.get("alt_title")
        or meta.get("AltTitle")
        or meta.get("subtitle")
        or meta.get("Alt Title")
    )
    posted = meta.get("date_posted") or meta.get("Posted") or meta.get("posted")
    return {
        "title": _norm(title),
        "arranger": _norm(arranger),
        "key": _norm(key),
        "version": _norm(version),
        "alt_title": _norm(alt),
        "posted": _norm(posted),
    }


def identity_key(meta: dict) -> str:
    """Stable string key for correlating local folders with remote API rows."""
    c = identity_components(meta)
    return "|".join(
        [
            c["title"],
            c["arranger"],
            c["key"],
            c["version"],
            c["alt_title"],
            c["posted"],
        ]
    )


def identity_key_loose(meta: dict) -> str:
    """Weaker fingerprint (title|arranger|key) for first-pass matching of legacy folders."""
    c = identity_components(meta)
    return "|".join([c["title"], c["arranger"], c["key"]])


def identity_hash(meta: dict) -> str:
    return hashlib.sha256(identity_key(meta).encode("utf-8")).hexdigest()[:16]


def sheet_alt_basename(meta: dict) -> Optional[str]:
    """Filename under /tags/ when SheetMusicAlt is present (often unique)."""
    url = meta.get("sheet_alt_url") or meta.get("SheetMusicAlt") or ""
    if not url:
        assets = meta.get("discovered_assets") or {}
        sheet = assets.get("sheet") or {}
        url = sheet.get("alt_url") or sheet.get("original_filename") or ""
    if not url:
        return None
    name = str(url).rstrip("/").rsplit("/", 1)[-1].strip()
    return name.lower() or None


def part_sha256_set(meta: dict) -> set[str]:
    out: set[str] = set()
    for entry in (meta.get("parts") or {}).values():
        if isinstance(entry, dict):
            digest = entry.get("sha256")
            if isinstance(digest, str) and len(digest) >= 16:
                out.add(digest.lower())
    return out


def index_local_library(root: Path) -> dict[str, Any]:
    """Build lookup tables for matching remote rows to local folders."""
    by_identity: dict[str, list[Path]] = {}
    by_identity_loose: dict[str, list[Path]] = {}
    by_tag_id: dict[int, Path] = {}
    by_sheet_alt: dict[str, Path] = {}
    by_sha256: dict[str, Path] = {}
    folders: list[Path] = []

    for folder in iter_tag_folders(root):
        folders.append(folder)
        meta = load_metadata(folder) if (folder / "metadata.json").exists() else {}
        if not meta:
            tag_id = extract_id_from_folder_name(folder.name)
            title_guess = folder.name
            if tag_id is not None:
                title_guess = re.sub(r"\s-\s\d+$", "", folder.name)
            meta = {"title": title_guess, "tag_id": tag_id}

        key = identity_key(meta)
        if key and key != "|||||":
            by_identity.setdefault(key, []).append(folder)
        loose = identity_key_loose(meta)
        if loose and loose != "||":
            by_identity_loose.setdefault(loose, []).append(folder)

        tag_id = meta.get("tag_id")
        if not isinstance(tag_id, int):
            tag_id = read_tag_id_from_folder(folder)
        if isinstance(tag_id, int):
            by_tag_id.setdefault(tag_id, folder)

        alt = sheet_alt_basename(meta)
        if alt:
            by_sheet_alt.setdefault(alt, folder)

        for digest in part_sha256_set(meta):
            by_sha256.setdefault(digest, folder)

    return {
        "folders": folders,
        "by_identity": by_identity,
        "by_identity_loose": by_identity_loose,
        "by_tag_id": by_tag_id,
        "by_sheet_alt": by_sheet_alt,
        "by_sha256": by_sha256,
    }


def match_remote_to_folder(
    remote: dict,
    local_index: dict[str, Any],
    *,
    claimed: Optional[set[Path]] = None,
) -> tuple[Optional[Path], str]:
    """Return (folder, match_method) for a remote API row.

    Preference order:
      1. identity_key (full fingerprint)
      2. identity_key_loose (title|arranger|key) when unique
      3. sheet_alt basename
      4. current tag_id (last resort — IDs may have been reassigned)
    """
    claimed = claimed or set()

    def _take(folder: Optional[Path], method: str) -> tuple[Optional[Path], str]:
        if folder is None or folder in claimed:
            return None, "none"
        return folder, method

    key = identity_key(remote)
    for folder in list(local_index.get("by_identity", {}).get(key) or []):
        hit, method = _take(folder, "identity")
        if hit:
            return hit, method

    loose = identity_key_loose(remote)
    loose_hits = [
        f
        for f in (local_index.get("by_identity_loose", {}).get(loose) or [])
        if f not in claimed
    ]
    if len(loose_hits) == 1:
        return loose_hits[0], "identity_loose"

    alt = sheet_alt_basename(remote)
    if alt:
        hit, method = _take(local_index.get("by_sheet_alt", {}).get(alt), "sheet_alt")
        if hit:
            return hit, method

    tag_id = remote.get("tag_id")
    if isinstance(tag_id, int):
        hit, method = _take(local_index.get("by_tag_id", {}).get(tag_id), "tag_id")
        if hit:
            return hit, method

    return None, "none"


def ensure_identity_fields(meta: dict) -> dict:
    """Persist identity_key / identity_hash on metadata for future correlating."""
    key = identity_key(meta)
    meta["identity_key"] = key
    meta["identity_hash"] = identity_hash(meta)
    # Human-friendly mirror of components (debugging / migrations)
    meta["identity"] = identity_components(meta)
    return meta


def display_title_for_folder(meta: dict) -> str:
    title = sanitize_segment(meta.get("title"), allow_empty=False) or "Untitled"
    return title
