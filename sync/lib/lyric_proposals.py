"""Load / upsert lyric correction proposals (JSONL bridge for agent → review)."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

from .complete import lyrics_are_accepted, lyrics_are_weak
from .config import STATE_DIR
from .state import ensure_state_dir, state_path

PROPOSALS_NAME = "lyric_proposals.jsonl"
PACKS_DIRNAME = "lyric_packs"
CURSOR_NAME = "lyric_proposal_cursor.json"

_WORD = re.compile(r"[a-z0-9']+", re.I)


def proposals_path() -> Path:
    ensure_state_dir()
    return state_path(PROPOSALS_NAME)


def packs_dir() -> Path:
    ensure_state_dir()
    d = STATE_DIR / PACKS_DIRNAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def load_proposals(path: Path | None = None) -> dict[int, dict]:
    """Return tag_id → proposal dict (last row wins if duplicates)."""
    path = path or proposals_path()
    out: dict[int, dict] = {}
    if not path.is_file():
        return out
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            tid = row.get("tag_id")
            if isinstance(tid, int):
                out[tid] = row
    return out


def save_proposals(proposals: dict[int, dict], path: Path | None = None) -> None:
    """Rewrite JSONL sorted by tag_id (atomic replace)."""
    path = path or proposals_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        for tid in sorted(proposals):
            row = proposals[tid]
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    tmp.replace(path)


def upsert_proposal(row: dict, path: Path | None = None) -> dict[int, dict]:
    """Insert or replace one proposal by tag_id; returns full map."""
    tid = row.get("tag_id")
    if not isinstance(tid, int):
        raise ValueError("proposal requires integer tag_id")
    proposals = load_proposals(path)
    proposals[tid] = row
    save_proposals(proposals, path)
    return proposals


def upsert_proposals(rows: Iterable[dict], path: Path | None = None) -> dict[int, dict]:
    proposals = load_proposals(path)
    for row in rows:
        tid = row.get("tag_id")
        if not isinstance(tid, int):
            continue
        proposals[tid] = row
    save_proposals(proposals, path)
    return proposals


def load_proposal_cursor() -> dict:
    from .state import load_json

    return load_json(
        state_path(CURSOR_NAME),
        default={
            "last_tag_id": 0,
            "accepted": 0,
            "rejected": 0,
            "edited": 0,
            "skipped": 0,
        },
    )


def save_proposal_cursor(state: dict) -> None:
    from .state import save_json

    save_json(state_path(CURSOR_NAME), state)


def part_lyrics_map(meta: dict) -> dict[str, str]:
    """lead/bari/bass/tenor → text (non-empty only)."""
    raw = meta.get("part_lyrics") or {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for part in ("lead", "bari", "bass", "tenor"):
        entry = raw.get(part)
        if not isinstance(entry, dict):
            continue
        text = (entry.get("text") or entry.get("raw") or "").strip()
        if text:
            out[part] = text
    return out


def format_normalize_lyrics(
    text: str | None,
    *,
    title: str | None = None,
    arranger: str | None = None,
) -> str:
    """Light formatting pass for packs / proposals (no repeat collapse)."""
    if not text or not str(text).strip():
        return ""
    from . import lyric_postprocess as lyric_pp

    s = lyric_pp.normalize_asr_lyrics(str(text))
    try:
        from extract_text import normalize_sheet_lyrics

        return normalize_sheet_lyrics(s, title=title, arranger=arranger)
    except Exception:
        return " ".join(s.split())


def _norm_words(text: str) -> list[str]:
    return _WORD.findall(text.lower())


def texts_roughly_agree(a: str, b: str, *, min_overlap: float = 0.55) -> bool:
    wa, wb = _norm_words(a), _norm_words(b)
    if not wa or not wb:
        return False
    sa, sb = set(wa), set(wb)
    overlap = len(sa & sb) / max(len(sa | sb), 1)
    return overlap >= min_overlap


def asr_looks_hallucinated(text: str) -> bool:
    if not text or not text.strip():
        return True
    words = _norm_words(text)
    if len(words) < 2:
        return True
    # Extreme repetition (bio bio bio…)
    if len(set(words)) <= 2 and len(words) >= 6:
        return True
    # Long hum / vowel spam
    if re.search(r"(.)\1{8,}", text, re.I):
        return True
    if re.fullmatch(r"[AaHh\s.!?']{8,}", text):
        return True
    # Trailing Whisper junk often ends with lone "you" / "thank you"
    if len(words) <= 4 and words[-1] in {"you", "yeah", "thank"}:
        return True
    return False


def asr_looks_held_word(text: str) -> bool:
    """True for drone / held-syllable parts (one word repeated or tiny lyric)."""
    words = _norm_words(text)
    if not words:
        return True
    uniq = set(words)
    # Single lexical item (possibly repeated): "love love love" / "doo"
    if len(uniq) <= 1:
        return True
    # Very short unique content typical of held bass/bari pads
    if len(uniq) <= 2 and len(words) <= 6:
        return True
    return False


def pick_best_asr_text(
    parts: dict[str, str],
    *,
    title: str | None = None,
    arranger: str | None = None,
) -> tuple[str, str]:
    """Choose the best part lyric for main-lyrics proposals.

    Prefer Lead, then Tenor (full lyric lines). Bari/Bass often hold one word.
    Returns (formatted_text, part_name) or ("", "").
    """
    order = ("lead", "tenor", "bari", "bass")
    part_bonus = {"lead": 1000, "tenor": 800, "bari": 100, "bass": 50}
    candidates: list[tuple[int, str, str]] = []
    for part in order:
        raw = parts.get(part) or ""
        if not raw.strip():
            continue
        fmt = format_normalize_lyrics(raw, title=title, arranger=arranger)
        if not fmt or asr_looks_hallucinated(fmt):
            continue
        words = _norm_words(fmt)
        n_words = len(words)
        n_uniq = len(set(words))
        held = asr_looks_held_word(fmt)
        score = part_bonus.get(part, 0) + n_uniq * 25 + n_words
        if held:
            score -= 500
        candidates.append((score, part, fmt))

    usable = [c for c in candidates if not asr_looks_held_word(c[2])]
    pool = usable if usable else candidates
    if not pool:
        return "", ""
    pool.sort(key=lambda t: -t[0])
    _score, part, fmt = pool[0]
    return fmt, part


def auto_propose_lyrics(
    meta: dict,
    *,
    folder_name: str = "",
) -> Optional[dict[str, Any]]:
    """Deterministic proposal using the planned agent rules. None = skip."""
    tag_id = meta.get("tag_id")
    if not isinstance(tag_id, int):
        return None
    if lyrics_are_accepted(meta):
        return None

    title = meta.get("title") if isinstance(meta.get("title"), str) else None
    arranger = meta.get("arranger") if isinstance(meta.get("arranger"), str) else None
    current = (meta.get("lyrics") or "").strip() if meta.get("lyrics") else ""
    source = meta.get("lyrics_source") or None
    parts = part_lyrics_map(meta)

    fmt_current = format_normalize_lyrics(current, title=title, arranger=arranger) if current else ""
    asr_text, asr_part = pick_best_asr_text(parts, title=title, arranger=arranger)
    asr_ok = bool(asr_text)

    suggested = ""
    reason = ""
    formatting_only = False

    ocr_weak = (not current) or lyrics_are_weak(current)

    if asr_ok and current and texts_roughly_agree(asr_text, fmt_current or current):
        # Prefer longer coherent consensus (ASR often has full repeats)
        if len(_norm_words(asr_text)) >= len(_norm_words(fmt_current or current)):
            suggested = asr_text
            reason = f"{asr_part.title()} ASR and current lyrics agree; prefer formatted {asr_part} ASR"
        else:
            suggested = fmt_current or current
            reason = f"{asr_part.title()} ASR and current lyrics agree; prefer formatted current"
    elif asr_ok and ocr_weak:
        # Main lyrics missing/junk — trust ASR (Lead if good, else best other part)
        suggested = asr_text
        reason = (
            f"{asr_part.title()} ASR preferred (current lyrics missing/weak/junk)"
        )
    elif current and not asr_ok:
        suggested = fmt_current or current
        reason = "Formatted current lyrics (ASR missing or hallucinated on all parts)"
    elif asr_ok:
        suggested = asr_text
        reason = f"{asr_part.title()} ASR only"
    else:
        return None

    suggested = " ".join(suggested.split()).strip(" ,;.-")
    if not suggested:
        return None

    # Title: never invent full lyric; light overlap already handled via format helpers
    cur_cmp = " ".join(_norm_words(current))
    sug_cmp = " ".join(_norm_words(suggested))
    if cur_cmp == sug_cmp and current.strip() == suggested:
        return None  # nothing to do
    if cur_cmp == sug_cmp:
        formatting_only = True
        reason = "Formatting cleanup only (wording unchanged)"
    elif fmt_current and sug_cmp == " ".join(_norm_words(fmt_current)) and not asr_ok:
        formatting_only = True
        reason = "Formatting cleanup of current lyrics"

    return {
        "tag_id": tag_id,
        "folder": folder_name,
        "status": "pending",
        "current_lyrics": current or None,
        "current_source": source,
        "suggested_lyrics": suggested,
        "reason": reason,
        "evidence": {
            "title": title,
            "ocr": current or None,
            "part_lyrics": parts,
            "asr_part_used": asr_part or None,
            "format_normalized": fmt_current or None,
        },
        "formatting_only": formatting_only,
        "proposed_at": datetime.now(timezone.utc).isoformat(),
    }


def pack_priority(meta: dict) -> int:
    """Lower = higher priority. 99 = skip."""
    if lyrics_are_accepted(meta):
        return 99
    if meta.get("status") in {"not_found", "http_error"}:
        return 99
    parts = part_lyrics_map(meta)
    has_parts = bool(parts)
    has_lyrics = bool((meta.get("lyrics") or "").strip()) and not lyrics_are_weak(meta.get("lyrics"))
    weak_or_empty = not has_lyrics
    if has_parts and has_lyrics:
        return 1
    if has_lyrics and not has_parts:
        return 2
    if has_parts and weak_or_empty:
        return 3
    return 99
