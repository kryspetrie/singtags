"""Tag-page URL helpers (+ obsolete HTML parser).

``parse_tag_page()`` is OBSOLETE — do not scrape per-tag HTML for metadata.
Prefer the bulk API (``mirror/enrich.py`` / ``sync.py --bulk-meta``).
``download_file_url`` / ``tag_page_url`` are still used.
"""

from __future__ import annotations

import re
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

from bs4 import BeautifulSoup, NavigableString

from .config import (
    AUDIO_EXTENSIONS,
    BASE_URL,
    GUIDELINES_PDF_NAME,
    PART_FLDNAMES,
    SHEET_EXTENSIONS,
)
from .http import absolute_url, is_guidelines_url
from .names import keyword_tokens, sanitize_segment

NOT_FOUND_RE = re.compile(r"Tag\s+\d+\s+not\s+found", re.IGNORECASE)
NO_MATCH_RE = re.compile(r"No database item matches|item matches look up criteria", re.IGNORECASE)


def tag_page_url(tag_id: int) -> str:
    return f"{BASE_URL}/dbpage.php?pg=view&dbase=tags&id={tag_id}"


def download_file_url(tag_id: int, fldname: Optional[str] = None) -> str:
    url = f"{BASE_URL}/dbaction.php?action=DownloadFile&dbase=tags&id={tag_id}"
    if fldname:
        url += f"&fldname={fldname}"
    return url


def _label_value(soup: BeautifulSoup, label: str) -> Optional[str]:
    """Find a table/row style 'Label: value' from page text or strong labels."""
    label_l = label.lower().rstrip(":")

    # Prefer <tr><td>Label:</td><td>value</td></tr>
    for tr in soup.find_all("tr"):
        cells = tr.find_all(["td", "th"], recursive=False)
        if len(cells) < 2:
            cells = tr.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        head = cells[0].get_text(" ", strip=True).lower().rstrip(":")
        if head != label_l:
            continue
        value = cells[1].get_text(" ", strip=True)
        # &nbsp; / empty
        if not value or value == "\xa0":
            return None
        # Avoid swallowing the next label if markup is odd
        if value.lower().rstrip(":") in {
            "lyrics",
            "comments",
            "type",
            "arranger",
            "key written in",
            "posted by",
            "date posted",
        }:
            return None
        return _clean_value(value)

    # Prefer structured: strong Label + following sibling text
    for strong in soup.find_all(["strong", "b"]):
        text = strong.get_text(" ", strip=True)
        if text.lower().rstrip(":") != label_l:
            continue
        sibling = strong.next_sibling
        while sibling is not None:
            if isinstance(sibling, NavigableString):
                chunk = str(sibling).strip()
                if chunk:
                    return _clean_value(chunk)
            else:
                name = getattr(sibling, "name", None)
                if name in {"br", "hr"}:
                    sibling = sibling.next_sibling
                    continue
                chunk = sibling.get_text(" ", strip=True)
                if chunk and chunk.lower().rstrip(":") != label_l:
                    return _clean_value(chunk)
            sibling = sibling.next_sibling
    return None


def _clean_value(value: str) -> Optional[str]:
    value = re.sub(r"\s+", " ", value).strip()
    # Strip trailing "www...." site chrome sometimes glued on
    value = re.split(r"\s+www\.", value, maxsplit=1)[0].strip()
    value = re.split(r"\s+https?://", value, maxsplit=1)[0].strip()
    value = value.strip(" :\t\xa0")
    if not value:
        return None
    if value.lower() in {"unknown", "n/a", "na", "-", ":"}:
        return None
    return value


def _field_from_text(page_text: str, label: str) -> Optional[str]:
    # Do not let \\s cross into the next line (avoids Lyrics capturing Comments)
    pattern = rf"{re.escape(label)}[ \t]*:?[ \t]*([^\n|]+)"
    match = re.search(pattern, page_text, re.IGNORECASE)
    if not match:
        return None
    return _clean_value(match.group(1))


def _parse_rating(page_text: str) -> tuple[Optional[float], Optional[int]]:
    rating = None
    votes = None
    m = re.search(r"Rating:\s*([0-9]+(?:\.[0-9]+)?)\s*/\s*5", page_text, re.IGNORECASE)
    if m:
        rating = float(m.group(1))
    m = re.search(r"\(([0-9,]+)\s*votes?", page_text, re.IGNORECASE)
    if m:
        votes = int(m.group(1).replace(",", ""))
    return rating, votes


def _parse_arranger(soup: BeautifulSoup, page_text: str) -> Optional[str]:
    # Attributions section often has Arranger then name as following text
    for node in soup.find_all(string=re.compile(r"^\s*Arranger\s*$", re.IGNORECASE)):
        parent = node.parent
        # Walk forward in the attributions block
        for sibling in list(parent.next_siblings)[:6]:
            if isinstance(sibling, NavigableString):
                val = _clean_value(str(sibling))
                if val:
                    return sanitize_segment(val) and val or _clean_value(val)
            else:
                text = sibling.get_text(" ", strip=True)
                if not text or text.lower() == "arranger":
                    continue
                # Year: often follows; stop before Year
                text = re.split(r"\bYear\s*:", text, maxsplit=1)[0].strip()
                cleaned = _clean_value(text)
                if cleaned:
                    return cleaned
        # parent get_text after removing Arranger
        block = parent.parent.get_text("\n", strip=True) if parent.parent else ""
        for line in block.splitlines():
            if re.match(r"^\s*Arranger\s*$", line, re.IGNORECASE):
                continue
            if line.lower().startswith("arranger"):
                rest = re.sub(r"^\s*Arranger\s*", "", line, flags=re.IGNORECASE).strip()
                cleaned = _clean_value(rest)
                if cleaned:
                    return cleaned
            elif "year:" in line.lower() or "purchase" in line.lower():
                break
            else:
                cleaned = _clean_value(line)
                if cleaned and "www." not in cleaned.lower():
                    # likely the name line
                    return cleaned

    # Fallback regex on plain text near Arranger
    m = re.search(
        r"Arranger\s*\n\s*([^\n]+)",
        page_text,
        re.IGNORECASE,
    )
    if m:
        return _clean_value(m.group(1))
    return None


def _fldname_from_href(href: str) -> Optional[str]:
    parsed = urlparse(href)
    qs = parse_qs(parsed.query)
    values = qs.get("fldname") or qs.get("FldName")
    if values:
        return values[0]
    return None


def _classify_direct_media(href: str) -> Optional[tuple[str, str]]:
    """Return (part_key, kind) for direct tags/ media links."""
    lower = href.lower()
    path = urlparse(href).path
    ext = "." + path.rsplit(".", 1)[-1].lower() if "." in path else ""

    if GUIDELINES_PDF_NAME.lower() in lower or is_guidelines_url(href):
        return None

    if ext in AUDIO_EXTENSIONS or lower.endswith(".mp3"):
        for part in ("bass", "bari", "lead", "tenor"):
            if part in lower:
                return part, "audio"
        if "allparts" in lower or "all_parts" in lower or "mix" in lower:
            return "mix", "audio"
        return "mix", "audio"

    if ext in SHEET_EXTENSIONS:
        # Direct sheet under tags/
        if "/tags/" in lower or lower.startswith("tags/"):
            return "sheet", "sheet"
        # Non-tags pdf that isn't guidelines — ignore site chrome
        if ext == ".pdf":
            return None
        return "sheet", "sheet"

    return None


def collect_assets(soup: BeautifulSoup, tag_id: int) -> dict[str, dict[str, Any]]:
    """Discover downloadable assets keyed by part (bass/sheet/...)."""
    assets: dict[str, dict[str, Any]] = {}

    def add(part: str, *, url: str, original: str, fldname: Optional[str] = None, kind: str = "file"):
        if part in assets and assets[part].get("preferred"):
            return
        entry = {
            "url": absolute_url(url),
            "original_filename": original,
            "fldname": fldname,
            "kind": kind,
            "preferred": bool(fldname),
        }
        # Prefer dbaction fldname entries over bare guesses
        if part not in assets or (fldname and not assets[part].get("fldname")):
            assets[part] = entry

    for anchor in soup.find_all("a", href=True):
        href = anchor["href"].strip()
        lower = href.lower()

        if "dbaction.php" in lower and "downloadfile" in lower:
            fld = _fldname_from_href(href)
            if not fld:
                # Zip of all files
                assets.setdefault(
                    "_zip",
                    {
                        "url": absolute_url(href),
                        "original_filename": f"tag_{tag_id}_all.zip",
                        "fldname": None,
                        "kind": "zip",
                        "preferred": True,
                    },
                )
                continue
            # Normalize AllParts1 etc.
            base_fld = re.sub(r"\d+$", "", fld)
            part = PART_FLDNAMES.get(fld) or PART_FLDNAMES.get(base_fld)
            if not part:
                # try case-insensitive
                for key, val in PART_FLDNAMES.items():
                    if fld.lower().startswith(key.lower()):
                        part = val
                        break
            if part:
                add(
                    part,
                    url=href,
                    original=f"dbaction:{fld}",
                    fldname=fld,
                    kind="sheet" if part in {"sheet", "notation"} else "audio",
                )
            continue

        classified = _classify_direct_media(href)
        if not classified:
            continue
        part, kind = classified
        add(part, url=href, original=href, fldname=None, kind=kind)

    # Ensure canonical dbaction URLs exist when fldname known from page;
    # also seed SheetMusic URL as fallback even if only image link present.
    if "sheet" in assets and not assets["sheet"].get("fldname"):
        assets["sheet"]["dbaction_url"] = download_file_url(tag_id, "SheetMusic")
    elif "sheet" not in assets:
        # Many pages list SheetMusic fldname; if parser missed, still try later in assets.py
        pass

    return assets


def parse_tag_page(html: str, tag_id: int) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    page_text = soup.get_text("\n", strip=False)

    title_el = soup.find("h1")
    title = title_el.get_text(" ", strip=True) if title_el else None
    if title:
        title = title.replace("- Barbershop Tags", "").strip()

    not_found = bool(NOT_FOUND_RE.search(title or "")) or bool(NO_MATCH_RE.search(html))
    if title and NOT_FOUND_RE.search(title):
        not_found = True

    subtitle = None
    h2 = soup.find("h2")
    if h2:
        subtitle = h2.get_text(" ", strip=True) or None

    rating, votes = _parse_rating(page_text)

    key = _label_value(soup, "Key written in") or _field_from_text(page_text, "Key written in")
    if key and key.lower() == "unknown":
        key = None

    parts_count_raw = _label_value(soup, "How many parts") or _field_from_text(page_text, "How many parts")
    parts_count = None
    if parts_count_raw:
        m = re.search(r"\d+", parts_count_raw)
        if m:
            parts_count = int(m.group(0))

    tag_type = _label_value(soup, "Type") or _field_from_text(page_text, "Type")
    lyrics = _label_value(soup, "Lyrics") or _field_from_text(page_text, "Lyrics")
    comments = _label_value(soup, "Comments") or _field_from_text(page_text, "Comments")
    posted_by = _label_value(soup, "Posted By") or _field_from_text(page_text, "Posted By")
    if posted_by:
        posted_by = re.split(r"\s*\|\s*|More from", posted_by, maxsplit=1)[0].strip()
    date_posted = _label_value(soup, "Date Posted") or _field_from_text(page_text, "Date Posted")
    collection = _label_value(soup, "Collection") or _field_from_text(page_text, "Collection")

    arranger = _parse_arranger(soup, page_text)
    if arranger:
        arranger = sanitize_segment(arranger) and _clean_value(arranger)
        # sanitize_segment returns cleaned or None; prefer cleaned display form
        cleaned = sanitize_segment(arranger)
        arranger = cleaned

    year = None
    ymatch = re.search(r"Year:\s*(\d{4})", page_text, re.IGNORECASE)
    if ymatch:
        year = int(ymatch.group(1))

    made_famous = _label_value(soup, "Made famous by") or _field_from_text(page_text, "Made famous by")
    learning = _label_value(soup, "Learning tracks sung by") or _field_from_text(
        page_text, "Learning tracks sung by"
    )
    if learning:
        learning = re.split(r"\s+www\.", learning, maxsplit=1)[0].strip()
        learning = sanitize_segment(learning)

    fav = None
    fmatch = re.search(r"Favorited\s+(\d+)\s+times?", page_text, re.IGNORECASE)
    if fmatch:
        fav = int(fmatch.group(1))

    dmatch = re.search(r"Downloaded\s+([0-9,]+)\s+times?", page_text, re.IGNORECASE)
    download_count = int(dmatch.group(1).replace(",", "")) if dmatch else None

    assets = collect_assets(soup, tag_id)

    status = "not_found" if not_found else "ok"
    if not_found:
        title = None

    keywords = keyword_tokens(
        title,
        subtitle,
        key,
        arranger,
        tag_type,
        posted_by,
        lyrics,
        comments,
        collection,
        learning,
        made_famous,
        str(tag_id),
    )

    return {
        "tag_id": tag_id,
        "source_url": tag_page_url(tag_id),
        "status": status,
        "title": title,
        "subtitle": subtitle,
        "key": key,
        "arranger": arranger,
        "arranger_source": "html" if arranger else None,
        "year": year,
        "parts_count": parts_count,
        "type": tag_type,
        "collection": collection,
        "posted_by": posted_by,
        "learning_tracks_by": learning,
        "made_famous_by": made_famous if made_famous and made_famous.lower() != "unknown" else None,
        "rating": rating,
        "votes": votes,
        "favorites": fav,
        "date_posted": date_posted,
        "download_count": download_count,
        "lyrics": lyrics,
        "comments": comments,
        "keywords": keywords,
        "discovered_assets": assets,
    }
