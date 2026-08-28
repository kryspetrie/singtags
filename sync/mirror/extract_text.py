#!/usr/bin/env python3
"""Extract searchable text from sheets; OCR lyrics + top-right/bottom arranger."""

from __future__ import annotations

import sys
from pathlib import Path

_MIRROR_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _MIRROR_DIR.parent
for _p in (_REPO_ROOT, _MIRROR_DIR):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import argparse
import re

from lib.complete import has_ocr_lyrics, lyrics_are_accepted, lyrics_are_weak
from lib.config import ROOT_DOWNLOAD_DIR, SHEET_EXTENSIONS, TESSERACT_CANDIDATES
from lib.names import keyword_tokens, sanitize_segment
from lib.state import iter_tag_folders, load_metadata, read_tag_id_from_folder, save_metadata
from lib import lyric_postprocess as lyric_pp

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None

try:
    from PIL import Image, ImageOps, ImageFilter
except ImportError:  # pragma: no cover
    Image = None
    ImageOps = None
    ImageFilter = None

try:
    import pytesseract
except ImportError:  # pragma: no cover
    pytesseract = None

try:
    import pypdfium2 as pdfium
except ImportError:  # pragma: no cover
    pdfium = None

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:  # pragma: no cover
    RapidOCR = None

try:
    import wordninja
except ImportError:  # pragma: no cover
    wordninja = None

_rapid_ocr_engine = None
_tesseract_ok: bool | None = None


def _get_rapid_ocr():
    global _rapid_ocr_engine
    if RapidOCR is None:
        return None
    if _rapid_ocr_engine is None:
        _rapid_ocr_engine = RapidOCR()
    return _rapid_ocr_engine


def _configure_tesseract_cmd() -> None:
    """Point pytesseract at a known binary (PATH or micromamba install)."""
    if pytesseract is None:
        return
    import shutil

    found = shutil.which("tesseract")
    if not found:
        for candidate in TESSERACT_CANDIDATES:
            if candidate.is_file():
                found = str(candidate)
                break
    if found:
        pytesseract.pytesseract.tesseract_cmd = found


def tesseract_available() -> bool:
    """True only when the tesseract binary is usable."""
    global _tesseract_ok
    if _tesseract_ok is not None:
        return _tesseract_ok
    if pytesseract is None:
        _tesseract_ok = False
        return False
    _configure_tesseract_cmd()
    try:
        pytesseract.get_tesseract_version()
        _tesseract_ok = True
    except Exception:
        _tesseract_ok = False
    return _tesseract_ok


def ocr_available() -> bool:
    return tesseract_available() or RapidOCR is not None


# Noise / chrome often OCR'd off sheet music headers/footers
_SKIP_LINE = re.compile(
    r"""(?ix)^(
        tag\b|key\b|bass\b|bari\b|baritone\b|lead\b|tenor\b|soprano\b|
        page\s*\d+|www\.|https?://|arranger\b|arranged\s+by\b|sung\s+by\b|
        learning\s+track|copyright|\(c\)|all\s+rights|barbershop\s+tags|
        \d{4}$|measure\b|tempo\b|moderato|allegro|andante
    )""",
)

_PART_LABEL = re.compile(
    r"(?i)\b(tenor|lead|bari(?:tone)?|bass|all\s*parts?|mix)\b"
)


def pdf_text(path: Path) -> str:
    if PdfReader is None:
        return ""
    try:
        reader = PdfReader(str(path))
        chunks = []
        for page in reader.pages:
            chunks.append(page.extract_text() or "")
        return "\n".join(chunks).strip()
    except Exception as exc:
        print(f"   PDF text fail {path.name}: {exc}")
        return ""


def ocr_tokens(img: "Image.Image") -> list[dict]:
    """Return OCR tokens with bounding-box centers for spatial reading order.

    Tries RapidOCR first (pip). If it returns nothing or errors, falls back to
    Tesseract when the binary is available.
    """
    tokens: list[dict] = []

    engine = _get_rapid_ocr()
    if engine is not None:
        try:
            import numpy as np

            # RapidOCR expects RGB / BGR arrays, not grayscale mode quirks
            rgb = img.convert("RGB") if hasattr(img, "convert") else img
            result, _ = engine(np.array(rgb))
            for item in result or []:
                if not item or len(item) < 2:
                    continue
                box, text = item[0], item[1]
                if not text or not str(text).strip():
                    continue
                xs = [float(p[0]) for p in box]
                ys = [float(p[1]) for p in box]
                tokens.append(
                    {
                        "text": str(text).strip(),
                        "x": sum(xs) / len(xs),
                        "y": sum(ys) / len(ys),
                        "x0": min(xs),
                        "x1": max(xs),
                        "y0": min(ys),
                        "y1": max(ys),
                    }
                )
            if tokens:
                return tokens
            # Empty RapidOCR result — fall through to Tesseract
        except Exception as exc:
            print(f"   OCR tokens fail (RapidOCR): {exc}")

    if not tesseract_available():
        return tokens

    try:
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        n = len(data.get("text") or [])
        for i in range(n):
            text = (data["text"][i] or "").strip()
            if not text:
                continue
            try:
                conf = float(data["conf"][i])
            except Exception:
                conf = 0
            if conf < 0:
                continue
            x, y, w, h = (
                int(data["left"][i]),
                int(data["top"][i]),
                int(data["width"][i]),
                int(data["height"][i]),
            )
            tokens.append(
                {
                    "text": text,
                    "x": x + w / 2,
                    "y": y + h / 2,
                    "x0": x,
                    "x1": x + w,
                    "y0": y,
                    "y1": y + h,
                }
            )
    except Exception as exc:
        print(f"   OCR tokens fail (tesseract): {exc}")
    return tokens


def ocr_image(img: "Image.Image", *, config: str = "") -> str:
    """OCR plain text (legacy helpers). Prefer ocr_tokens for lyrics."""
    tokens = ocr_tokens(img)
    if tokens:
        tokens_sorted = sorted(tokens, key=lambda t: (round(t["y"] / 20), t["x"]))
        return "\n".join(t["text"] for t in tokens_sorted)

    if tesseract_available():
        try:
            return pytesseract.image_to_string(img, config=config) or ""
        except Exception as exc:
            print(f"   OCR fail (tesseract): {exc}")
    return ""


def preprocess_for_ocr(img: "Image.Image") -> "Image.Image":
    """Upscale + contrast to help Tesseract on small GIFs/JPGs."""
    if Image is None:
        return img
    gray = img.convert("L")
    # Upscale small sheets (common for tags)
    w, h = gray.size
    scale = 1
    if max(w, h) < 1200:
        scale = 3
    elif max(w, h) < 1800:
        scale = 2
    if scale > 1:
        gray = gray.resize((w * scale, h * scale), Image.Resampling.LANCZOS)
    if ImageOps is not None:
        gray = ImageOps.autocontrast(gray)
    if ImageFilter is not None:
        gray = gray.filter(ImageFilter.SHARPEN)
    return gray


def load_sheet_image(path: Path):
    if Image is None:
        return None
    suffix = path.suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".tif", ".tiff", ".bmp", ".webp"}:
        try:
            return Image.open(path).convert("RGB")
        except Exception:
            return None
    if suffix == ".pdf":
        return render_pdf_page(path, page_index=0)
    return None


def render_pdf_page(path: Path, page_index: int = 0, scale: float = 2.0):
    """Rasterize a PDF page via pypdfium2 for OCR."""
    if pdfium is None or Image is None:
        return None
    try:
        doc = pdfium.PdfDocument(str(path))
        if page_index >= len(doc):
            return None
        page = doc[page_index]
        bitmap = page.render(scale=scale)
        pil = bitmap.to_pil()
        return pil.convert("RGB")
    except Exception as exc:
        print(f"   PDF raster fail {path.name}: {exc}")
        return None


def extract_arranger_from_regions(img: "Image.Image") -> str | None:
    """OCR top-right and bottom-right for arranger credit."""
    w, h = img.size
    regions = [
        (int(w * 0.50), 0, w, max(int(h * 0.22), 40)),  # top-right
        (int(w * 0.45), int(h * 0.72), w, h),  # bottom-right (common on tags)
    ]
    for left, top, right, bottom in regions:
        crop = img.crop((left, top, right, bottom))
        crop = preprocess_for_ocr(crop)
        text = ocr_image(crop)
        guessed = _parse_arranger_text(text)
        if guessed:
            return guessed
    return None


def _parse_arranger_text(text: str) -> str | None:
    if not text.strip():
        return None
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    name_like = re.compile(r"^[A-Z][A-Za-z.\-']+(?:\s+[A-Z][A-Za-z.\-']+){0,4}$")

    for line in lines:
        if _SKIP_LINE.search(line):
            continue
        line2 = re.sub(
            r"^(arranger|arranged by|arr\.|by)\s*[:\-]?\s*",
            "",
            line,
            flags=re.IGNORECASE,
        )
        # Drop trailing year
        line2 = re.sub(r",?\s*\d{4}\s*$", "", line2).strip(" ,.-")
        cleaned = sanitize_segment(line2)
        if not cleaned:
            continue
        if 2 <= len(cleaned) <= 60 and name_like.match(cleaned):
            return cleaned
        words = cleaned.split()
        if 1 <= len(words) <= 5 and cleaned[0].isalpha():
            return cleaned
    return None


_CREDIT_LINE = re.compile(
    r"""(?ix)^(
        .*?\b(arranged\s+by|arranger|sung\s+by|new\s+tradition)\b.*|
        ^[A-Z][a-z]+(?:[\s,]+[A-Z][a-z.]+){1,3},?\s*(Jr\.?|Sr\.?|III)?\s*,?\s*\d{4}\s*$|
        .*?,?\s*\d{4}\s*$
    )"""
)

# Jazz / barbershop chord symbols OCR'd off the sheet (FM79, CM7, B7sus4, Egus4…)
# Require a real quality (digit and/or maj/min/sus/…) — bare "Am"/"Em"/"im" are NOT chords here
# because those collide with lyric particles ("sing em", "There im our").
_CHORD_TOKEN = re.compile(
    r"""(?ix)^
    [A-G](?:\#|b|♯|♭)?
    (?:
        maj7?|maj|min|dim|aug|
        (?:g?us|sus)\d*|
        add\d*|
        m\d+|M\d+|
        \d+
    )+
    (?:
        maj\d*|m\d+|M\d*|
        (?:g?us|sus)\d*|
        add\d*|
        \#|b|♯|♭|
        \d+
    )*
    (?:/[A-G0-9]+)?
    (?:,\d+)*
    $
"""
)
_LYRIC_PARTICLES = frozenset(
    {"em", "im", "am", "ya", "ye", "yo", "ah", "oh", "um", "uh", "mm", "hm"}
)


def _looks_like_chord_token(text: str) -> bool:
    """True for notation tokens like CM7, B7sus4, FM79,11,13, Egus4."""
    t = text.strip().strip(".,;:!?")
    if not t:
        return False
    if t.lower() in _LYRIC_PARTICLES:
        return False
    if _CHORD_TOKEN.match(t):
        return True
    # Multi-chord blob: "CM7 B7sus4" or "FM79,11,13 E79"
    parts = [p.strip(",") for p in re.split(r"[\s/]+", t) if p.strip(",")]
    if len(parts) >= 2 and all(
        _CHORD_TOKEN.match(p) or re.fullmatch(r"[A-G](?:\#|b)?", p) for p in parts
    ):
        return True
    return False


def _clean_lyric_fragment(text: str, *, title: str | None = None) -> str | None:
    ln = re.sub(r"\s+", " ", text).strip()
    ln = re.sub(r"_{2,}", " ", ln)
    ln = re.sub(r"[\u3000-\u9fff\uff00-\uffef]", "", ln)
    ln = ln.strip(" -_")
    if not ln:
        return None
    if re.fullmatch(r"[^\w\s',.!?;:\-]+", ln):
        return None
    if _looks_like_chord_token(ln):
        return None
    # Bare measure / page numbers
    if re.fullmatch(r"\d{1,3}", ln):
        return None
    if title and re.match(rf"^\d+\.?\s*{re.escape(title)}\s*$", ln, re.IGNORECASE):
        return None
    if _SKIP_LINE.search(ln):
        return None
    if _CREDIT_LINE.match(ln):
        return None
    if _PART_LABEL.fullmatch(ln.strip()):
        return None
    if re.fullmatch(r"[\d\W_]+", ln):
        return None
    if sum(ch.isalpha() for ch in ln) < 1:
        return None
    if len(ln) > 120:
        return None
    ln = re.sub(
        r",?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3},?\s*(Jr\.?|Sr\.?)?\s*,?\s*\d{4}\s*$",
        "",
        ln,
    )
    ln = re.sub(r",?\s*\d{4}\s*$", "", ln).strip(" ,;.")
    if not ln or _CREDIT_LINE.match(ln) or _looks_like_chord_token(ln):
        return None
    return ln


def _strip_arranger_from_lyrics(text: str, arranger: str | None) -> str:
    """Remove a known arranger credit that leaked into OCR lyrics."""
    if not text or not arranger or not str(arranger).strip():
        return text
    name = str(arranger).strip()
    variants = {name}
    variants.add(re.sub(r",?\s*(Jr\.?|Sr\.?|III)\s*$", "", name, flags=re.I).strip())
    parts = re.findall(r"[A-Za-z']+", name)
    if len(parts) >= 2:
        variants.add(f"{parts[0]} {parts[-1]}")
        variants.add(" ".join(parts))
    s = text
    for var in sorted(variants, key=len, reverse=True):
        if len(var) < 4:
            continue
        s = re.sub(rf"\b{re.escape(var)}\b", " ", s, flags=re.IGNORECASE)
    # OCR often splits the surname: "Bill Die ke ma" for "Bill Diekema"
    if len(parts) >= 2:
        compact_name = "".join(parts).lower()
        tokens = s.split()
        out: list[str] = []
        i = 0
        while i < len(tokens):
            matched = False
            # Windows of 2..6 tokens whose letters equal the arranger compact form
            for width in range(min(6, len(tokens) - i), 1, -1):
                chunk = tokens[i : i + width]
                letters = "".join(re.findall(r"[A-Za-z]+", " ".join(chunk))).lower()
                if letters == compact_name or letters == "".join(parts[1:]).lower():
                    # Drop this credit chunk
                    i += width
                    matched = True
                    break
            if not matched:
                out.append(tokens[i])
                i += 1
        s = " ".join(out)
    s = re.sub(r"\b(?:Jr\.?|Sr\.?|III)\b,?\s*", " ", s, flags=re.IGNORECASE)
    s = re.sub(r",?\s*\d{4}\b", " ", s)
    return re.sub(r"\s+", " ", s).strip(" ,;.-")


def _strip_title_prefix(text: str, title: str | None) -> str:
    if not text or not title:
        return text
    original = text
    # "7. I'll Be Seeing You looking at…" → drop the titled header
    s = re.sub(
        rf"^\d+\.?\s*{re.escape(title)}\b[\s:\-]*",
        "",
        text,
        flags=re.IGNORECASE,
    )
    # Title glued without number
    s = re.sub(
        rf"^{re.escape(title)}\b[\s:\-]*",
        "",
        s,
        flags=re.IGNORECASE,
    )
    s = s.strip(" ,;.-")
    # Never wipe lyrics that are only the title (common for short tags)
    if not s and original.strip():
        return original.strip(" ,;.-")
    return s


def _apply_lyric_contractions(text: str) -> str:
    """Easy OCR contraction / colloquial lyric fixes."""
    s = text
    # "im our" is almost always OCR of "in our" (I'm our is nonsense)
    s = re.sub(r"\bim\s+our\b", "in our", s, flags=re.IGNORECASE)
    # therein our → there in our (sheet lyric, not archaic "therein")
    s = re.sub(r"\btherein\s+our\b", "there in our", s, flags=re.IGNORECASE)
    # Spaced syllable leftovers common on ALL CAPS sheets
    for pat, repl in (
        (r"\ban\s+y\s+more\b", "anymore"),
        (r"\ba\s+lone\b", "alone"),
        (r"\ball\s+ways\b", "always"),
        (r"\bcon\s+science\b", "conscience"),
        (r"\bdi\s+vine\b", "divine"),
        (r"\bdi\s+vi\s+ne\b", "divine"),
        (r"\ban\s+gel\b", "angel"),
        (r"\bapp\s+le\b", "apple"),
        (r"\bev\s*[·\-]?\s*ry\b", "every"),
    ):
        s = re.sub(pat, repl, s, flags=re.IGNORECASE)
    fixes = (
        (r"\bI'llbe\b", "I'll be"),
        (r"\bI' ll\b", "I'll"),
        (r"\bdont\b", "don't"),
        (r"\bwont\b", "won't"),
        (r"\bcant\b", "can't"),
        (r"\bim\b", "I'm"),
        (r"\bIm\b", "I'm"),
        (r"\bIM\b", "I'm"),
        (r"\bi m\b", "I'm"),
        (r"\bloveto\b", "love to"),
        (r"\bIlove\b", "I love"),
    )
    for pat, repl in fixes:
        s = re.sub(pat, repl, s, flags=re.IGNORECASE)
    s = _fix_em_clitics(s)
    return s


# Bare "em" attaches to the previous word (sing em → sing'em), not the next (em I).
_EM_NO_ATTACH = frozenset(
    {
        "the", "a", "an", "to", "for", "and", "or", "of", "in", "on", "at", "by",
        "my", "your", "his", "her", "our", "their", "from", "with", "as", "if",
        "but", "so", "than", "then", "that", "this", "these", "those", "be", "is",
        "am", "are", "was", "were", "i", "you", "he", "she", "we", "they", "it",
    }
)


def _split_capital_boundaries(text: str) -> str:
    """Split OCR jams at case changes: emI → em I, ILove → I Love."""
    s = text
    # ILove / MacHuff-style: uppercase run then Capitalized word
    s = re.sub(r"([A-Z])([A-Z][a-z])", r"\1 \2", s)
    # emI / toSing: lowercase then Uppercase
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", s)
    return s


def _fix_em_clitics(text: str) -> str:
    """Attach lyric clitic em/'em to the previous word; never leave emI jams."""
    s = text
    # emI / emYou (if any survived): break before capital
    s = re.sub(r"\bem([A-Z])", r"em \1", s)
    s = re.sub(r"'em([A-Z])", r"'em \1", s)

    def _attach(m: re.Match[str]) -> str:
        host = m.group(1)
        if host.lower() in _EM_NO_ATTACH:
            return m.group(0)
        return f"{host}'em"

    # ring em / sing 'em / love em → ring'em / sing'em
    s = re.sub(r"\b([A-Za-z]+)\s+'em\b", _attach, s, flags=re.IGNORECASE)
    s = re.sub(r"\b([A-Za-z]+)\s+em\b", _attach, s, flags=re.IGNORECASE)
    return s


# Compounds / lyric forms that wordninja may over-split
_KEEP_WHOLE_WORDS = frozenset(
    {
        "someone",
        "somebody",
        "somehow",
        "somewhere",
        "something",
        "anyone",
        "anybody",
        "anything",
        "anywhere",
        "everyone",
        "everybody",
        "everything",
        "everywhere",
        "barbershop",
        "goodnight",
        "goodbye",
        "goodmorning",
        "without",
        "within",
        "into",
        "onto",
        "cannot",
        "gonna",
        "wanna",
        "gotta",
        "kinda",
        "ain't",
        "y'all",
        "yall",
        "forever",
        "today",
        "tonight",
        "tomorrow",
        "myself",
        "yourself",
        "himself",
        "herself",
        "itself",
        "ourselves",
        "themselves",
        "worthwhile",
        "heartache",
        "heartbreak",
        "lullaby",
        "melody",
        "harmony",
        "memories",
        "memory",
        "friendship",
        "fashioned",
        "conscience",
        "routine",
        "divine",
        "angel",
        "mother",
        "away",
        "again",
        "anymore",
        "alone",
    }
)
_GERUND_IN = re.compile(r"^[A-Za-z]{2,}in'?$", re.IGNORECASE)
_TOKEN_CORE = re.compile(
    r"^([^A-Za-z]*)([A-Za-z]+(?:'[A-Za-z]+)?)([^A-Za-z]*)$"
)
# Legitimate short / lyric tokens — never treat as "broken" fragments
_SHORT_OK = frozenset(
    {
        "a", "i", "o", "an", "as", "at", "ax", "be", "by", "do", "go", "he", "if", "in",
        "is", "it", "me", "my", "no", "of", "oh", "ok", "on", "or", "ox", "so", "to",
        "up", "us", "we", "ya", "ye", "yo", "am", "pm", "mr", "ms", "dr", "la", "da",
        "ba", "mi", "fa", "ti", "re", "ah", "eh", "ha", "ho", "uh", "um", "em", "im",
        "ma", "pa", "de", "el", "le", "un", "al", "ed", "en", "er", "es", "ly",
    }
)
_SUFFIX_FRAGMENTS = frozenset(
    {
        "ing", "er", "ers", "ed", "en", "es", "est", "ly", "ies", "ied",
        "tion", "sion", "ness", "ment", "able", "ible", "ful", "ous", "less",
        "ship", "ward", "wise", "ive", "ize", "ise", "al", "ial", "ous",
    }
)
_WORD_RANK: dict[str, int] | None = None
_COMMON_RANK = 4000  # wordninja list is frequency-ordered; below this ≈ common
_DICT_BOUND = False


def _bind_lyric_postprocess() -> None:
    global _DICT_BOUND
    if _DICT_BOUND:
        return
    _load_word_ranks()
    lyric_pp.bind_dictionary(
        word_rank=_word_rank,
        is_known_word=_is_known_word,
        is_common_word=_is_common_word,
        is_broken_fragment=_is_broken_fragment,
        looks_like_chord_token=_looks_like_chord_token,
        keep_whole=_KEEP_WHOLE_WORDS,
        short_ok=_SHORT_OK,
        common_rank=_COMMON_RANK,
    )
    lyric_pp.ensure_lyric_prior(ROOT_DOWNLOAD_DIR)
    _DICT_BOUND = True


def _load_word_ranks() -> dict[str, int]:
    """Lazy-load wordninja's frequency-ordered lexicon (rank 0 = most common)."""
    global _WORD_RANK
    if _WORD_RANK is not None:
        return _WORD_RANK
    ranks: dict[str, int] = {}
    if wordninja is not None:
        try:
            import gzip

            path = Path(wordninja.__file__).resolve().parent / "wordninja_words.txt.gz"
            if not path.is_file():
                path = Path(wordninja.__file__).resolve().parent / "wordninja" / "wordninja_words.txt.gz"
            if path.is_file():
                with gzip.open(path, "rt", encoding="utf-8") as fh:
                    for i, line in enumerate(fh):
                        w = line.strip().lower()
                        if w and w not in ranks:
                            ranks[w] = i
        except Exception:
            ranks = {}
    # Ensure keep-whole compounds are treated as known
    for w in _KEEP_WHOLE_WORDS:
        ranks.setdefault(w, 0)
    _WORD_RANK = ranks
    return ranks


def _word_rank(word: str) -> int:
    ranks = _load_word_ranks()
    low = word.lower().rstrip("'")
    if low in _KEEP_WHOLE_WORDS:
        return 0
    return ranks.get(low, 10**9)


def _is_known_word(word: str) -> bool:
    low = word.lower().rstrip("'")
    if not low:
        return False
    if low in _SHORT_OK or low in _KEEP_WHOLE_WORDS:
        return True
    return _word_rank(low) < 10**9


def _is_common_word(word: str) -> bool:
    low = word.lower().rstrip("'")
    if low in _SHORT_OK:
        return True
    return _word_rank(low) < _COMMON_RANK


def _is_broken_fragment(word: str) -> bool:
    """True when a token looks like an OCR-split syllable, not a real word."""
    low = word.lower().rstrip("'")
    if not low or low in _SHORT_OK or low in _KEEP_WHOLE_WORDS:
        return False
    if low in _SUFFIX_FRAGMENTS:
        return True
    if len(low) <= 3 and not _is_common_word(low):
        return True
    # In lexicon but rare, and very short-ish
    if len(low) <= 4 and _word_rank(low) >= _COMMON_RANK:
        return True
    return not _is_known_word(low)


def _split_possessive(core: str) -> tuple[str, str]:
    """Return (stem, possessive_suffix) for nobody's-style tokens."""
    if len(core) >= 3 and core[-2:].lower() == "'s":
        return core[:-2], core[-2:]
    if core.endswith("'"):
        return core[:-1], "'"
    return core, ""


def _should_merge_pair(a_core: str, b_core: str) -> bool:
    """Glue syllable fragments when the compound is a real word.

    Do NOT jam two already-valid common words together (to+be, at+the) just
    because the concatenation appears in the lexicon — that undoes OCR splits.
    Still allow stem+suffix (flow+er, long+ing) and broken fragments (af+ter).
    """
    if not a_core or not b_core:
        return False
    a_stem, a_poss = _split_possessive(a_core)
    b_stem, b_poss = _split_possessive(b_core)
    if a_poss or (b_poss and b_stem == ""):
        return False
    if not a_stem or not b_stem:
        return False
    # Never glue "I" onto the next word (I + ran → Iran).
    if a_stem.lower() == "i":
        return False
    # Capitalization boundary: "em" + "I" must not become "emi"
    if b_stem == "I" or (
        len(b_stem) > 0
        and b_stem[0].isupper()
        and a_stem[0].islower()
        and not a_stem.isupper()
    ):
        return False
    # Clitic "em" attaches leftward as 'em — never merge it forward
    if a_stem.lower() in {"em", "'em"} or b_stem.lower() in {"em", "'em"}:
        return False
    ca, cb = a_stem.lower(), b_stem.lower()
    combined = ca + cb
    if combined in _KEEP_WHOLE_WORDS:
        return True
    if not _is_known_word(combined):
        # you + ur → your (OCR dropped the middle letter)
        if _is_broken_fragment(cb) and len(cb) <= 3:
            for cand in {ca + cb[1:], ca + cb[:-1]}:
                if cand and _is_known_word(cand) and _word_rank(cand) < _COMMON_RANK:
                    return True
        # suu + shine → sunshine (doubled/missing letter on rare stem)
        if _is_broken_fragment(ca) and (_is_common_word(cb) or _is_known_word(cb)):
            if _merge_join_core(a_stem, b_stem) != combined:
                return True
        return False
    cr = _word_rank(combined)
    ra, rb = _word_rank(ca), _word_rank(cb)
    # Two solid common words → only glue if the compound is ALSO a solid
    # common word (a+way→away, to+day→today). Do NOT glue lexicon junk
    # concatenations (to+be→tobe, at+the→atthe).
    if _is_common_word(ca) and _is_common_word(cb):
        if cb in _SUFFIX_FRAGMENTS:
            return True  # flow+er, long+ing, wait+ed
        if combined in _KEEP_WHOLE_WORDS:
            return True
        if _is_common_word(combined):
            return True
        return False
    # Broken / rare fragment + neighbor forming a better word: af+ter
    if _is_broken_fragment(ca) or _is_broken_fragment(cb):
        if cr < max(ra, rb) or cr < _COMMON_RANK:
            return True
    # Suffix-like second half onto a non-common stem
    if cb in _SUFFIX_FRAGMENTS:
        return True
    # Combined much more frequent than either piece
    if cr * 5 < min(ra, rb):
        return True
    return False


def _merge_join_core(a_stem: str, b_stem: str) -> str:
    """Return the glued spelling (handles you+ur → your, suu+shine → sunshine)."""
    ca, cb = a_stem.lower(), b_stem.lower()
    combined = ca + cb
    if _is_known_word(combined):
        return combined
    if _is_broken_fragment(cb) and len(cb) <= 3:
        for cand in (ca + cb[1:], ca + cb[:-1]):
            if cand and _is_known_word(cand) and _word_rank(cand) < 30000:
                return cand
    # OCR doubled/missing letter on a rare first half: suu+shine → sunshine
    if _is_broken_fragment(ca) and (_is_common_word(cb) or _is_known_word(cb)):
        collapsed = re.sub(r"(.)\1+", r"\1", ca)
        for v in {ca, collapsed, collapsed + "n", ca[:-1] + "n" if len(ca) > 1 else ca}:
            cand = v + cb
            if _is_known_word(cand) and _word_rank(cand) < 30000:
                return cand
    return combined


def _should_merge_triple(a_core: str, b_core: str, c_core: str) -> bool:
    """Join three OCR syllables when the full word is known (mem + o + ries)."""
    if not a_core or not b_core or not c_core:
        return False
    a_stem, a_poss = _split_possessive(a_core)
    b_stem, b_poss = _split_possessive(b_core)
    c_stem, c_poss = _split_possessive(c_core)
    if a_poss or b_poss:
        return False
    if not a_stem or not b_stem or not c_stem:
        return False
    ca, cb, cc = a_stem.lower(), b_stem.lower(), c_stem.lower()
    # Avoid eating real short words unless middle is a tiny bridge letter/syllable
    if _is_common_word(ca) and _is_common_word(cc) and len(cb) > 2:
        return False
    combined = ca + cb + cc
    if not _is_known_word(combined):
        return False
    cr = _word_rank(combined)
    # Prefer when ends look fragmented and combined is clearly better
    if not (_is_broken_fragment(ca) or _is_broken_fragment(cc) or len(cb) <= 2):
        return False
    if cr < min(_word_rank(ca), _word_rank(cc)):
        return True
    if cr < _COMMON_RANK and (_is_broken_fragment(ca) or _is_broken_fragment(cc)):
        return True
    if combined in _KEEP_WHOLE_WORDS:
        return True
    return False


def _join_token_pair(tok_a: str, tok_b: str) -> str:
    ma, mb = _TOKEN_CORE.match(tok_a), _TOKEN_CORE.match(tok_b)
    if not ma or not mb:
        return tok_a + tok_b
    pre_a, a_raw, post_a = ma.group(1), ma.group(2), ma.group(3)
    pre_b, b_raw, post_b = mb.group(1), mb.group(2), mb.group(3)
    a, a_poss = _split_possessive(a_raw)
    b, b_poss = _split_possessive(b_raw)
    mid_punct = "".join(ch for ch in (post_a + pre_b) if ch not in "-–—_")
    core = _merge_join_core(a, b)
    # Preserve capitalization from the left stem when sensible
    if a.isupper() and b.isupper():
        core = core.upper()
    elif a and a[0].isupper():
        core = core[0].upper() + core[1:] if len(core) > 1 else core.upper()
    poss = b_poss or a_poss
    return pre_a + core + poss + mid_punct + post_b


def _join_token_triple(tok_a: str, tok_b: str, tok_c: str) -> str:
    return _join_token_pair(_join_token_pair(tok_a, tok_b), tok_c)


def _merge_broken_words(text: str) -> str:
    """Rejoin OCR-split words when fragments form a dictionary word (af ter → after)."""
    if not text or not text.strip():
        return text
    _load_word_ranks()
    s = text
    for _ in range(6):
        tokens = s.split()
        if len(tokens) < 2:
            return s
        out: list[str] = []
        i = 0
        changed = False
        while i < len(tokens):
            if i + 2 < len(tokens):
                ma = _TOKEN_CORE.match(tokens[i])
                mb = _TOKEN_CORE.match(tokens[i + 1])
                mc = _TOKEN_CORE.match(tokens[i + 2])
                if (
                    ma
                    and mb
                    and mc
                    and _should_merge_triple(ma.group(2), mb.group(2), mc.group(2))
                ):
                    out.append(_join_token_triple(tokens[i], tokens[i + 1], tokens[i + 2]))
                    i += 3
                    changed = True
                    continue
            if i + 1 < len(tokens):
                ma, mb = _TOKEN_CORE.match(tokens[i]), _TOKEN_CORE.match(tokens[i + 1])
                if ma and mb and _should_merge_pair(ma.group(2), mb.group(2)):
                    out.append(_join_token_pair(tokens[i], tokens[i + 1]))
                    i += 2
                    changed = True
                    continue
            out.append(tokens[i])
            i += 1
        s = " ".join(out)
        if not changed:
            break
    return s


def _best_common_bipartition(word: str) -> list[str] | None:
    """If an uncommon token is clearly two common words glued, split it.

    Examples: atthe→at the, tobe→to be, forme→for me, Isee→I see.
    Skips already-common / keep-whole words so we don't destroy
    friendship, fashioned, away, etc.
    """
    low = word.lower()
    if len(low) < 4:
        return None
    if low in _KEEP_WHOLE_WORDS or _is_common_word(low):
        return None
    # Don't carve a real dictionary word into stem+suffix (fashioned→fashion+ed)
    if _is_known_word(low) and _word_rank(low) < 25000:
        if low.endswith(
            ("ed", "ing", "ly", "er", "ers", "est", "ion", "ship", "ment", "ness")
        ):
            return None
    best: tuple[str, str] | None = None
    best_score: int | None = None
    for i in range(1, len(low)):
        a, b = low[:i], low[i:]
        if not a or not b:
            continue
        if len(a) == 1 and a not in {"i", "a", "o"}:
            continue
        if len(b) == 1 and b not in {"i", "a", "o"}:
            continue
        if not (_is_common_word(a) and _is_common_word(b)):
            continue
        score = _word_rank(a) + _word_rank(b)
        if best_score is None or score < best_score:
            best_score = score
            best = (a, b)
    if not best:
        return None
    return [best[0], best[1]]


_CONTRACTION_PREFIXES = (
    "I'm",
    "I'll",
    "I've",
    "I'd",
    "you're",
    "you've",
    "you'd",
    "you'll",
    "he's",
    "she's",
    "it's",
    "we're",
    "they're",
    "don't",
    "won't",
    "can't",
    "isn't",
    "aren't",
    "wasn't",
    "weren't",
)


def _maybe_split_glued_token(token: str) -> str:
    """Split OCR-glued words via English word frequencies (wordninja).

    Conservative: skip known compounds, contractions, short tokens, and
    -in'/gerund lyric forms (goin, lovin) that would become \"go in\".
    Peels a trailing ``'em`` clitic so ``tosing'em`` → ``to sing'em``.
    Also peels leading ``I'm``/``I'll`` so ``I'min`` → ``I'm in``.
    """
    if wordninja is None or not token:
        return token
    m = _TOKEN_CORE.match(token)
    if not m:
        return token
    pre, core, post = m.group(1), m.group(2), m.group(3)

    # I'min / I'llbe → I'm in / I'll be
    for prefix in _CONTRACTION_PREFIXES:
        if len(core) > len(prefix) and core.lower().startswith(prefix.lower()):
            rest = core[len(prefix) :]
            if not rest:
                break
            # Keep original contraction casing from the matched prefix span
            left = core[: len(prefix)]
            right = _maybe_split_glued_token(rest)
            return pre + left + " " + right + post

    em_suffix = ""
    if len(core) > 4 and core.lower().endswith("'em"):
        em_suffix = core[-3:]
        core = core[:-3]
    elif "'" in core:
        return token
    if len(core) < 4:
        if em_suffix:
            return pre + core + em_suffix + post
        return token
    low = core.lower()
    if low in _KEEP_WHOLE_WORDS:
        return pre + core + em_suffix + post
    # Don't dismantle already-common lexicon words (hearts→he arts, etc.)
    if _is_common_word(low) or (_is_known_word(low) and _word_rank(low) < 15000):
        if em_suffix:
            return pre + core + em_suffix + post
        return pre + core + post
    if _GERUND_IN.match(core):
        return pre + core + em_suffix + post

    parts = wordninja.split(core)
    # Prefer a bipartition into common words when wordninja keeps OCR junk whole
    # (forme) or when the glued form is short (tobe).
    bipart = _best_common_bipartition(core)
    if bipart and (len(parts) <= 1 or not all(_is_common_word(p) for p in parts)):
        parts = bipart
    elif len(parts) <= 1 and bipart:
        parts = bipart

    if len(parts) <= 1:
        return pre + core + em_suffix + post
    # Reject noisy splits (single letters that aren't a/i/o, or too many)
    if any(len(p) == 1 and p.lower() not in {"i", "a", "o"} for p in parts):
        return pre + core + em_suffix + post
    if sum(1 for p in parts if len(p) <= 1) > 1:
        return pre + core + em_suffix + post
    if any(len(p) == 0 for p in parts):
        return pre + core + em_suffix + post
    if not any(len(p) >= 2 for p in parts):
        return pre + core + em_suffix + post
    # If every piece is a common word, always accept (atthe→at the)
    # even when the glued form itself is in the lexicon.
    if not all(_is_common_word(p) for p in parts):
        # Otherwise keep existing conservatism for exotic splits
        if low in _KEEP_WHOLE_WORDS:
            return pre + core + em_suffix + post

    out_parts = list(parts)
    if core.isupper():
        out_parts = [p.upper() for p in out_parts]
    elif core[0].isupper():
        out_parts[0] = out_parts[0].capitalize()
        # Isee → I see (preserve single-letter I)
        if out_parts[0].lower() == "i":
            out_parts[0] = "I"
    if em_suffix:
        out_parts[-1] = out_parts[-1] + em_suffix
    return pre + " ".join(out_parts) + post


def _split_unknown_words(text: str) -> str:
    """Run dictionary segmentation on whitespace-separated tokens."""
    if not text or wordninja is None:
        return text
    return " ".join(_maybe_split_glued_token(tok) for tok in text.split())


def _strip_attribution_phrases(text: str) -> str:
    """Remove 'Attributed to …' / 'Sung by …' credit crumbs from lyric text."""
    s = text
    # Stop before ordinary lyric vocabulary when possible
    stop = (
        r"heaven|when|where|what|with|looking|smile|love|heart|long|"
        r"my|the|a|an|i|you|we|she|he|they|it|and|but|for|from|this|that"
    )
    s = re.sub(
        rf"\bAttributed\s+to\b[\w\s.'\-]{{0,60}}?(?=\b(?:{stop})\b|$)",
        " ",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(
        rf"\b(?:Sung|Arranged)\s+by\b[\w\s.'\-]{{0,60}}?(?=\b(?:{stop})\b|$)",
        " ",
        s,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", s).strip(" ,;.-")


def _strip_isolated_digits(text: str) -> str:
    """Drop lone number tokens (Good 1 Bye → Good Bye). Unlikely in tag lyrics."""
    return re.sub(r"\b\d+\b", " ", text)


def normalize_sheet_lyrics(
    text: str,
    *,
    title: str | None = None,
    arranger: str | None = None,
) -> str:
    """Post-process OCR/PDF lyric text for search readability.

    Sheet music writes syllables with hyphens (``long - ing``, ``some-one``).
    Those are continued words, not punctuation — join them. Then attempt to
    split OCR-glued unknowns (``heartis`` → ``heart is``) and rejoin
    OCR-split fragments (``af ter`` → ``after``) via an English dictionary
    model. Perfect recovery of the published lyric line is not expected from
    OCR alone.

    Repeated lyric hooks are left intact — tags often repeat phrases on purpose.
    """
    if not text or not str(text).strip():
        return text
    _bind_lyric_postprocess()
    s = str(text)
    # Drop chord-symbol tokens that slipped through
    s = " ".join(tok for tok in s.split() if not _looks_like_chord_token(tok))
    s = _strip_isolated_digits(s)
    s = lyric_pp.filter_chrome_tokens(s)
    s = _strip_attribution_phrases(s)
    s = _strip_title_prefix(s, title)
    s = _strip_arranger_from_lyrics(s, arranger)
    # Case-change jams from OCR (emI → em I, ILove → I Love)
    s = _split_capital_boundaries(s)
    # Fancy dashes / lyric extenders → hyphen or space
    s = s.replace("—", "-").replace("–", "-").replace("―", "-").replace("〜", "-")
    s = re.sub(r"-{2,}", " ", s)
    # Underscore / tilde extenders sometimes OCR'd under held notes
    s = re.sub(r"[~_]{2,}", " ", s)
    # Join syllabic hyphens repeatedly: "bar-ber - shop" → "barbershop"
    # Keep apostrophes attached: "go - in'" → "goin'", "mem-o-ries" → "memories"
    for _ in range(10):
        news = re.sub(
            r"([A-Za-z]+(?:'[A-Za-z]+)?|'[A-Za-z]+)\s*-\s*([A-Za-z]+(?:'[A-Za-z]+)?|'[Ss])",
            lambda m: m.group(1) + m.group(2),
            s,
        )
        if news == s:
            break
        s = news
    # "mem 'ries" / "ring 'em" style spaced apostrophes
    s = re.sub(r"([A-Za-z])\s+'\s*([A-Za-z])", r"\1'\2", s)
    # OCR glued junk letter after punctuation: "darling,t that" → "darling, that"
    s = re.sub(r"([,;:.!?])[a-z]\b\s*", r"\1 ", s)
    # Remaining glued punctuation: "you.darling" / "'em,I" → "you. darling" / "'em, I"
    s = re.sub(r"([,;:.!?])([A-Za-z])", r"\1 \2", s)
    # Common sheet-syllable splits that OCR left as separate words (no hyphen)
    for pat, repl in (
        (r"\bsome\s+one\b", "someone"),
        (r"\bany\s+more\b", "anymore"),
        (r"\bevery\s+one\b", "everyone"),
        (r"\bno\s+body's\b", "nobody's"),
        (r"\bno\s+body\b", "nobody"),
        (r"\bbarber\s+shop\b", "barbershop"),
        (r"\bgood\s+bye\b", "goodbye"),
    ):
        s = re.sub(pat, repl, s, flags=re.IGNORECASE)
    s = _apply_lyric_contractions(s)
    # Dictionary split for remaining glued unknowns (heartis → heart is, tosing'em → to sing'em)
    s = _split_unknown_words(s)
    # Multi-token syllable lattice (di vi ne → divine), then pairwise leftovers
    s = lyric_pp.lattice_rejoin(s)
    s = _merge_broken_words(s)
    s = lyric_pp.lattice_rejoin(s)
    # Attach any remaining bare em/'em left after splits/merges
    s = _fix_em_clitics(s)
    # Phrase fixes that merges may have undone
    s = re.sub(r"\btherein\s+our\b", "there in our", s, flags=re.IGNORECASE)
    s = re.sub(r"\bthere\s+in\s+our\b", "there in our", s, flags=re.IGNORECASE)
    # Final chrome pass (credits sometimes survive syllable joins)
    s = lyric_pp.filter_chrome_tokens(s)
    # Arranger may reappear after merges; strip again
    s = _strip_arranger_from_lyrics(s, arranger)
    s = _strip_title_prefix(s, title)
    # Stray lone punctuation tokens / spacing
    s = re.sub(r"\s+([,;:.!?])(?=\s|$)", r"\1", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip(" ,;.-")


def _cluster_y_bands(tokens: list[dict], *, gap_ratio: float = 0.08) -> list[list[dict]]:
    """Cluster tokens into horizontal bands by Y center."""
    if not tokens:
        return []
    ordered = sorted(tokens, key=lambda t: t["y"])
    ys = [t["y"] for t in ordered]
    span = max(ys) - min(ys) or 1.0
    gap = max(span * gap_ratio, 25.0)
    bands: list[list[dict]] = [[ordered[0]]]
    for tok in ordered[1:]:
        if tok["y"] - bands[-1][-1]["y"] > gap:
            bands.append([tok])
        else:
            bands[-1].append(tok)
    # Sort each band left-to-right
    for band in bands:
        band.sort(key=lambda t: t["x"])
    return bands


def order_lyric_tokens(
    tokens: list[dict],
    *,
    image_height: float,
    image_width: float,
    title: str | None = None,
    arranger: str | None = None,
) -> str | None:
    """Rebuild lyrics using spatial layout.

    Two-staff tags usually place lead lyrics on an upper band and bass/bari on a
    lower band. Reading order for search is typically:
      first upper syllable → full lower phrase → remaining upper syllables
    e.g. Smile / A smile is still worth-while / darn ya smile!
    """
    _bind_lyric_postprocess()
    cleaned: list[dict] = []
    for tok in tokens:
        text = _clean_lyric_fragment(tok["text"], title=title)
        if not text:
            continue
        cleaned.append({**tok, "text": text})

    if not cleaned:
        return None

    cleaned = lyric_pp.filter_tokens_by_geometry(
        cleaned,
        image_height=image_height,
        image_width=image_width,
        title=title,
    )
    if not cleaned:
        return None

    bands = _cluster_y_bands(cleaned)
    lyric_bands = lyric_pp.pick_lyric_bands(
        bands, image_height=image_height, title=title
    )
    if not lyric_bands:
        return None

    ordered_texts: list[str] = []
    if len(lyric_bands) == 2:
        upper, lower = lyric_bands[0], lyric_bands[1]
        # First upper syllable, then whole lower staff, then rest of upper
        if upper:
            ordered_texts.append(upper[0]["text"])
        ordered_texts.extend(t["text"] for t in lower)
        ordered_texts.extend(t["text"] for t in upper[1:])
    else:
        for band in lyric_bands:
            ordered_texts.extend(t["text"] for t in band)

    lyrics = " ".join(ordered_texts)
    lyrics = re.sub(r"\s+", " ", lyrics)
    lyrics = re.sub(r"\s+([,!;.?])", r"\1", lyrics)
    lyrics = lyrics.strip(" ,;.")
    # "A smile" under the staff is usually "A Smile" in tag lyric conventions
    if title:
        lyrics = re.sub(
            rf"\bA\s+{re.escape(title)}\b",
            f"A {title}",
            lyrics,
            flags=re.IGNORECASE,
        )
    lyrics = normalize_sheet_lyrics(lyrics, title=title, arranger=arranger)
    if len(lyrics) < 4:
        return None
    if len(re.findall(r"[A-Za-z]+", lyrics)) < 2:
        return None
    return lyrics


def extract_lyrics_from_ocr(
    raw_text: str,
    *,
    title: str | None = None,
    arranger: str | None = None,
) -> str | None:
    """Fallback when only plain OCR text is available (no boxes)."""
    if not raw_text or not raw_text.strip():
        return None
    fragments: list[str] = []
    for ln in raw_text.splitlines():
        cleaned = _clean_lyric_fragment(ln, title=title)
        if cleaned:
            fragments.append(cleaned)
    if not fragments:
        return None
    lyrics = " ".join(fragments)
    lyrics = re.sub(r"\s+", " ", lyrics)
    lyrics = re.sub(r"\s+([,!;.?])", r"\1", lyrics)
    lyrics = lyrics.strip(" ,;.")
    lyrics = normalize_sheet_lyrics(lyrics, title=title, arranger=arranger)
    if len(lyrics) < 4 or len(re.findall(r"[A-Za-z]+", lyrics)) < 2:
        return None
    return lyrics


def extract_lyrics_from_image(
    img: "Image.Image",
    *,
    title: str | None = None,
    arranger: str | None = None,
) -> tuple[str | None, str]:
    """OCR sheet image and return (lyrics, raw_text_for_sheet_text)."""
    prepared = preprocess_for_ocr(img)
    tokens = ocr_tokens(prepared)
    raw = "\n".join(t["text"] for t in sorted(tokens, key=lambda t: (t["y"], t["x"])))
    w, h = prepared.size
    lyrics = order_lyric_tokens(
        tokens, image_height=h, image_width=w, title=title, arranger=arranger
    )
    if not lyrics:
        lyrics = extract_lyrics_from_ocr(raw, title=title, arranger=arranger)
    return lyrics, raw


def find_sheet_path(folder: Path, meta: dict) -> Path | None:
    sheet_info = (meta.get("parts") or {}).get("sheet") or {}
    sheet_name = sheet_info.get("filename")
    if sheet_name and (folder / sheet_name).exists():
        return folder / sheet_name
    for path in folder.iterdir():
        if path.is_file() and path.suffix.lower() in SHEET_EXTENSIONS:
            return path
    return None


def process_folder(
    folder: Path,
    do_ocr: bool = False,
    fill_arranger: bool = True,
    fill_lyrics: bool = True,
    *,
    force_ocr: bool = False,
    skip_if_ocr_lyrics: bool = True,
) -> None:
    meta = load_metadata(folder)
    if not meta:
        return

    # Accepted / manual review always wins — never re-OCR or overwrite curated lyrics
    if lyrics_are_accepted(meta):
        src = meta.get("lyrics_source") or "final"
        print(f"   skip lyric OCR (accepted lyrics, source={src})")
        return

    # Remote API / HTML / embedded PDF lyrics are already trusted primaries
    if (
        skip_if_ocr_lyrics
        and not force_ocr
        and not lyrics_are_weak(meta.get("lyrics"))
        and meta.get("lyrics_source") in {"api", "html", "pdf_text"}
    ):
        print(
            f"   skip lyric OCR (lyrics already present via {meta.get('lyrics_source')})"
        )
        return

    # Default: if we already have good OCR lyrics, do not re-inspect the sheet
    if (
        skip_if_ocr_lyrics
        and not force_ocr
        and has_ocr_lyrics(meta)
    ):
        print(
            f"   skip lyric OCR (already have ocr lyrics) "
            f"lyrics_source={meta.get('lyrics_source')}"
        )
        return

    # Also skip OCR work when lyrics already usable from html/pdf/api unless forcing
    if (
        skip_if_ocr_lyrics
        and not force_ocr
        and do_ocr
        and not lyrics_are_weak(meta.get("lyrics"))
        and meta.get("lyrics_source") in {"html", "pdf_text", "ocr", "manual", "api"}
    ):
        print(
            f"   skip lyric OCR (lyrics already present via {meta.get('lyrics_source')})"
        )
        do_ocr = False
        fill_lyrics = False

    sheet_path = find_sheet_path(folder, meta)
    existing_lyrics = meta.get("lyrics")
    # Only credit "html" method when lyrics actually came from the page
    html_lyrics = existing_lyrics if meta.get("lyrics_source") == "html" else None
    sheet_text_parts: list[str] = []
    methods: list[str] = []

    if html_lyrics:
        sheet_text_parts.append(html_lyrics)
        methods.append("html")

    ocr_raw = ""
    img = None
    ocr_attempted = False

    if do_ocr and not ocr_available():
        print(
            "   OCR unavailable (install rapidocr-onnxruntime and/or tesseract; "
            "use project venv + micromamba tesseract PATH)"
        )

    if sheet_path and sheet_path.exists():
        if sheet_path.suffix.lower() == ".pdf":
            text = pdf_text(sheet_path)
            if text and len(text.strip()) > 20:
                sheet_text_parts.append(text)
                methods.append("pdf_text")
                # Embedded PDF text is often notation garbage — only keep clean extractions
                if fill_lyrics and lyrics_are_weak(existing_lyrics):
                    from_pdf = extract_lyrics_from_ocr(
                        text,
                        title=meta.get("title"),
                        arranger=meta.get("arranger"),
                    )
                    if from_pdf and not lyrics_are_weak(from_pdf):
                        meta["lyrics"] = from_pdf
                        meta["lyrics_source"] = "pdf_text"
                        existing_lyrics = from_pdf
                        print(f"   lyrics PDF: {from_pdf[:80]}...")
            # Always rasterize for OCR when lyrics still weak (notation soup, etc.)
            if do_ocr and (lyrics_are_weak(meta.get("lyrics")) or force_ocr):
                img = load_sheet_image(sheet_path)
                if img is None:
                    print(f"   PDF raster failed for OCR: {sheet_path.name}")
        elif do_ocr:
            img = load_sheet_image(sheet_path)
            if img is None:
                print(f"   sheet image load failed: {sheet_path.name}")

        if do_ocr and img is not None:
            ocr_attempted = True
            ocr_lyrics, ocr_raw = extract_lyrics_from_image(
                img,
                title=meta.get("title"),
                arranger=meta.get("arranger"),
            )
            if ocr_raw.strip():
                sheet_text_parts.append(ocr_raw)
                methods.append("ocr")
            else:
                print(f"   OCR produced no text for {sheet_path.name}")

            if fill_arranger and not meta.get("arranger"):
                guessed = extract_arranger_from_regions(img)
                if guessed:
                    meta["arranger"] = guessed
                    meta["arranger_source"] = "ocr_region"
                    print(f"   arranger OCR: {guessed}")
                    # Arranger just discovered — strip it from lyrics if present
                    if ocr_lyrics:
                        ocr_lyrics = normalize_sheet_lyrics(
                            ocr_lyrics,
                            title=meta.get("title"),
                            arranger=guessed,
                        )

            if fill_lyrics and ocr_lyrics and not lyrics_are_accepted(meta):
                should_set = False
                if lyrics_are_weak(meta.get("lyrics")):
                    should_set = True
                elif force_ocr and meta.get("lyrics_source") == "ocr":
                    should_set = True
                elif html_lyrics and lyrics_are_weak(html_lyrics) and len(ocr_lyrics) > len(html_lyrics):
                    should_set = True
                # Never replace trusted remote API lyrics unless they are weak (above)
                if meta.get("lyrics_source") in {"api", "html", "pdf_text"} and not lyrics_are_weak(
                    meta.get("lyrics")
                ):
                    should_set = False
                if should_set:
                    # Final pass with whatever arranger we have now
                    ocr_lyrics = normalize_sheet_lyrics(
                        ocr_lyrics,
                        title=meta.get("title"),
                        arranger=meta.get("arranger"),
                    )
                    meta["lyrics"] = ocr_lyrics
                    meta["lyrics_source"] = "ocr"
                    print(f"   lyrics OCR: {ocr_lyrics[:120]}")
            elif fill_lyrics and meta.get("lyrics_source") == "ocr" and lyrics_are_weak(meta.get("lyrics")):
                # Stale source with empty lyrics (e.g. wiped by an older enrich bug)
                meta["lyrics_source"] = None
        elif do_ocr and sheet_path and sheet_path.exists() and img is None and ocr_available():
            print(f"   OCR skipped — could not load sheet image ({sheet_path.name})")
    elif do_ocr:
        print("   OCR skipped — no sheet file found in folder")

    # If lyrics still contain a known arranger credit, strip it (e.g. HTML path)
    if meta.get("lyrics") and meta.get("arranger") and not lyrics_are_accepted(meta):
        cleaned = normalize_sheet_lyrics(
            meta["lyrics"],
            title=meta.get("title"),
            arranger=meta.get("arranger"),
        )
        if cleaned != meta["lyrics"]:
            meta["lyrics"] = cleaned

    if html_lyrics and not meta.get("lyrics_source"):
        meta["lyrics_source"] = "html"

    sheet_text = "\n".join(p for p in sheet_text_parts if p).strip()
    if sheet_text:
        meta["sheet_text"] = sheet_text
    elif "sheet_text" not in meta:
        meta["sheet_text"] = None
    if methods:
        meta["sheet_text_method"] = "+".join(methods)
    elif do_ocr and ocr_attempted:
        meta["sheet_text_method"] = "ocr_empty"
    elif do_ocr and not ocr_available():
        meta["sheet_text_method"] = "ocr_unavailable"
    elif not meta.get("sheet_text_method") or meta.get("sheet_text_method") == "none":
        meta["sheet_text_method"] = "none"
    if do_ocr and ocr_raw:
        meta["ocr_raw"] = ocr_raw.strip()

    meta["keywords"] = keyword_tokens(
        meta.get("title"),
        meta.get("key"),
        meta.get("arranger"),
        meta.get("type"),
        meta.get("posted_by"),
        meta.get("lyrics"),
        meta.get("comments"),
        meta.get("sheet_text"),
        str(meta.get("tag_id")),
    )
    save_metadata(folder, meta)
    print(
        f"   extracted {folder.name} method={meta.get('sheet_text_method')} "
        f"lyrics_source={meta.get('lyrics_source')}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract sheet text / OCR lyrics + arranger")
    parser.add_argument("--root", type=Path, default=ROOT_DOWNLOAD_DIR)
    parser.add_argument("--ocr", action="store_true", help="Enable Tesseract/RapidOCR for images/PDFs")
    parser.add_argument(
        "--force-ocr",
        action="store_true",
        help="Re-OCR even when lyrics_source=ocr already has usable lyrics",
    )
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--ids", type=str)
    parser.add_argument("--no-lyrics", action="store_true", help="Do not fill lyrics from OCR")
    parser.add_argument("--no-arranger", action="store_true", help="Do not fill arranger from OCR")
    args = parser.parse_args()

    if args.ocr and not ocr_available():
        raise SystemExit(
            "OCR requested but unavailable. Install system tesseract-ocr, "
            "or: pip install rapidocr-onnxruntime"
        )

    wanted = None
    if args.ids:
        wanted = set()
        for chunk in args.ids.split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            if "-" in chunk:
                a, b = chunk.split("-", 1)
                wanted.update(range(int(a), int(b) + 1))
            else:
                wanted.add(int(chunk))

    count = 0
    for folder in iter_tag_folders(args.root):
        meta = load_metadata(folder)
        tag_id = meta.get("tag_id") if meta else read_tag_id_from_folder(folder)
        if wanted is not None and tag_id not in wanted:
            continue
        process_folder(
            folder,
            do_ocr=args.ocr,
            fill_arranger=not args.no_arranger,
            fill_lyrics=not args.no_lyrics,
            force_ocr=args.force_ocr,
            skip_if_ocr_lyrics=not args.force_ocr,
        )
        count += 1
        if args.limit and count >= args.limit:
            break
    print(f"Processed {count} folder(s)")


if __name__ == "__main__":
    main()
