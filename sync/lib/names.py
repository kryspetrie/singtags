"""Filename / folder name normalization."""

from __future__ import annotations

import re
import unicodedata
from typing import Optional

from .config import MAX_FILENAME_LEN, PART_DISPLAY

_APOSTROPHES = str.maketrans({
    "'": None,
    "\u2019": None,  # ’
    "\u2018": None,  # ‘
    "\u02bc": None,  # ʼ
    "`": None,
})

_FLAT_SHARP = str.maketrans({
    "\u266d": "b",  # ♭
    "\u266f": "#",  # ♯
    "\u266e": "",   # ♮
})


def _ascii_fold(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.translate(_APOSTROPHES)
    text = text.translate(_FLAT_SHARP)
    # Decompose and drop combining marks for remaining accented chars
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def sanitize_segment(text: Optional[str], *, allow_empty: bool = True) -> Optional[str]:
    """Normalize a path segment. Returns None if empty after cleaning.

    Intended for folder/file names only — do **not** use for catalog metadata
    fields like ``arranger`` (it strips commas that separate co-arrangers).
    """
    if text is None:
        return None
    raw = str(text).strip()
    if not raw:
        return None
    lowered = raw.lower()
    if lowered in {"unknown", "unknown arranger", "unknown key", "n/a", "na"}:
        return None

    cleaned = _ascii_fold(raw)
    # Keep letters, digits, spaces, hyphen, parentheses, hash, period (for initials)
    cleaned = re.sub(r"[^A-Za-z0-9\s\-()#.&]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .-_")
    if not cleaned:
        return None if allow_empty else "Untitled"
    return cleaned


_HTML_ENTITIES = {
    "&amp;": "&",
    "&amp": "&",
    "&quot;": '"',
    "&#39;": "'",
    "&#039;": "'",
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">",
}


def normalize_arranger(text: Optional[str]) -> Optional[str]:
    """Clean an arranger credit for metadata (preserve co-arranger separators).

    Unlike :func:`sanitize_segment`, commas / ``&`` / ``and`` are kept so we can
    split multi-arranger credits later. Strips common lyricist/composer noise
    that sometimes lands in the Arranger API field.
    """
    if text is None:
        return None
    raw = str(text).strip()
    if not raw:
        return None

    for ent, ch in _HTML_ENTITIES.items():
        raw = raw.replace(ent, ch)

    lowered = raw.lower()
    if lowered in {"unknown", "unknown arranger", "n/a", "na", "-"}:
        return None

    # Prefer an explicit "arranged by …" credit when the field is a songwriting dump.
    arranged = re.search(r"\barranged\s+by\s+(.+)$", raw, flags=re.IGNORECASE)
    if arranged and re.search(
        r"\b(words|music|lyrics)\b", raw, flags=re.IGNORECASE
    ):
        raw = arranged.group(1).strip()

    # Drop lyricist tails: "Paul Olguin, Lyrics by William Hill"
    raw = re.sub(r"\s*,?\s*lyrics\s+by\b.*$", "", raw, flags=re.IGNORECASE)
    # Drop leading songwriter boilerplate when an arranger name remains after.
    raw = re.sub(
        r"^(?:words\s+and\s+music|music|words)(?:\s+by)?\s*[:\-]?\s*",
        "",
        raw,
        flags=re.IGNORECASE,
    )
    raw = re.sub(r"^arranged\s+by\s*[:\-]?\s*", "", raw, flags=re.IGNORECASE)

    # Keep apostrophes in names (O'Connell); _ascii_fold strips them for paths.
    raw = raw.replace("'", "«APOS»").replace("\u2019", "«APOS»").replace("\u2018", "«APOS»")
    cleaned = _ascii_fold(raw).replace("«APOS»", "'")
    # Keep list separators: comma, ampersand, slash, semicolon, plus, apostrophe.
    cleaned = re.sub(r"[^A-Za-z0-9\s\-()#.&,/;+']", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\s*,\s*", ", ", cleaned)
    cleaned = re.sub(r"\s+&\s+", " & ", cleaned)
    cleaned = cleaned.strip(" -_,;/")
    if not cleaned:
        return None
    if cleaned.lower() in {"unknown", "unknown arranger", "n/a", "na"}:
        return None
    return cleaned


def split_arranger_names(text: Optional[str]) -> list[str]:
    """Split a (possibly multi-person) arranger credit into individual names."""
    cleaned = normalize_arranger(text)
    if not cleaned:
        return []
    # Protect generational suffixes so "Bobby Gray, Jr." stays one person.
    protected = re.sub(
        r",(\s*(?:jr\.|sr\.|jr|sr|ii|iii|iv|phd|md|esq))\b",
        lambda m: "«GEN»" + m.group(1),
        cleaned,
        flags=re.IGNORECASE,
    )
    parts = re.split(
        r"\s*(?:&+|/|;|\+|,\s*and\b|\band\b|\bor\b|\band/or\b)\s*|,\s*",
        protected,
        flags=re.IGNORECASE,
    )
    out: list[str] = []
    seen: set[str] = set()
    for part in parts:
        name = part.replace("«GEN»", ",").strip(" -_")
        name = re.sub(r"\s+", " ", name).strip()
        if not name:
            continue
        if re.fullmatch(r"(et\s+al\.?|anon\.?|unknown|originally)", name, flags=re.IGNORECASE):
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


def build_base_name(
    title: Optional[str],
    key: Optional[str] = None,
    arranger: Optional[str] = None,
) -> str:
    """Build `{name} ({key}) - {arranger}` omitting missing optional segments."""
    name = sanitize_segment(title, allow_empty=False) or "Untitled"
    key_seg = sanitize_segment(key)
    arr_seg = sanitize_segment(arranger)

    base = name
    if key_seg:
        base = f"{base} ({key_seg})"
    if arr_seg:
        base = f"{base} - {arr_seg}"
    return base


def build_folder_name(
    tag_id: int,
    title: Optional[str],
    key: Optional[str] = None,
    arranger: Optional[str] = None,
) -> str:
    """`{name} ({key}) - {arranger} - {tag_id}` with omitted unknowns."""
    base = build_base_name(title, key, arranger)
    folder = f"{base} - {tag_id}"
    return _truncate(folder, MAX_FILENAME_LEN)


def build_file_name(
    title: Optional[str],
    key: Optional[str],
    arranger: Optional[str],
    part: str,
    extension: str,
) -> str:
    """`{name} ({key}) - {arranger} - {Part}.{ext}`."""
    part_label = PART_DISPLAY.get(part.lower(), part.capitalize())
    base = build_base_name(title, key, arranger)
    ext = extension if extension.startswith(".") else f".{extension}"
    name = f"{base} - {part_label}{ext.lower()}"
    return _truncate_filename(name, MAX_FILENAME_LEN)


def _truncate(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def _truncate_filename(name: str, max_len: int) -> str:
    if len(name) <= max_len:
        return name
    if "." in name:
        stem, ext = name.rsplit(".", 1)
        keep = max_len - len(ext) - 2
        return stem[:keep].rstrip() + "…." + ext
    return _truncate(name, max_len)


def keyword_tokens(*parts: Optional[str]) -> list[str]:
    """Build a de-duplicated lowercase keyword list for search."""
    seen: set[str] = set()
    out: list[str] = []
    aliases = {
        "bari": ["baritone", "bari"],
        "baritone": ["bari", "baritone"],
        "mix": ["mix", "allparts", "full"],
        "allparts": ["mix", "allparts"],
        "bb": ["bb", "b flat", "bflat"],
        "eb": ["eb", "e flat", "eflat"],
    }
    for part in parts:
        if not part:
            continue
        text = _ascii_fold(str(part)).lower()
        # phrases
        phrase = re.sub(r"\s+", " ", text).strip()
        if phrase and phrase not in seen:
            seen.add(phrase)
            out.append(phrase)
        for token in re.findall(r"[a-z0-9#]+", text):
            if len(token) < 2 or token in seen:
                continue
            seen.add(token)
            out.append(token)
            for alias in aliases.get(token, []):
                if alias not in seen:
                    seen.add(alias)
                    out.append(alias)
    return out
