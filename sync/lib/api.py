"""Official barbershoptags.com XML API — bulk metadata export.

The origin DB has no indexes; every query is a full table scan. Prefer ONE request
with a huge page size (n≈50000) over many small requests or per-tag HTML pages.

  GET /api.php?n=50000&client=TagsMirror

File downloads via dbaction.php remain fine; only metadata listing must be bulk.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Any, Optional
from xml.etree.ElementTree import Element

from .config import API_BULK_N, API_CLIENT, API_URL, BASE_URL, STATE_DIR
from .http import fetch_with_retry
from .identity import ensure_identity_fields, normalize_writ_key
from .names import keyword_tokens, sanitize_segment
from .parse_tag_page import download_file_url
from .state import save_json, state_path


def api_bulk_url(n: int = API_BULK_N, start: int = 1) -> str:
    return f"{API_URL}?n={int(n)}&start={int(start)}&client={API_CLIENT}"


def _text(el: Optional[Element]) -> Optional[str]:
    if el is None or el.text is None:
        return None
    value = unescape(el.text).strip()
    return value or None


def _child(parent: Element, name: str) -> Optional[Element]:
    return parent.find(name)


def _attr(el: Optional[Element], name: str) -> Optional[str]:
    if el is None:
        return None
    value = el.attrib.get(name)
    return value.strip() if value else None


def _int(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(str(value).replace(",", "").strip())
    except ValueError:
        return None


def _float(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(str(value).strip())
    except ValueError:
        return None


def _asset_entry(
    el: Optional[Element],
    *,
    part: str,
    fldname: Optional[str],
    kind: str,
) -> Optional[dict[str, Any]]:
    url = _text(el)
    if not url:
        return None
    return {
        "url": url,
        "original_filename": f"dbaction:{fldname}" if fldname else url,
        "fldname": fldname,
        "kind": kind,
        "preferred": True,
        "type": _attr(el, "type"),
    }


def parse_tag_element(tag_el: Element) -> dict[str, Any]:
    """Map one <tag> XML element into our metadata shape (+ full remote_* fields)."""
    tag_id = _int(_text(_child(tag_el, "id")))
    title = _text(_child(tag_el, "Title"))
    alt_title = _text(_child(tag_el, "AltTitle"))
    version = _text(_child(tag_el, "Version"))
    writ_key = _text(_child(tag_el, "WritKey"))
    key = normalize_writ_key(writ_key)
    parts_count = _int(_text(_child(tag_el, "Parts")))
    tag_type = _text(_child(tag_el, "Type"))
    recording = _text(_child(tag_el, "Recording"))
    teach_vid = _text(_child(tag_el, "TeachVid"))
    lyrics = _text(_child(tag_el, "Lyrics"))
    notes = _text(_child(tag_el, "Notes"))
    arranger = sanitize_segment(_text(_child(tag_el, "Arranger")))
    arranger_website = _text(_child(tag_el, "ArrWebsite"))
    arranged = _int(_text(_child(tag_el, "Arranged")))
    sung_by = _text(_child(tag_el, "SungBy"))
    sung_website = _text(_child(tag_el, "SungWebsite"))
    sung_year = _int(_text(_child(tag_el, "SungYear")))
    quartet = sanitize_segment(_text(_child(tag_el, "Quartet")))
    quartet_website = _text(_child(tag_el, "QWebsite"))
    teacher = _text(_child(tag_el, "Teacher"))
    teacher_website = _text(_child(tag_el, "TWebsite"))
    provider = _text(_child(tag_el, "Provider"))
    provider_website = _text(_child(tag_el, "ProvWebsite"))
    posted = _text(_child(tag_el, "Posted"))
    classic = _text(_child(tag_el, "Classic"))
    collection = _text(_child(tag_el, "Collection"))
    rating = _float(_text(_child(tag_el, "Rating")))
    rating_count = _int(_text(_child(tag_el, "RatingCount")))
    downloaded = _int(_text(_child(tag_el, "Downloaded")))
    stamp = _text(_child(tag_el, "stamp"))
    sheet_alt = _text(_child(tag_el, "SheetMusicAlt"))

    sheet_el = _child(tag_el, "SheetMusic")
    notation_el = _child(tag_el, "Notation")
    mix_el = _child(tag_el, "AllParts")
    bass_el = _child(tag_el, "Bass")
    bari_el = _child(tag_el, "Bari")
    lead_el = _child(tag_el, "Lead")
    tenor_el = _child(tag_el, "Tenor")
    other_els = [(_child(tag_el, f"Other{i}"), f"Other{i}") for i in range(1, 5)]

    assets: dict[str, dict[str, Any]] = {}
    for el, part, fld, kind in (
        (sheet_el, "sheet", "SheetMusic", "sheet"),
        (notation_el, "notation", "Notation", "sheet"),
        (mix_el, "mix", "AllParts", "audio"),
        (bass_el, "bass", "Bass", "audio"),
        (bari_el, "bari", "Bari", "audio"),
        (lead_el, "lead", "Lead", "audio"),
        (tenor_el, "tenor", "Tenor", "audio"),
    ):
        entry = _asset_entry(el, part=part, fldname=fld, kind=kind)
        if entry:
            if part == "sheet" and sheet_alt:
                entry["alt_url"] = sheet_alt
            assets[part] = entry

    for el, fld in other_els:
        entry = _asset_entry(el, part=fld.lower(), fldname=fld, kind="audio")
        if entry:
            assets[fld.lower()] = entry

    if tag_id is not None:
        assets.setdefault(
            "_zip",
            {
                "url": download_file_url(tag_id),
                "original_filename": f"tag_{tag_id}_all.zip",
                "fldname": None,
                "kind": "zip",
                "preferred": True,
            },
        )

    videos: list[dict[str, Any]] = []
    videos_el = _child(tag_el, "videos")
    if videos_el is not None:
        for video_el in videos_el.findall("video"):
            videos.append(
                {
                    "id": _int(_text(_child(video_el, "id"))),
                    "desc": _text(_child(video_el, "Desc")),
                    "sung_key": normalize_writ_key(_text(_child(video_el, "SungKey"))),
                    "multitrack": _text(_child(video_el, "Multitrack")),
                    "code": _text(_child(video_el, "Code")),
                    "sung_by": _text(_child(video_el, "SungBy")),
                    "sung_website": _text(_child(video_el, "SungWebsite")),
                    "posted": _text(_child(video_el, "Posted")),
                }
            )

    # Full remote payload (preserve every API field we saw)
    remote: dict[str, Any] = {
        "id": tag_id,
        "Title": title,
        "AltTitle": alt_title,
        "Version": version,
        "WritKey": writ_key,
        "Parts": parts_count,
        "Type": tag_type,
        "Recording": recording,
        "TeachVid": teach_vid,
        "Lyrics": lyrics,
        "Notes": notes,
        "Arranger": arranger,
        "ArrWebsite": arranger_website,
        "Arranged": arranged,
        "SungBy": sung_by,
        "SungWebsite": sung_website,
        "SungYear": sung_year,
        "Quartet": quartet,
        "QWebsite": quartet_website,
        "Teacher": teacher,
        "TWebsite": teacher_website,
        "Provider": provider,
        "ProvWebsite": provider_website,
        "Posted": posted,
        "Classic": classic,
        "Collection": collection,
        "Rating": rating,
        "RatingCount": rating_count,
        "Downloaded": downloaded,
        "stamp": stamp,
        "SheetMusicAlt": sheet_alt,
        "SheetMusic": _text(sheet_el),
        "SheetMusic_type": _attr(sheet_el, "type"),
        "Notation": _text(notation_el),
        "AllParts": _text(mix_el),
        "Bass": _text(bass_el),
        "Bari": _text(bari_el),
        "Lead": _text(lead_el),
        "Tenor": _text(tenor_el),
        "Other1": _text(_child(tag_el, "Other1")),
        "Other2": _text(_child(tag_el, "Other2")),
        "Other3": _text(_child(tag_el, "Other3")),
        "Other4": _text(_child(tag_el, "Other4")),
        "videos": videos,
    }

    keywords = keyword_tokens(
        title,
        alt_title,
        version,
        key,
        arranger,
        tag_type,
        provider,
        lyrics,
        notes,
        collection,
        quartet,
        sung_by,
        str(tag_id) if tag_id is not None else None,
    )

    meta: dict[str, Any] = {
        "tag_id": tag_id,
        "source_url": (
            f"{BASE_URL}/dbpage.php?pg=view&dbase=tags&id={tag_id}" if tag_id else None
        ),
        "status": "ok",
        "title": title,
        "alt_title": alt_title,
        "subtitle": alt_title,  # legacy alias used by older code
        "version": version,
        "key": key,
        "writ_key": writ_key,
        "arranger": arranger,
        "arranger_source": "api" if arranger else None,
        "arranger_website": arranger_website,
        "year": arranged,
        "parts_count": parts_count,
        "type": tag_type,
        "recording": recording,
        "teach_vid": teach_vid,
        "collection": collection,
        "classic": classic,
        "posted_by": provider,
        "provider": provider,
        "provider_website": provider_website,
        "learning_tracks_by": quartet,
        "quartet_website": quartet_website,
        "teacher": teacher,
        "teacher_website": teacher_website,
        "made_famous_by": sung_by if sung_by and sung_by.lower() != "unknown" else None,
        "sung_website": sung_website,
        "sung_year": sung_year,
        "rating": rating,
        "votes": rating_count,
        "rating_count": rating_count,
        "date_posted": posted,
        "download_count": downloaded,
        "stamp": stamp,  # remote last-updated (rating/downloads bump this)
        "last_updated_remote": stamp,
        "sheet_alt_url": sheet_alt,
        "lyrics": lyrics,
        "comments": notes,
        "notes": notes,
        "keywords": keywords,
        "discovered_assets": assets,
        "videos": videos,
        "remote": remote,
        "metadata_source": "api",
    }
    ensure_identity_fields(meta)
    return meta


def parse_api_xml(xml_text: str) -> dict[str, Any]:
    """Parse full API document → {available, count, stamp, tags: [...]}."""
    root = ET.fromstring(xml_text)
    if root.tag != "tags":
        raise ValueError(f"Unexpected API root element: {root.tag}")
    available = _int(root.attrib.get("available"))
    count = _int(root.attrib.get("count"))
    stamp = root.attrib.get("stamp")
    tags = [parse_tag_element(el) for el in root.findall("tag")]
    return {
        "available": available,
        "count": count if count is not None else len(tags),
        "stamp": stamp,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "tags": tags,
    }


def fetch_all_tags(
    *,
    n: int = API_BULK_N,
    save_raw: bool = True,
    timeout: float = 300.0,
) -> Optional[dict[str, Any]]:
    """One-shot bulk export. Returns parsed payload or None on HTTP failure.

    Uses a long timeout — the response can be tens of MB of XML.
    """
    url = api_bulk_url(n=n)
    print(f"Bulk API export: {url}")
    response = fetch_with_retry(url, max_retries=2, timeout=timeout)
    if response is None or response.status_code != 200:
        status = response.status_code if response is not None else "transport"
        print(f"   Bulk API failed (HTTP {status})")
        return None

    xml_text = response.text
    if save_raw:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        raw_path = state_path("remote_export.xml")
        raw_path.write_text(xml_text, encoding="utf-8")
        print(f"   Saved raw export → {raw_path} ({len(xml_text):,} chars)")

    parsed = parse_api_xml(xml_text)
    available = parsed.get("available") or 0
    got = len(parsed["tags"])
    print(f"   Parsed {got} tag(s) (available={available}, stamp={parsed.get('stamp')})")
    if available and got < available:
        print(
            f"   WARNING: got {got} < available {available} — "
            f"raise n (current n={n}) and retry"
        )

    # Compact JSON index for tooling (without embedding giant remote blobs twice)
    index = {
        "fetched_at": parsed["fetched_at"],
        "stamp": parsed.get("stamp"),
        "available": available,
        "count": got,
        "tags": [
            {
                "tag_id": t.get("tag_id"),
                "identity_key": t.get("identity_key"),
                "identity_hash": t.get("identity_hash"),
                "title": t.get("title"),
                "arranger": t.get("arranger"),
                "key": t.get("key"),
                "version": t.get("version"),
                "stamp": t.get("stamp"),
                "download_count": t.get("download_count"),
                "rating": t.get("rating"),
            }
            for t in parsed["tags"]
        ],
    }
    save_json(state_path("remote_export_index.json"), index)
    return parsed


def load_cached_export(xml_path: Optional[Path] = None) -> Optional[dict[str, Any]]:
    path = xml_path or state_path("remote_export.xml")
    if not path.exists():
        return None
    return parse_api_xml(path.read_text(encoding="utf-8"))
