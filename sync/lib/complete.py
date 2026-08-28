"""Heuristics for skipping already-complete tags during repair/sync."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from .config import SHEET_EXTENSIONS


_NOTATION_SOUP = re.compile(
    r"[œæø†‡♭♯♮]|TENORLEAD|BARIBASS|LEBARI|TENOR\s*LEAD|œ{2,}|[\u2669-\u266f]"
)


def lyrics_are_weak(lyrics: Optional[str]) -> bool:
    if not lyrics:
        return True
    text = str(lyrics).strip()
    if len(text) < 8:
        return True
    # Embedded PDF text from music fonts is often glyph soup, not lyrics
    if _NOTATION_SOUP.search(text):
        return True
    words = re.findall(r"[A-Za-z]{2,}", text)
    if len(words) < 3:
        return True
    letters = len(re.findall(r"[A-Za-z]", text))
    if letters / max(len(text), 1) < 0.5:
        return True
    return False


# Primary lyrics from the site / review — do not replace with ASR or OCR.
TRUSTED_PRIMARY_SOURCES = frozenset({"api", "html", "pdf_text", "manual", "final"})
ACCEPTED_LYRIC_SOURCES = frozenset({"final", "manual"})
ACCEPTED_LYRIC_KEYS = (
    "lyrics",
    "lyrics_source",
    "lyrics_finalized",
    "lyrics_finalized_at",
    "lyrics_chosen_from",
    "lyrics_reviewed_at",
)


def lyrics_are_accepted(meta: dict | None) -> bool:
    """True when a human accepted the primary lyrics. Sync must never overwrite them."""
    if not meta:
        return False
    if meta.get("lyrics_finalized"):
        return True
    source = meta.get("lyrics_source")
    if source == "final":
        return True
    if source == "manual":
        return bool(str(meta.get("lyrics") or "").strip())
    return False


def has_usable_lyrics(meta: dict) -> bool:
    """True when lyrics exist from API, HTML, PDF text, OCR, ASR, or review."""
    if lyrics_are_accepted(meta):
        return True
    if lyrics_are_weak(meta.get("lyrics")):
        return False
    source = meta.get("lyrics_source")
    if source in {"api", "ocr", "html", "pdf_text", "manual", "asr", "final"}:
        return True
    # Lyrics present without source still counts as usable
    return bool(meta.get("lyrics"))


def has_trusted_primary_lyrics(meta: dict) -> bool:
    """True when primary lyrics came from remote metadata or human review.

    These should not be overwritten by ASR/OCR/API refresh during sync.
    """
    if lyrics_are_accepted(meta):
        return True
    if lyrics_are_weak(meta.get("lyrics")):
        return False
    return meta.get("lyrics_source") in TRUSTED_PRIMARY_SOURCES


def has_ocr_lyrics(meta: dict) -> bool:
    return meta.get("lyrics_source") == "ocr" and not lyrics_are_weak(meta.get("lyrics"))


def has_manual_lyrics(meta: dict) -> bool:
    """True when lyrics were accepted via the lyric review tools (GUI or batch)."""
    return lyrics_are_accepted(meta) and not lyrics_are_weak(meta.get("lyrics"))


def lead_asr_text(meta: dict) -> Optional[str]:
    """Usable Lead part_lyrics text, if present."""
    return part_asr_text(meta, "lead")


def part_asr_text(meta: dict, part: str) -> Optional[str]:
    """Usable part_lyrics text for one part (must contain real words)."""
    raw = meta.get("part_lyrics") or {}
    if not isinstance(raw, dict):
        return None
    entry = raw.get(part)
    if not isinstance(entry, dict):
        return None
    text = (entry.get("text") or entry.get("raw") or "").strip()
    if not asr_text_has_words(text):
        return None
    return text


def asr_text_has_words(text: Optional[str]) -> bool:
    """True when ASR output has real lyric words (not empty/hum/junk)."""
    return not lyrics_are_weak(text)


def has_lead_asr(meta: dict) -> bool:
    return lead_asr_text(meta) is not None


def best_asr_primary_text(meta: dict) -> tuple[Optional[str], Optional[str]]:
    """Best ASR text for primary lyrics: Lead, then Tenor, Bari, Bass."""
    for part in ("lead", "tenor", "bari", "bass"):
        text = part_asr_text(meta, part)
        if text:
            return text, part
    return None, None


def has_usable_asr_primary(meta: dict) -> bool:
    return best_asr_primary_text(meta)[0] is not None


def audio_parts_present(folder: Path, meta: dict | None = None) -> list[str]:
    """Which of lead/tenor/bari/bass have audio files on disk (Lead-first order)."""
    meta = meta or {}
    out: list[str] = []
    for part in ("lead", "tenor", "bari", "bass"):
        if find_audio_part_file(folder, part, meta) is not None:
            out.append(part)
    return out


def promote_lead_asr_to_lyrics(meta: dict) -> bool:
    """Back-compat alias for promote_asr_to_lyrics."""
    return promote_asr_to_lyrics(meta)


def promote_asr_to_lyrics(meta: dict) -> bool:
    """Copy best ASR part into main lyrics when primary is missing/weak/OCR.

    Prefer Lead, then Tenor/Bari/Bass. Never overwrites accepted, manual, or
    remote API/HTML/PDF lyrics.
    """
    if lyrics_are_accepted(meta) or has_trusted_primary_lyrics(meta):
        return False
    text, part = best_asr_primary_text(meta)
    if not text or not part:
        return False
    source = meta.get("lyrics_source")
    if (meta.get("lyrics") or "").strip() == text.strip() and source == "asr":
        return False
    meta["lyrics"] = text
    meta["lyrics_source"] = "asr"
    meta["lyrics_asr_part"] = part
    return True


def find_sheet_file(folder: Path, meta: dict) -> Optional[Path]:
    sheet = (meta.get("parts") or {}).get("sheet") or {}
    name = sheet.get("filename")
    if name:
        path = folder / name
        if path.is_file() and path.stat().st_size > 0:
            return path
    for path in folder.iterdir():
        if not path.is_file():
            continue
        if path.suffix.lower() in SHEET_EXTENSIONS and path.stat().st_size > 0:
            # Skip leftover instructional-looking names if any
            if "guidelines" in path.name.lower():
                continue
            return path
    return None


def find_audio_part_file(folder: Path, part: str, meta: dict | None = None) -> Optional[Path]:
    """Return path to a learning-track MP3 for lead/bari/bass/tenor/mix, if present."""
    meta = meta or {}
    info = (meta.get("parts") or {}).get(part) or {}
    name = info.get("filename")
    if name:
        path = folder / name
        if path.is_file() and path.stat().st_size > 0:
            return path
    for path in sorted(folder.glob("*.mp3")):
        if not path.is_file() or path.stat().st_size <= 0:
            continue
        low = path.name.lower()
        if part == "mix":
            if "full_mix" in low or "allparts" in low or low.endswith(" - mix.mp3") or (
                "mix" in low
                and "bass" not in low
                and "bari" not in low
                and "lead" not in low
                and "tenor" not in low
            ):
                return path
        elif part in low:
            return path
    return None


def has_normalized_folder_name(folder: Path, tag_id: int) -> bool:
    return bool(re.search(rf"\s-\s{tag_id}$", folder.name))


def advertised_audio_parts(meta: dict) -> list[str] | None:
    """Audio parts the bulk export says exist.

    Returns:
      - list of part keys with download URLs when ``discovered_assets`` is present
      - empty list when metadata says the tag has no learning tracks
      - None when ``discovered_assets`` is absent (legacy / unknown — callers may probe)
    """
    if "discovered_assets" not in meta:
        return None
    assets = meta.get("discovered_assets") or {}
    out: list[str] = []
    for part in ("bass", "bari", "lead", "tenor", "mix"):
        info = assets.get(part)
        if isinstance(info, dict) and info.get("url"):
            out.append(part)
    return out


def has_audio_parts(folder: Path, meta: dict) -> bool:
    parts = meta.get("parts") or {}
    for key in ("bass", "bari", "lead", "tenor", "mix"):
        info = parts.get(key) or {}
        name = info.get("filename")
        if name and (folder / name).is_file():
            return True
    for path in folder.glob("*.mp3"):
        if path.is_file() and path.stat().st_size > 0:
            return True
    return False


def tag_looks_complete(
    folder: Path,
    meta: dict,
    *,
    require_audio: bool = False,
    require_lyrics: bool = True,
) -> bool:
    """Return True if this tag looks fully enriched and can be skipped."""
    if not meta:
        return False
    if meta.get("status") in {"not_found", "http_error"}:
        return False

    tag_id = meta.get("tag_id")
    if not isinstance(tag_id, int):
        return False
    if not meta.get("title"):
        return False
    # Must have been enriched from the site at least once
    if not meta.get("enriched_at") and meta.get("rating") is None and not meta.get("posted_by"):
        return False
    if not (folder / "metadata.json").is_file():
        return False
    if not has_normalized_folder_name(folder, tag_id):
        return False
    if find_sheet_file(folder, meta) is None:
        return False
    if require_lyrics and not has_usable_lyrics(meta):
        return False
    if require_audio:
        expected = advertised_audio_parts(meta)
        if expected is None:
            # Legacy metadata without discovered_assets — require some audio on disk
            if not has_audio_parts(folder, meta):
                return False
        elif expected:
            # Only require parts the bulk export advertised
            if any(find_audio_part_file(folder, part, meta) is None for part in expected):
                return False
        # expected == [] → sheet-only tag; audio not required
    return True
