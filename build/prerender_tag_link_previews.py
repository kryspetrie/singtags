#!/usr/bin/env python3
"""Prerender /tag/{id} HTML shells with Open Graph tags for Discord/Slack/etc.

Discordbot does not execute JavaScript, so SPA-injected <meta> never appears in
link previews. After `vite build`, this copies dist/index.html once per tag and
injects title/description/image from web/public/tags/{id}/metadata.json, writing
extensionless files under dist/tag-previews/{id}. website_s3.sh syncs that tree
to s3://…/tag/{id} (Content-Type text/html) so GET /tag/123 returns real OG HTML
while still booting the Vue app for humans.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TAGS = ROOT / "web" / "public" / "tags"
DEFAULT_INDEX = ROOT / "web" / "dist" / "index.html"
DEFAULT_OUT = ROOT / "web" / "dist" / "tag-previews"
DEFAULT_ORIGIN = "https://www.singtags.com"
DEFAULT_MEDIA_BASE = "/library"

MARKER_START = "<!-- singtags:tag-link-preview -->"
MARKER_END = "<!-- /singtags:tag-link-preview -->"

COLLECTION_LABELS = {
    "classic": "Classic",
    "sai": "SAI",
    "bhs": "BHS",
    "sweet_adelines": "Sweet Adelines",
}


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def text(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def collection_label(collection: Any, classic: Any) -> str | None:
    raw = text(collection)
    if not raw:
        return None
    label = COLLECTION_LABELS.get(raw.lower(), raw)
    num = text(classic)
    if num and raw.lower() == "classic":
        return f"Classic #{num}"
    if num:
        return f"{label} #{num}"
    return label


def tag_share_title(meta: dict[str, Any]) -> str:
    title = text(meta.get("title")) or f"Tag {meta.get('tag_id', '')}".strip()
    return title


def is_preview_image_path(path: str) -> bool:
    clean = path.split("?", 1)[0].lower()
    return clean.endswith((".webp", ".png", ".jpg", ".jpeg", ".gif"))


def absolute_url(origin: str, path: str) -> str:
    origin = origin.rstrip("/")
    if path.startswith("http://") or path.startswith("https://"):
        return path
    if not path.startswith("/"):
        path = "/" + path
    return origin + path


def media_absolute_url(origin: str, media_base: str, rel: str) -> str:
    base = media_base.rstrip("/") or "/library"
    if not base.startswith("/") and not base.startswith("http"):
        base = "/" + base
    if base.startswith("http://") or base.startswith("https://"):
        return f"{base.rstrip('/')}/{rel.lstrip('/')}"
    return absolute_url(origin, f"{base}/{rel.lstrip('/')}")


def lyrics_excerpt(meta: dict[str, Any], *, max_chars: int = 180) -> str | None:
    raw = text(meta.get("lyrics"))
    if not raw:
        return None
    one_line = " ".join(raw.split())
    if len(one_line) <= max_chars:
        return one_line
    cut = one_line[: max_chars - 1].rsplit(" ", 1)[0].rstrip(",;:")
    return (cut or one_line[: max_chars - 1]) + "…"


def tag_share_description(meta: dict[str, Any], *, include_lyrics_fallback: bool = True) -> str:
    parts: list[str] = []
    arranger = text(meta.get("arranger"))
    if arranger:
        parts.append(f"Arranged by {arranger}")
    key = text(meta.get("key"))
    if key:
        parts.append(key)
    year = meta.get("year")
    if isinstance(year, (int, float)) or (isinstance(year, str) and year.strip().isdigit()):
        parts.append(str(int(year)))
    coll = collection_label(meta.get("collection"), meta.get("classic"))
    if coll:
        parts.append(coll)
    typ = text(meta.get("type"))
    if typ:
        parts.append(typ)
    base = " · ".join(parts) if parts else "Barbershop tag on SingTags"
    # When there is no raster thumb, surface lyrics in the text card.
    if include_lyrics_fallback and not tag_has_og_image(meta):
        excerpt = lyrics_excerpt(meta)
        if excerpt:
            return f"{base} — {excerpt}"
    return base


def tag_has_og_image(meta: dict[str, Any]) -> bool:
    for key in ("sheet_og", "sheet_preview"):
        path = text(meta.get(key))
        if path and is_preview_image_path(path):
            return True
    return False


def tag_og_image_url(
    meta: dict[str, Any],
    *,
    origin: str,
    media_base: str,
) -> str | None:
    # Prefer tiny dedicated OG thumb; fall back to display sheet_preview.
    for key in ("sheet_og", "sheet_preview"):
        path = text(meta.get(key))
        if path and is_preview_image_path(path):
            return media_absolute_url(origin, media_base, path)
    return None


def build_tag_link_preview_head(
    meta: dict[str, Any],
    *,
    origin: str = DEFAULT_ORIGIN,
    media_base: str = DEFAULT_MEDIA_BASE,
) -> str:
    """Return HTML comment-wrapped <meta>/<link>/<title> for one tag."""
    tid = meta.get("tag_id")
    if tid is None:
        raise ValueError("meta.tag_id is required")
    title = tag_share_title(meta)
    image_url = tag_og_image_url(meta, origin=origin, media_base=media_base)
    description = tag_share_description(
        meta, include_lyrics_fallback=image_url is None
    )
    page_url = absolute_url(origin, f"/tag/{tid}")
    card = "summary_large_image" if image_url else "summary"
    site_title = f"{title} · SingTags"

    lines = [
        MARKER_START,
        f"<title>{esc(site_title)}</title>",
        f'<meta name="description" content="{esc(description)}" />',
        f'<link rel="canonical" href="{esc(page_url)}" />',
        '<meta property="og:type" content="website" />',
        f'<meta property="og:site_name" content="{esc("SingTags")}" />',
        f'<meta property="og:title" content="{esc(title)}" />',
        f'<meta property="og:description" content="{esc(description)}" />',
        f'<meta property="og:url" content="{esc(page_url)}" />',
        f'<meta name="twitter:card" content="{esc(card)}" />',
        f'<meta name="twitter:title" content="{esc(title)}" />',
        f'<meta name="twitter:description" content="{esc(description)}" />',
    ]
    if image_url:
        lines.extend(
            [
                f'<meta property="og:image" content="{esc(image_url)}" />',
                f'<meta property="og:image:secure_url" content="{esc(image_url)}" />',
                '<meta property="og:image:type" content="image/webp" />',
                f'<meta name="twitter:image" content="{esc(image_url)}" />',
            ]
        )
    arranger = text(meta.get("arranger"))
    if arranger:
        # oEmbed-style author line some clients (incl. Discord) surface.
        lines.append(f'<meta name="author" content="{esc(arranger)}" />')
    lines.append(MARKER_END)
    return "\n    ".join(lines)


_TITLE_RE = re.compile(r"<title>.*?</title>", re.IGNORECASE | re.DOTALL)
_MARKER_BLOCK_RE = re.compile(
    re.escape(MARKER_START) + r".*?" + re.escape(MARKER_END),
    re.IGNORECASE | re.DOTALL,
)
# Discord takes the *first* og:title / description — strip shell defaults so the
# tag block wins whether it sits before or after remaining head tags.
_SHELL_SHARE_META_RE = re.compile(
    r"[ \t]*<meta\s+(?:[^>]*\b(?:property|name)=[\"'](?:og:title|og:description|og:url|og:image|og:image:secure_url|og:image:type|og:type|twitter:card|twitter:title|twitter:description|twitter:image|description)[\"'][^>]*)>\s*",
    re.IGNORECASE,
)


def inject_link_preview(index_html: str, head_snippet: str) -> str:
    """Replace prior preview block (if any) and set <title>; insert after <head>."""
    html_out = _MARKER_BLOCK_RE.sub("", index_html)
    # Drop the generic shell title + share metas; preview snippet replaces them.
    html_out = _TITLE_RE.sub("", html_out, count=1)
    html_out = _SHELL_SHARE_META_RE.sub("", html_out)
    open_head = re.search(r"<head[^>]*>", html_out, flags=re.IGNORECASE)
    if not open_head:
        raise ValueError("index.html has no <head>")
    insert = f"\n    {head_snippet}\n"
    at = open_head.end()
    return html_out[:at] + insert + html_out[at:]


def load_tag_metas(tags_dir: Path) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for path in sorted(tags_dir.glob("*/metadata.json"), key=lambda p: int(p.parent.name)):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict) or data.get("tag_id") is None:
            continue
        out.append(data)
    return out


def prerender_tag_link_previews(
    *,
    index_html_path: Path,
    tags_dir: Path,
    out_dir: Path,
    origin: str = DEFAULT_ORIGIN,
    media_base: str = DEFAULT_MEDIA_BASE,
) -> int:
    index_html = index_html_path.read_text(encoding="utf-8")
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    count = 0
    for meta in load_tag_metas(tags_dir):
        tid = int(meta["tag_id"])
        snippet = build_tag_link_preview_head(
            meta, origin=origin, media_base=media_base
        )
        page = inject_link_preview(index_html, snippet)
        # Extensionless object key → GET /tag/{id} on S3 website hosting.
        (out_dir / str(tid)).write_text(page, encoding="utf-8")
        count += 1
    return count


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--index", type=Path, default=DEFAULT_INDEX)
    p.add_argument("--tags", type=Path, default=DEFAULT_TAGS)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--origin", default=DEFAULT_ORIGIN)
    p.add_argument(
        "--media-base",
        default=None,
        help="Library URL prefix (default: $VITE_MEDIA_BASE or /library)",
    )
    args = p.parse_args(argv)

    if not args.index.is_file():
        print(f"Missing Vite index.html at {args.index}", file=sys.stderr)
        return 1
    if not args.tags.is_dir():
        print(f"Missing tags dir at {args.tags} — run build_indexes.py first.", file=sys.stderr)
        return 1

    media_base = args.media_base or __import__("os").environ.get(
        "VITE_MEDIA_BASE", DEFAULT_MEDIA_BASE
    )
    origin = __import__("os").environ.get("SITE_ORIGIN", args.origin)

    n = prerender_tag_link_previews(
        index_html_path=args.index,
        tags_dir=args.tags,
        out_dir=args.out,
        origin=origin,
        media_base=media_base,
    )
    print(f"Wrote {n} tag link-preview shells → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
