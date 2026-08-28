"""Pick the most likely-accurate lyrics from API / ASR / OCR sources."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .complete import lyrics_are_weak
from .lyric_proposals import (
    asr_looks_hallucinated,
    asr_looks_held_word,
    format_normalize_lyrics,
    part_lyrics_map,
    pick_best_asr_text,
)
from .state import load_json, save_json, state_path

SUGGESTIONS_NAME = "lyric_suggestions.jsonl"
REVIEW_QUEUE_NAME = "lyric_review_queue.json"
BATCH_CURSOR_NAME = "lyric_batch_cursor.json"
SUMMARY_NAME = "lyric_suggestions_summary.json"

JUNK_LYRICS = {":", "", "Comments:", "Lyrics:", "None", "null"}
FINALIZE_DROP = (
    "part_lyrics",
    "ocr_raw",
    "sheet_text",
    "sheet_text_method",
    "ocr_confidence",
    "lyrics_asr_part",
)
_WORD = re.compile(r"[a-z0-9']+", re.I)
_DIGIT_TOKEN = re.compile(r"[a-zA-Z]*\d+[a-zA-Z]*")
_GLUED = re.compile(r"[a-z]{3,}[A-Z][a-z]+")  # iwanDer / shackinAthlone leftovers
_SYLLABLE_DOTS = re.compile(r"[A-Za-z]{2,}\s*[·•.]\s*[A-Za-z]")
_PLACEHOLDER = re.compile(
    r"(?:title\s*\+|\+\s*title|variation\s*#|6th part|purely optional)",
    re.I,
)
_WHISPER_JUNK = re.compile(
    r"(thanks for watching|thank you(?: so much)?[.!]?\s*$|\bsubscribe\b)",
    re.I,
)
_DANGLING_APOS = re.compile(
    r"\b(?!ol|o|til|neer|ev|lovin|goin|waitin|nothin|darlin|somethin)[A-Za-z]{3,}'(?![A-Za-z])",
    re.I,
)
_INCOMPLETE_END = frozenset(
    {
        "a",
        "an",
        "and",
        "after",
        "the",
        "to",
        "for",
        "of",
        "in",
        "on",
        "at",
        "my",
        "your",
        "with",
        "that",
        "this",
        "just",
        "when",
        "if",
        "but",
        "from",
        "by",
        "or",
        "as",
    }
)
_LYRIC_OK = frozenset(
    {
        "gal",
        "gals",
        "honey",
        "hon",
        "darlin",
        "darling",
        "ol",
        "ole",
        "oer",
        "neer",
        "evry",
        "eery",
        "every",
        "til",
        "till",
        "cause",
        "cuz",
        "gonna",
        "wanna",
        "gotta",
        "ain't",
        "aint",
        "yall",
        "thru",
        "whoa",
        "ooh",
        "oooh",
        "mmm",
        "hmm",
        "doo",
        "bah",
        "bop",
        "gee",
        "golly",
        "swell",
        "lonesome",
        "sweetheart",
        "barbershop",
        "em",
        "round",
        "st",
        "mr",
        "mrs",
        "oh",
        "ah",
        "ya",
        "yer",
        "ain",
        "lovin",
        "lovin'",
        "waitin",
        "goin",
        "nothin",
        "somethin",
        "ev'ry",
        "evrything",
        "everythings",
        "tho",
        "tho'",
        "o'",
        "ma",
        "pa",
        "babe",
        "baby",
        "mamma",
        "mama",
        "mammy",
        "daddy",
        "dixie",
        "swanee",
        "alabamy",
        "alabam",
        "georgia",
        "moonlight",
        "heartache",
        "goodbye",
        "goodnight",
        "adeline",
        "rosie",
        "sally",
        "sue",
        "joe",
        "pagliacci",
    }
)
_OCR_SOURCES = frozenset({"ocr", "ocr_raw", "pdf_text", "sheet_text"})
_UNRELIABLE_SOURCES = _OCR_SOURCES



def suggestions_path() -> Path:
    return state_path(SUGGESTIONS_NAME)


def review_queue_path() -> Path:
    return state_path(REVIEW_QUEUE_NAME)


def batch_cursor_path() -> Path:
    return state_path(BATCH_CURSOR_NAME)


def _clean(text: Any) -> str:
    if text is None:
        return ""
    s = str(text).strip()
    if s in JUNK_LYRICS:
        return ""
    return s


def _words(text: str) -> list[str]:
    return _WORD.findall(text.lower())


def flatten_lyrics(text: str | None) -> str:
    if not text:
        return ""
    return " ".join(str(text).split())


_WRAP_QUOTES = (
    ('"', '"'),
    ("\u201c", "\u201d"),  # “ ”
    ("\u00ab", "\u00bb"),  # « »
    ("\u2018", "\u2019"),  # ‘ ’
)


_APOS_LEAD = (
    "til",
    "tis",
    "twas",
    "twere",
    "twill",
    "twould",
    "cause",
    "cos",
    "cuz",
    "round",
    "cross",
    "less",
    "bout",
    "em",
    "fore",
    "nuff",
    "gainst",
    "neath",
    "scuse",
    "nother",
)
_LEAD_APOS_RE = re.compile(
    r"(?<![A-Za-z0-9])'(?!(?:" + "|".join(_APOS_LEAD) + r")\b)",
    re.I,
)
_QUOTED_SPAN_RE = re.compile(
    r"(?<![A-Za-z0-9])'(?!(?:"
    + "|".join(_APOS_LEAD)
    + r")\b)([^']*)'(?![A-Za-z])",
    re.I,
)
_QUOTE_CHARS_RE = re.compile(r'[“”«»„‟"‹›]')


def strip_quotation_marks(text: str) -> str:
    """Drop quotation marks; keep apostrophes (I'm, don't, 'til, darlin')."""
    s = _QUOTE_CHARS_RE.sub("", text)
    s = s.replace("‘", "'").replace("’", "'").replace("‚", "'").replace("‛", "'")
    prev = None
    while prev != s:
        prev = s
        s = _QUOTED_SPAN_RE.sub(r"\1", s)
    # Leftover opening/closing quotes that never paired.
    s = _LEAD_APOS_RE.sub("", s)
    if s.endswith("'") and len(s) >= 2 and not s[-2].isalnum():
        s = s[:-1]
    return s


_AFTER_PAREN_PUNCT = frozenset(".,!?;:…")


def normalize_paren_spacing(text: str) -> str:
    """One space before '(' and one space after ')', except at the ends.

    No space between ')' and following punctuation: (aside). (aside), (aside)!
    """
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "(":
            while out and out[-1] == " ":
                out.pop()
            if out:
                out.append(" ")
            out.append("(")
            i += 1
            while i < n and text[i] == " ":
                i += 1
            continue
        if ch == ")":
            while out and out[-1] == " ":
                out.pop()
            out.append(")")
            i += 1
            while i < n and text[i] == " ":
                i += 1
            if i < n and text[i] in _AFTER_PAREN_PUNCT:
                while i < n and text[i] in _AFTER_PAREN_PUNCT:
                    out.append(text[i])
                    i += 1
                while i < n and text[i] == " ":
                    i += 1
                if i < n:
                    out.append(" ")
            elif i < n:
                out.append(" ")
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def polish_lyric_text(text: str) -> str:
    """Quotes off; parentheses spaced; collapse leftover whitespace."""
    s = strip_quotation_marks(text)
    s = normalize_paren_spacing(s)
    return flatten_lyrics(s)


def unwrap_lyric_wrappers(text: str) -> str:
    """Remove quotes/parentheses that wrap the entire lyric, not inner asides."""
    s = flatten_lyrics(text)
    if not s:
        return ""
    for _ in range(6):
        t = s.strip()
        nxt = t
        for a, b in _WRAP_QUOTES:
            if len(t) >= 2 and t.startswith(a) and t.endswith(b) and t != a + b:
                nxt = t[len(a) : -len(b)].strip()
                break
        else:
            if len(t) >= 2 and t[0] == "'" and t[-1] == "'" and t.count("'") == 2:
                nxt = t[1:-1].strip()
            elif len(t) >= 2 and t[0] == "(" and t[-1] == ")":
                depth = 0
                wraps = True
                for i, ch in enumerate(t):
                    if ch == "(":
                        depth += 1
                    elif ch == ")":
                        depth -= 1
                        if depth == 0 and i != len(t) - 1:
                            wraps = False
                            break
                        if depth < 0:
                            wraps = False
                            break
                if wraps and depth == 0:
                    nxt = t[1:-1].strip()
        if nxt == t:
            break
        s = nxt
    return s


_NAME_TOKEN = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")
_SENTENCE_END = re.compile(r'[.!?…]["\')\]]*\s*$')
_ENGLISH_NAMES: set[str] | None = None
_ALWAYS_I = frozenset({"i", "i'm", "i'll", "i'd", "i've"})
_NAME_STOPWORDS = frozenset(
    """
    a an and or but if so no yes
    the this that these those
    i im ive ill id
    me my mine myself
    we us our ours ourselves
    you your yours yourself yourselves
    he him his himself
    she her hers herself
    it its itself
    they them their theirs themselves
    in on at to for of from with by as
    up out off over under into onto
    is am are was were be been being
    do did does done
    can could should would
    will may might must
    not nor
    """.split()
)
# Census names that are also ordinary English — don't revive these from ALL CAPS.
_AMBIGUOUS_NAMES = frozenset(
    {
        "will",
        "may",
        "mark",
        "june",
        "april",
        "august",
        "bill",
        "bob",
        "pat",
        "ray",
        "joy",
        "gay",
        "king",
        "major",
        "hope",
        "grace",
        "faith",
        "rose",
        "lily",
        "daisy",
        "ivy",
        "brown",
        "white",
        "green",
        "black",
        "gold",
        "young",
        "long",
        "little",
        "good",
        "true",
        "fair",
        "sweet",
        "dear",
        "love",
        "heart",
        "day",
        "night",
        "angel",
        "star",
        "sky",
        "summer",
        "winter",
        "dawn",
        "eve",
        "melody",
        "harmony",
        "song",
        "sunny",
        "hale",
        "clay",
        "brook",
        "forest",
        "worth",
        "stone",
        "wood",
        "vale",
        "glen",
        "dale",
        "pearl",
        "jade",
        "amber",
        "jewel",
        "autumn",
        "holly",
        "robin",
        "page",
        "dean",
        "earl",
        "duke",
        "prince",
        "queen",
        "max",
        "sonny",
        "buddy",
        "mike",
        "don",
        "tim",
        "tom",
        "sam",
        "ben",
        "dan",
        "jim",
        "joe",  # joe is often a name in tags — actually KEEP joe
    }
)
_AMBIGUOUS_NAMES = _AMBIGUOUS_NAMES - {"joe"}

# Always title-case: vintage lyric names for people and places.
_LYRIC_PROPER_NOUNS = frozenset(
    {
        "mammy",
        "pappy",
        "adeline",
        "dixie",
        "dixieland",
        "swanee",
        "suwanee",
        "swannee",
        "alabamy",
        "alabam",
        "alabama",
        "georgia",
        "carolina",
        "carolinas",
        "virginny",
        "virginia",
        "tennessee",
        "kentucky",
        "mississippi",
        "louisiana",
        "indiana",
        "illinois",
        "ohio",
        "iowa",
        "kansas",
        "nebraska",
        "dakota",
        "montana",
        "arizona",
        "texas",
        "california",
        "florida",
        "missouri",
        "arkansas",
        "oklahoma",
        "oregon",
        "mexico",
        "hawaii",
        "bermuda",
        "broadway",
        "harlem",
        "manhattan",
        "brooklyn",
        "chicago",
        "frisco",
        "cheyenne",
        "memphis",
        "mobile",
        "savannah",
        "nashville",
        "louisville",
        "orleans",
        "coney",
        "piccadilly",
        "london",
        "paris",
        "ireland",
        "scotland",
        "england",
        "killarney",
        "athlone",
        "shannon",
        "avondale",
        "tipperary",
        "dublin",
        "galway",
        "kerry",
        "cork",
        "erin",
        "waikiki",
        "honolulu",
        "potomac",
        "colorado",
        "alaska",
        "rosie",
        "sally",
        "liza",
        "nellie",
        "nell",
        "annie",
        "bessie",
        "dinah",
        "ramona",
        "kathleen",
        "eileen",
        "maureen",
        "colleen",
        "bridget",
        "maggie",
        "josie",
        "pagliacci",
        "cupid",
        "santa",
        "jesus",
        "christ",
        "god",
        "lord",
        "noel",
        # Holidays (not May/March — those are also common words)
        "christmas",
        "easter",
        "halloween",
        "thanksgiving",
        "valentine",
        "valentines",
        "hanukkah",
        "chanukah",
        # Days of the week
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        # Unambiguous months
        "january",
        "february",
        "april",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
        # Nationalities / countries (adjectives too)
        "america",
        "american",
        "americans",
        "irish",
        "english",
        "british",
        "yankee",
        "yankees",
        "hollywood",
        "flanders",
        "berkeley",
    }
)
_LYRIC_PROPER_PHRASES = (
    ("valentine's day", "Valentine's Day"),
    ("valentines day", "Valentines Day"),
    ("christmas eve", "Christmas Eve"),
    ("christmas day", "Christmas Day"),
    ("new year's eve", "New Year's Eve"),
    ("new year's", "New Year's"),
    ("new year", "New Year"),
    ("fourth of july", "Fourth of July"),
    ("4th of july", "4th of July"),
    ("new orleans", "New Orleans"),
    ("new york", "New York"),
    ("new jersey", "New Jersey"),
    ("las vegas", "Las Vegas"),
    ("coney island", "Coney Island"),
    ("san francisco", "San Francisco"),
    ("st louis", "St Louis"),
    ("saint louis", "Saint Louis"),
    ("st patrick", "St Patrick"),
    ("saint patrick", "Saint Patrick"),
    ("santa claus", "Santa Claus"),
    ("notre dame", "Notre Dame"),
    ("flanders fields", "Flanders Fields"),
    ("berkeley square", "Berkeley Square"),
    ("lookout mountain", "Lookout Mountain"),
    ("cape cod", "Cape Cod"),
    ("old smoky", "Old Smoky"),
    ("old smokey", "Old Smokey"),
    ("mason dixon", "Mason Dixon"),
)


def load_english_names() -> set[str]:
    """US Census 1990 first names plus a few lyric/place names (lowercase)."""
    global _ENGLISH_NAMES
    if _ENGLISH_NAMES is not None:
        return _ENGLISH_NAMES
    path = Path(__file__).resolve().parent / "data" / "english_first_names.txt"
    names: set[str] = set()
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            w = line.strip().lower()
            if w and w not in _NAME_STOPWORDS:
                names.add(w)
    names.update(_LYRIC_PROPER_NOUNS)
    _ENGLISH_NAMES = names
    return names


_I_GLUE_RESTS = frozenset(
    {
        "ran",
        "am",
        "was",
        "were",
        "had",
        "have",
        "has",
        "can",
        "could",
        "would",
        "should",
        "got",
        "get",
        "see",
        "saw",
        "go",
        "went",
        "come",
        "came",
        "know",
        "knew",
        "love",
        "loved",
        "want",
        "wanted",
        "need",
        "needed",
        "feel",
        "felt",
        "hear",
        "heard",
        "think",
        "thought",
        "find",
        "found",
        "leave",
        "left",
        "wait",
        "walk",
        "stand",
        "stay",
        "try",
        "tried",
        "miss",
        "long",
        "longed",
        "hope",
        "hoped",
        "pray",
        "wish",
        "dream",
        "cry",
        "cried",
        "live",
        "lived",
        "die",
        "died",
        "give",
        "gave",
        "take",
        "took",
        "make",
        "made",
        "tell",
        "told",
        "say",
        "said",
        "did",
        "let",
        "put",
        "keep",
        "kept",
        "call",
        "called",
        "look",
        "looked",
        "used",
        "must",
        "shall",
        "might",
        "never",
        "always",
        "just",
        "still",
        "only",
    }
)


def _split_i_glue(word: str, *, names: set[str]) -> str | None:
    """Iran → I ran, Iwant → I want. Skip real names (Indiana, Ireland, Iris)."""
    if len(word) < 3 or word[0] not in "Ii":
        return None
    rest = word[1:]
    if rest[:1].isupper():
        return None
    low = word.lower()
    core = low[:-2] if low.endswith("'s") else low
    if core in names or core in _LYRIC_PROPER_NOUNS:
        return None
    rest_low = rest.lower()
    if rest_low in _I_GLUE_RESTS:
        return "I " + rest_low
    return None


def _is_title_case_word(word: str) -> bool:
    if not word or not word[0].isupper():
        return False
    rest = word[1:]
    if not rest:
        return True
    return rest.islower() or ("'" in rest and rest.replace("'", "").islower())


def sentence_case_lyrics(text: str | None) -> str:
    """Sentence-case lyrics; keep already-capitalized names from the namelist.

    ALL-CAPS lines are fully sentence-cased (no name detection). Mixed-case
    Title-Case tokens are kept if they appear in the English first-name list
    or look like proper nouns (not common English words).
    """
    raw = unwrap_lyric_wrappers(text)
    if not raw:
        return ""
    raw = flatten_lyrics(strip_quotation_marks(raw))
    if not raw:
        return ""
    letters = re.findall(r"[A-Za-z]", raw)
    mostly_caps = bool(letters) and (
        sum(1 for ch in letters if ch.isupper()) / len(letters) > 0.72
    )
    names = load_english_names()

    pieces: list[str] = []
    last = 0
    cap_next = True
    for match in _NAME_TOKEN.finditer(raw):
        gap = raw[last : match.start()]
        pieces.append(gap)
        if gap and _SENTENCE_END.search(gap):
            cap_next = True
        word = match.group(0)
        low = word.lower()
        glue = _split_i_glue(word, names=names)
        if glue:
            if cap_next:
                pieces.append(glue)
            else:
                pieces.append(glue)  # always "I …"
            cap_next = False
            last = match.end()
            continue
        core = low[:-2] if low.endswith("'s") else low
        if low in _ALWAYS_I or (low.startswith("i'") and len(low) <= 4):
            if "'" in low:
                a, b = low.split("'", 1)
                restored = "I'" + b
            else:
                restored = "I"
        elif core in _LYRIC_PROPER_NOUNS:
            rest = word[len(core) :]  # preserve 's
            restored = core[0].upper() + core[1:] + rest.lower()
        elif core in names and (
            (not mostly_caps and _is_title_case_word(word[: len(core)]))
            or (mostly_caps and core not in _AMBIGUOUS_NAMES)
        ):
            rest = word[len(core) :]
            restored = core[0].upper() + core[1:] + rest.lower()
        elif cap_next:
            restored = word[0].upper() + word[1:].lower()
        else:
            restored = low
        pieces.append(restored)
        cap_next = False
        last = match.end()
    pieces.append(raw[last:])
    out = "".join(pieces)
    for needle, repl in _LYRIC_PROPER_PHRASES:
        idx = 0
        low = out.lower()
        while True:
            found = low.find(needle, idx)
            if found < 0:
                break
            out = out[:found] + repl + out[found + len(needle) :]
            low = out.lower()
            idx = found + len(repl)
    return flatten_lyrics(normalize_paren_spacing(out))


def _dict_fns():
    from extract_text import _bind_lyric_postprocess, _is_common_word, _is_known_word

    _bind_lyric_postprocess()
    return _is_known_word, _is_common_word


def _token_known(word: str, is_known, is_common) -> bool:
    low = word.lower().strip("'")
    compact = low.replace("'", "")
    if not compact:
        return True
    if compact in _LYRIC_OK or low in _LYRIC_OK:
        return True
    if is_known(low) or is_known(compact):
        return True
    if is_common(low) or is_common(compact):
        return True
    return False


def _looks_like_name(word: str) -> bool:
    if len(word) < 3 or not word[0].isupper():
        return False
    rest = word[1:]
    return rest.isalpha() and rest.islower()


def lyrics_quality_issues(text: str | None, source: str | None = None) -> list[str]:
    """Reasons this lyric string should not be batch-accepted."""
    raw = flatten_lyrics(text)
    if not raw:
        return ["empty"]
    issues: list[str] = []
    src = (source or "").split(":")[0]

    if _PLACEHOLDER.search(raw):
        issues.append("placeholder")
    if _WHISPER_JUNK.search(raw):
        issues.append("asr_junk")
    if _DANGLING_APOS.search(raw):
        issues.append("broken_apostrophes")
    if _SYLLABLE_DOTS.search(raw) or "·" in raw or "•" in raw:
        issues.append("ocr_glyphs")
    if _GLUED.search(raw):
        issues.append("glued_words")
    if re.search(r"\b[A-Za-z]+'[A-Za-z]+'[A-Za-z]", raw):
        issues.append("broken_apostrophes")
    if src == "asr" and asr_looks_hallucinated(raw):
        issues.append("asr_junk")

    tokens = _WORD.findall(raw)
    if len(tokens) < 3:
        issues.append("too_short")

    is_known, is_common = _dict_fns()
    unknown: list[str] = []
    common_hits = 0
    long_unknown: list[str] = []
    for tok in tokens:
        compact = tok.lower().replace("'", "")
        if len(compact) == 1 and compact not in {"a", "i", "o"}:
            unknown.append(tok)
            continue
        if _DIGIT_TOKEN.fullmatch(tok):
            unknown.append(tok)
            continue
        if _token_known(tok, is_known, is_common):
            common_hits += 1
            continue
        if _looks_like_name(tok):
            continue
        unknown.append(tok)
        if len(compact) >= 10:
            long_unknown.append(tok)

    n = max(len(tokens), 1)
    if unknown:
        issues.append("nonsense_words")
    if long_unknown:
        issues.append("glued_words")
    if n >= 6 and (common_hits / n) < 0.35:
        issues.append("low_english")

    letters = re.findall(r"[A-Za-z]", raw)
    if letters and (sum(1 for ch in letters if ch.isupper()) / len(letters)) > 0.72 and n >= 5:
        issues.append("all_caps_ocr")

    last = tokens[-1].lower().replace("'", "") if tokens else ""
    if last in _INCOMPLETE_END and n >= 5:
        issues.append("incomplete")
    if last in {"bye", "thanks"} and n >= 4:
        issues.append("asr_junk")
    # Truncated last token: 2–3 letter unknown (nly, tle, hn)
    if last and len(last) <= 3 and last not in _LYRIC_OK and last not in {"a", "i", "o", "oh", "me", "my", "we", "us", "he", "it", "so", "no", "go", "do", "be", "am", "is", "or", "of", "on", "to"}:
        if not _token_known(last, is_known, is_common):
            issues.append("truncated")

    # Extreme repetition (heart heart heart)
    if n >= 8:
        counts: dict[str, int] = {}
        for t in tokens:
            counts[t.lower()] = counts.get(t.lower(), 0) + 1
        top = max(counts.values())
        if top / n >= 0.45:
            issues.append("repetition")

    if src in _UNRELIABLE_SOURCES:
        issues.append("unreliable_source")

    # unique, stable order
    seen: set[str] = set()
    out: list[str] = []
    for item in issues:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def is_confident_guess(text: str | None, source: str | None) -> bool:
    """True when lyrics are clean enough to show in the accept-batch."""
    src = (source or "").split(":")[0]
    if src in _UNRELIABLE_SOURCES:
        return False
    issues = lyrics_quality_issues(text, source)
    # unreliable_source already returned False above; remaining issues fail the batch
    return not issues


def api_lyrics(meta: dict) -> str:
    """Remote API lyrics, whether stored in the primary field or the remote blob."""
    source = meta.get("lyrics_source")
    if source == "api":
        text = _clean(meta.get("lyrics"))
        if text:
            return text
    remote = meta.get("remote") if isinstance(meta.get("remote"), dict) else {}
    for key in ("Lyrics", "lyrics"):
        text = _clean(remote.get(key))
        if text:
            return text
    return ""


def collect_candidates(meta: dict) -> list[dict[str, Any]]:
    """All distinct lyric strings we can recover from metadata."""
    title = meta.get("title") if isinstance(meta.get("title"), str) else None
    arranger = meta.get("arranger") if isinstance(meta.get("arranger"), str) else None
    seen: set[str] = set()
    out: list[dict[str, Any]] = []

    def add(kind: str, raw: Any, *, part: str | None = None, label: str | None = None) -> None:
        text = _clean(raw)
        if not text:
            return
        formatted = format_normalize_lyrics(text, title=title, arranger=arranger) or flatten_lyrics(text)
        key = " ".join(_words(formatted))
        if not key or key in seen:
            return
        seen.add(key)
        out.append(
            {
                "kind": kind,
                "part": part,
                "label": label or (f"asr:{part}" if part else kind),
                "text": formatted,
                "raw": flatten_lyrics(text),
            }
        )

    add("api", api_lyrics(meta), label="api")
    if meta.get("lyrics_source") == "html":
        add("html", meta.get("lyrics"), label="html")
    if meta.get("lyrics_source") == "manual":
        add("manual", meta.get("lyrics"), label="manual")
    if meta.get("lyrics_source") == "pdf_text":
        add("pdf_text", meta.get("lyrics"), label="pdf_text")
    if meta.get("lyrics_source") == "ocr":
        add("ocr", meta.get("lyrics"), label="ocr")
    if meta.get("lyrics_source") == "asr":
        add("asr", meta.get("lyrics"), part=meta.get("lyrics_asr_part") or "lead", label="asr")

    parts = part_lyrics_map(meta)
    for part in ("lead", "tenor", "bari", "bass"):
        add("asr", parts.get(part), part=part, label=f"asr:{part}")

    add("ocr", meta.get("ocr_raw"), label="ocr_raw")
    if meta.get("lyrics_source") not in {"ocr", "pdf_text"}:
        add("ocr", meta.get("sheet_text"), label="sheet_text")

    # Current primary if it wasn't already added
    add(meta.get("lyrics_source") or "current", meta.get("lyrics"), label="current")
    return out


def _score(cand: dict[str, Any]) -> int:
    text = cand.get("text") or ""
    kind = cand.get("kind")
    part = cand.get("part")
    words = _words(text)
    n_words = len(words)
    n_uniq = len(set(words))
    weak = lyrics_are_weak(text)

    if kind == "manual" and not weak:
        return 50_000 + n_uniq
    if kind in {"api", "html"}:
        if weak:
            return 0
        return 20_000 + n_uniq * 5 + min(n_words, 40)
    if kind == "asr":
        if asr_looks_hallucinated(text):
            return 0
        bonus = {"lead": 800, "tenor": 600, "bari": 150, "bass": 80}.get(part or "", 200)
        score = 8_000 + bonus + n_uniq * 15 + min(n_words, 50)
        if asr_looks_held_word(text):
            score -= 1_500
        if weak:
            score -= 2_000
        return max(score, 0)
    if kind == "pdf_text":
        return 0 if weak else 1_200 + n_uniq
    if kind == "ocr":
        if weak:
            return 0
        # Prefer cleaned OCR lyrics over the raw dump.
        penalty = 80 if cand.get("label") == "ocr_raw" else 0
        return 1_000 + n_uniq - penalty
    return 0 if weak else 400 + n_uniq


def pick_best(meta: dict) -> dict[str, Any]:
    """Return chosen candidate plus extras. chosen may be empty."""
    candidates = collect_candidates(meta)
    scored = [({**c, "score": _score(c)}) for c in candidates]
    scored.sort(key=lambda c: (-c["score"], c.get("label") or ""))
    usable = [c for c in scored if c["score"] > 0]
    chosen = usable[0] if usable else None

    # If API exists and is usable, always prefer it over ASR/OCR even if ASR is longer.
    api = next((c for c in usable if c["kind"] in {"api", "html"}), None)
    if api:
        chosen = api

    if chosen is None:
        asr_text, asr_part = pick_best_asr_text(
            part_lyrics_map(meta),
            title=meta.get("title") if isinstance(meta.get("title"), str) else None,
            arranger=meta.get("arranger") if isinstance(meta.get("arranger"), str) else None,
        )
        if asr_text:
            chosen = {
                "kind": "asr",
                "part": asr_part,
                "label": f"asr:{asr_part}" if asr_part else "asr",
                "text": asr_text,
                "raw": asr_text,
                "score": 1,
            }

    return {
        "candidates": scored,
        "chosen": chosen,
        "text": (chosen or {}).get("text") or "",
        "source": (chosen or {}).get("label") or "",
        "score": (chosen or {}).get("score") or 0,
    }


def pending_review_ids() -> set[int]:
    data = load_review_queue()
    out: set[int] = set()
    for item in data.get("items") or []:
        tid = item.get("tag_id")
        if isinstance(tid, int) and item.get("status") != "done":
            out.add(tid)
    return out


def suggestion_row(folder: Path, meta: dict) -> Optional[dict[str, Any]]:
    tag_id = meta.get("tag_id")
    if not isinstance(tag_id, int):
        return None
    if meta.get("lyrics_finalized"):
        return None
    if meta.get("lyrics_source") == "manual":
        return None
    if meta.get("status") in {"not_found", "http_error"}:
        return None

    pick = pick_best(meta)
    chosen = pick["chosen"]
    text = pick["text"] or ""
    source = pick["source"] or ""
    issues = lyrics_quality_issues(text, source) if text else ["empty"]
    return {
        "tag_id": tag_id,
        "folder": folder.name,
        "metadata_path": str(folder / "metadata.json"),
        "title": meta.get("title") or folder.name,
        "arranger": meta.get("arranger") or "",
        "current_lyrics": _clean(meta.get("lyrics")) or None,
        "current_source": meta.get("lyrics_source"),
        "suggested_lyrics": text or None,
        "suggested_source": source or None,
        "suggested_score": pick["score"],
        "quality_issues": issues,
        "candidate_count": len(pick["candidates"]),
        "candidates": [
            {"label": c["label"], "text": c["text"], "score": c["score"]}
            for c in pick["candidates"]
        ],
    }


def load_suggestions(path: Path | None = None) -> list[dict]:
    path = path or suggestions_path()
    rows: list[dict] = []
    if not path.is_file():
        return rows
    with path.open("r", encoding="utf-8") as fh:
        import json

        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row.get("tag_id"), int):
                rows.append(row)
    rows.sort(key=lambda r: r["tag_id"])
    return rows


def save_suggestions(rows: list[dict], path: Path | None = None) -> Path:
    import json

    path = path or suggestions_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        for row in sorted(rows, key=lambda r: r.get("tag_id") or 0):
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    tmp.replace(path)
    return path


def load_review_queue() -> dict:
    data = load_json(
        review_queue_path(),
        default={"items": [], "cursor": 0, "resolved": 0},
    )
    if "items" not in data:
        data["items"] = []
    if "cursor" not in data:
        data["cursor"] = 0
    return data


def save_review_queue(data: dict) -> None:
    save_json(review_queue_path(), data)


def append_review_item(row: dict, *, reason: str = "disputed") -> None:
    data = load_review_queue()
    tid = row.get("tag_id")
    items = data.get("items") or []
    existing = {it.get("tag_id"): i for i, it in enumerate(items) if isinstance(it.get("tag_id"), int)}
    item = {
        "tag_id": tid,
        "folder": row.get("folder"),
        "metadata_path": row.get("metadata_path"),
        "title": row.get("title"),
        "arranger": row.get("arranger"),
        "suggested_lyrics": row.get("suggested_lyrics"),
        "suggested_source": row.get("suggested_source"),
        "reason": reason,
        "added_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending",
    }
    if tid in existing:
        items[existing[tid]] = {**items[existing[tid]], **item}
    else:
        items.append(item)
    data["items"] = items
    save_review_queue(data)


def load_batch_cursor() -> dict:
    return load_json(
        batch_cursor_path(),
        default={"next_index": 0, "accepted": 0, "disputed": 0, "pages": 0},
    )


def save_batch_cursor(state: dict) -> None:
    save_json(batch_cursor_path(), state)


def finalize_lyrics(meta: dict, lyrics: str, *, chosen_from: str) -> dict:
    """Keep a single lyrics field; drop ASR/OCR working copies."""
    text = sentence_case_lyrics(lyrics) if lyrics else ""
    meta["lyrics"] = text or None
    meta["lyrics_source"] = "final"
    meta["lyrics_chosen_from"] = chosen_from or None
    meta["lyrics_finalized"] = True
    meta["lyrics_finalized_at"] = datetime.now(timezone.utc).isoformat()
    for key in FINALIZE_DROP:
        meta.pop(key, None)
    return meta
