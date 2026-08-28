"""Programmatic lyric cleanup: chrome filter, syllable lattice, dedupe, priors."""

from __future__ import annotations

import math
import re
from collections import Counter
from pathlib import Path
from typing import Callable, Optional

# Injected from extract_text to avoid circular imports at module load
_word_rank: Callable[[str], int] | None = None
_is_known_word: Callable[[str], bool] | None = None
_is_common_word: Callable[[str], bool] | None = None
_is_broken_fragment: Callable[[str], bool] | None = None
_looks_like_chord_token: Callable[[str], bool] | None = None
_KEEP_WHOLE: frozenset[str] = frozenset()
_SHORT_OK: frozenset[str] = frozenset()
_COMMON_RANK = 4000

_LYRIC_UNIGRAMS: Counter[str] | None = None
_LYRIC_BIGRAMS: Counter[str] | None = None
_PRIOR_LOADED = False

_MEASURE_VOICE = re.compile(r"^[TBLMBr]{1,2}\d{1,2}$", re.I)
_TEMPO_MARK = re.compile(r"^J=?$|^MM$|^♩=?$", re.I)
_CREDIT_WORD = re.compile(
    r"^(?:sung|arranged|attributed|written|music|lyrics|arrangement|composer|"
    r"quartet|feature|special|copyright|behalf|organization|acting)$",
    re.I,
)
_NAME_LIKE = re.compile(r"^[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?$")


def bind_dictionary(
    *,
    word_rank: Callable[[str], int],
    is_known_word: Callable[[str], bool],
    is_common_word: Callable[[str], bool],
    is_broken_fragment: Callable[[str], bool],
    looks_like_chord_token: Callable[[str], bool],
    keep_whole: frozenset[str],
    short_ok: frozenset[str],
    common_rank: int = 4000,
) -> None:
    global _word_rank, _is_known_word, _is_common_word, _is_broken_fragment
    global _looks_like_chord_token, _KEEP_WHOLE, _SHORT_OK, _COMMON_RANK
    _word_rank = word_rank
    _is_known_word = is_known_word
    _is_common_word = is_common_word
    _is_broken_fragment = is_broken_fragment
    _looks_like_chord_token = looks_like_chord_token
    _KEEP_WHOLE = keep_whole
    _SHORT_OK = short_ok
    _COMMON_RANK = common_rank


def _rank(w: str) -> int:
    assert _word_rank is not None
    return _word_rank(w)


def _known(w: str) -> bool:
    assert _is_known_word is not None
    return _is_known_word(w)


def _common(w: str) -> bool:
    assert _is_common_word is not None
    return _is_common_word(w)


def _broken(w: str) -> bool:
    assert _is_broken_fragment is not None
    return _is_broken_fragment(w)


def ensure_lyric_prior(root: Path | None = None) -> None:
    """Build unigram/bigram counts from HTML lyrics in the local library."""
    global _LYRIC_UNIGRAMS, _LYRIC_BIGRAMS, _PRIOR_LOADED
    if _PRIOR_LOADED:
        return
    _PRIOR_LOADED = True
    uni: Counter[str] = Counter()
    bi: Counter[str] = Counter()
    try:
        from .config import ROOT_DOWNLOAD_DIR
        from .state import iter_tag_folders, load_metadata

        base = root or ROOT_DOWNLOAD_DIR
        for folder in iter_tag_folders(base):
            meta = load_metadata(folder)
            if not meta:
                continue
            if meta.get("lyrics_source") != "html":
                continue
            text = meta.get("lyrics") or ""
            words = re.findall(r"[a-z']+", text.lower())
            if len(words) < 3:
                continue
            uni.update(words)
            bi.update(zip(words, words[1:]))
    except Exception:
        pass
    _LYRIC_UNIGRAMS = uni
    _LYRIC_BIGRAMS = bi


def lyric_unigram_boost(word: str) -> float:
    ensure_lyric_prior()
    if not _LYRIC_UNIGRAMS:
        return 0.0
    c = _LYRIC_UNIGRAMS.get(word.lower(), 0)
    return math.log1p(c) if c else 0.0


def lyric_bigram_boost(a: str, b: str) -> float:
    ensure_lyric_prior()
    if not _LYRIC_BIGRAMS:
        return 0.0
    c = _LYRIC_BIGRAMS.get((a.lower(), b.lower()), 0)
    return math.log1p(c) if c else 0.0


def compound_score(word: str, *, left: str | None = None, right: str | None = None) -> float:
    """Higher is better. Negative means reject."""
    low = word.lower()
    if not low:
        return -1.0
    if low in _KEEP_WHOLE:
        return 10.0 + lyric_unigram_boost(low)
    if not _known(low):
        return -1.0
    r = _rank(low)
    if r >= 10**9:
        return -1.0
    score = 1.0 / (1.0 + r / 500.0)
    score += 0.35 * lyric_unigram_boost(low)
    if _common(low):
        score += 0.5
    if left:
        score += 0.25 * lyric_bigram_boost(left, low)
    if right:
        score += 0.25 * lyric_bigram_boost(low, right)
    return score


def is_chrome_token(tok: str) -> bool:
    """True for chords, measures, tempo marks, credit crumbs."""
    assert _looks_like_chord_token is not None
    t = tok.strip().strip(".,;:!?")
    if not t:
        return True
    if _looks_like_chord_token(t):
        return True
    if _MEASURE_VOICE.match(t):
        return True
    if _TEMPO_MARK.match(t):
        return True
    if re.fullmatch(r"arr\.?", t, re.I):
        return True
    if _CREDIT_WORD.match(t):
        return True
    if re.fullmatch(r"\d{1,3}", t):
        return True
    return False


def filter_chrome_tokens(text: str) -> str:
    """Drop non-lyric chrome tokens from a whitespace-separated string."""
    keep: list[str] = []
    tokens = text.split()
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        low = tok.lower().rstrip(".,;:")
        # Multi-token credit openers: Sung by … / Arranged by … / arr. Name
        if low in {"sung", "arranged", "attributed", "written"} and i + 1 < len(tokens):
            nxt = tokens[i + 1].lower().rstrip(".,;:")
            if nxt in {"by", "to"}:
                i += 2
                # skip following capitalized name-ish tokens
                while i < len(tokens):
                    tl = tokens[i].lower().rstrip(".,;:")
                    # Stop at clear lyric vocabulary (even capitalized)
                    if tl in {
                        "heaven", "when", "looking", "smile", "love", "heart",
                        "my", "you", "i",
                        "where", "what", "with", "from", "this", "that",
                        "long", "after", "before", "today", "tonight",
                    }:
                        break
                    # Articles / connectors inside credit names
                    if tl in {"the", "a", "an", "of", "and", "jr", "jr.", "sr", "sr.", "iii"}:
                        i += 1
                        continue
                    if (
                        _NAME_LIKE.match(tokens[i])
                        or (tokens[i][:1].isupper() and len(tokens[i]) > 1)
                        or is_chrome_token(tokens[i])
                    ):
                        i += 1
                        continue
                    break
                continue
        if low == "arr" or low.startswith("arr."):
            i += 1
            while i < len(tokens) and (
                _NAME_LIKE.match(tokens[i]) or tokens[i][:1].isupper()
            ):
                i += 1
            continue
        if is_chrome_token(tok):
            i += 1
            continue
        keep.append(tok)
        i += 1
    return " ".join(keep)


def _token_core(tok: str) -> str:
    m = re.match(r"^[^A-Za-z]*([A-Za-z]+(?:'[A-Za-z]+)?)[^A-Za-z]*$", tok)
    return m.group(1) if m else tok


def _pieces_look_like_syllables(cores: list[str]) -> bool:
    if len(cores) < 2:
        return False
    # Prefer windows of short / broken pieces
    shortish = sum(1 for c in cores if len(c) <= 4 or _broken(c))
    return shortish >= max(2, len(cores) - 1)


def _should_accept_lattice_join(
    cores: list[str],
    joined: str,
    *,
    left: str | None = None,
    right: str | None = None,
) -> bool:
    score = compound_score(joined, left=left, right=right)
    if score < 0:
        return False
    # Reject junk concatenations of two solid commons (to+be)
    if len(cores) == 2 and _common(cores[0]) and _common(cores[1]):
        if joined in _KEEP_WHOLE or _common(joined):
            return True
        return False
    # 3–4 syllable rejoins: require known compound and syllable-like pieces
    if len(cores) >= 3:
        if not _pieces_look_like_syllables(cores):
            return False
        return score >= 0.15 or joined in _KEEP_WHOLE or _rank(joined) < 20000
    # width 2: syllable-ish or broken fragment involved, or strong compound
    if _pieces_look_like_syllables(cores) or any(_broken(c) for c in cores):
        # Rare-but-real compounds (bouquet) score low on frequency alone
        if any(_broken(c) for c in cores) and _known(joined) and _rank(joined) < 80000:
            return True
        return score >= 0.1
    return joined in _KEEP_WHOLE or _common(joined)


def lattice_rejoin(text: str) -> str:
    """Greedy longest-first rejoin of OCR syllable runs (di vi ne → divine)."""
    tokens = text.split()
    if len(tokens) < 2:
        return text
    out: list[str] = []
    i = 0
    while i < len(tokens):
        best_width = 1
        best_word = tokens[i]
        left = _token_core(out[-1]).lower() if out else None
        # Capitals: don't lattice-join across lower→Upper boundaries mid-window
        for width in range(min(4, len(tokens) - i), 1, -1):
            chunk = tokens[i : i + width]
            cores = [_token_core(t) for t in chunk]
            if any(not c for c in cores):
                continue
            # Block if an interior token starts Upper and previous is lower
            blocked = False
            if cores[0] in {"I", "i"}:
                blocked = True
            else:
                for a, b in zip(cores, cores[1:]):
                    if b == "I":
                        blocked = True
                        break
                    if b[:1].isupper() and a[:1].islower():
                        blocked = True
                        break
            if blocked:
                continue
            joined = "".join(c.lower() for c in cores)
            right = None
            if i + width < len(tokens):
                right = _token_core(tokens[i + width]).lower() or None
            if not _should_accept_lattice_join(
                [c.lower() for c in cores], joined, left=left, right=right
            ):
                continue
            # Preserve leading capital if first piece was capitalized
            if cores[0][:1].isupper():
                word = joined[:1].upper() + joined[1:]
            else:
                word = joined
            # Keep trailing punct from last token
            trail = re.sub(r"^.*?([A-Za-z]+(?:'[A-Za-z]+)?)", "", chunk[-1])
            best_width = width
            best_word = word + trail
            break
        out.append(best_word)
        i += best_width
    return " ".join(out)


def sentence_case_if_all_caps(text: str) -> str:
    """If Whisper shouted the line in ALL CAPS, fold to sentence case.

    Preserves standalone ``I`` / ``I'm`` / ``I'll`` etc.
    """
    if not text or not str(text).strip():
        return text
    s = str(text)
    letters = [c for c in s if c.isalpha()]
    if len(letters) < 2:
        return s
    upper_ratio = sum(1 for c in letters if c.isupper()) / len(letters)
    if upper_ratio < 0.85:
        return s
    lower = s.lower()
    # Capitalize first alphabetic character
    chars = list(lower)
    for i, ch in enumerate(chars):
        if ch.isalpha():
            chars[i] = ch.upper()
            break
    out = "".join(chars)
    # Restore pronoun I and common contractions
    out = re.sub(r"\bi\b", "I", out)
    out = re.sub(r"\bi'(m|ll|ve|d|re)\b", lambda m: "I'" + m.group(1), out, flags=re.I)
    return out


def fold_shouted_words(text: str) -> str:
    """Lowercase isolated ALL-CAPS tokens (``SO``, ``MY``) left in mixed lines."""

    def repl(match: re.Match[str]) -> str:
        word = match.group(0)
        if word in {"I", "I'm", "I'll", "I've", "I'd", "A"}:
            return word
        if len(word) >= 2 and word.isalpha() and word.isupper():
            return word.lower()
        return word

    return re.sub(r"[A-Za-z]+(?:'[A-Za-z]+)?", repl, text)


def normalize_asr_lyrics(text: str) -> str:
    """Light post-process for Whisper: spacing + ALL-CAPS → sentence case.

    Does not collapse repeated phrases — tag lyrics often repeat hooks on purpose
    (``Give me those barbershop chords`` twice, ``lonely for you am I`` twice).
    """
    if not text or not str(text).strip():
        return ""
    s = str(text)
    s = s.replace("…", " ").replace("...", " ")
    s = re.sub(r"\s+", " ", s).strip()
    s = sentence_case_if_all_caps(s)
    s = fold_shouted_words(s)
    s = re.sub(r"\s+([,;:.!?])", r"\1", s)
    s = re.sub(r"\s+", " ", s).strip(" ,;.-")
    return s


def filter_tokens_by_geometry(
    tokens: list[dict],
    *,
    image_height: float,
    image_width: float,
    title: str | None = None,
) -> list[dict]:
    """Drop title/credit/measure chrome using bounding-box position."""
    if not tokens or image_height <= 0 or image_width <= 0:
        return tokens
    kept: list[dict] = []
    for tok in tokens:
        text = (tok.get("text") or "").strip()
        if not text:
            continue
        x = float(tok.get("x") or 0)
        y = float(tok.get("y") or 0)
        low = text.lower()
        # Top header band: titles / numbers
        if y < image_height * 0.12:
            if title and title.lower() in low:
                continue
            if re.match(r"^\d+\.", text):
                continue
            if len(text) <= 3 and text.isdigit():
                continue
        # Far-right credits
        if x > image_width * 0.80:
            if re.search(r"\d{4}", text) or "sung" in low or "arr" in low:
                continue
            if _NAME_LIKE.match(text) and y < image_height * 0.35:
                continue
        # Bottom credit strip
        if y > image_height * 0.88:
            if _NAME_LIKE.match(text) or "sung" in low or re.search(r"\d{4}", text):
                continue
        if is_chrome_token(text):
            continue
        kept.append(tok)
    return kept


def pick_lyric_bands(
    bands: list[list[dict]],
    *,
    image_height: float,
    title: str | None = None,
) -> list[list[dict]]:
    """Keep the most lyric-like Y-bands; drop header-only / credit-only bands."""
    if not bands:
        return []
    scored: list[tuple[float, list[dict]]] = []
    for band in bands:
        if not band:
            continue
        avg_y = sum(float(t["y"]) for t in band) / len(band)
        joined = " ".join(t["text"] for t in band)
        # Header skip
        if avg_y < image_height * 0.16 and len(band) <= 3:
            if title and title.lower() in joined.lower():
                continue
            if re.match(r"^\d+\.", joined):
                continue
        words = re.findall(r"[A-Za-z']+", joined)
        if not words:
            continue
        hits = sum(1 for w in words if _common(w.lower()) or w.lower() in _KEEP_WHOLE)
        lyric_ratio = hits / max(len(words), 1)
        # Prefer mid-page bands with more dictionary hits
        mid = 1.0 - abs((avg_y / image_height) - 0.45)
        score = lyric_ratio * 2.0 + mid + min(len(words), 12) / 12.0
        scored.append((score, band))
    if not scored:
        return bands
    scored.sort(key=lambda x: -x[0])
    # Keep top 1–2 bands (typical lead + optional lower staff)
    keep_n = 2 if len(scored) >= 2 and scored[1][0] >= scored[0][0] * 0.55 else 1
    chosen = [b for _, b in scored[:keep_n]]
    # Restore top-to-bottom order
    chosen.sort(key=lambda b: sum(float(t["y"]) for t in b) / len(b))
    return chosen
