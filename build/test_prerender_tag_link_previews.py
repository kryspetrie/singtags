"""Unit tests for tag Open Graph / link-preview prerender."""

from __future__ import annotations

from pathlib import Path

from prerender_tag_link_previews import (
    build_tag_link_preview_head,
    inject_link_preview,
    prerender_tag_link_previews,
    tag_og_image_url,
    tag_share_description,
    tag_share_title,
)

SMILE = {
    "tag_id": 1,
    "title": "Smile",
    "arranger": "Bobby Gray, Jr",
    "key": "G Major",
    "year": 1986,
    "type": "Barbershop",
    "collection": "classic",
    "classic": "13",
    "sheet_preview": "Folder/Smile%20Preview.webp",
}


def test_share_title_and_description():
    assert tag_share_title(SMILE) == "Smile"
    assert tag_share_description(SMILE) == (
        "Arranged by Bobby Gray, Jr · G Major · 1986 · Classic #13 · Barbershop"
    )


def test_og_image_uses_webp_preview():
    url = tag_og_image_url(
        SMILE, origin="https://www.singtags.com", media_base="/library"
    )
    assert url == (
        "https://www.singtags.com/library/Folder/Smile%20Preview.webp"
    )


def test_og_image_prefers_sheet_og_over_preview():
    meta = {
        **SMILE,
        "sheet_og": "Folder/Smile%20OG.webp",
        "sheet_preview": "Folder/Smile%20Preview.webp",
    }
    url = tag_og_image_url(
        meta, origin="https://www.singtags.com", media_base="/library"
    )
    assert url == "https://www.singtags.com/library/Folder/Smile%20OG.webp"


def test_og_image_skips_pdf_path():
    meta = {**SMILE, "sheet_preview": "Folder/sheet.pdf"}
    assert (
        tag_og_image_url(
            meta, origin="https://www.singtags.com", media_base="/library"
        )
        is None
    )


def test_description_appends_lyrics_when_no_image():
    meta = {
        **SMILE,
        "sheet_preview": None,
        "lyrics": "Smile, though your heart is aching",
    }
    desc = tag_share_description(meta)
    assert desc.startswith("Arranged by Bobby Gray, Jr")
    assert "Smile, though your heart is aching" in desc
    # With an image, keep description short (no lyrics).
    assert "aching" not in tag_share_description(SMILE)


def test_head_snippet_escapes_and_includes_image():
    meta = {**SMILE, "title": 'Smile & "Grin"'}
    head = build_tag_link_preview_head(
        meta, origin="https://www.singtags.com", media_base="/library"
    )
    assert "Smile &amp; &quot;Grin&quot;" in head
    assert 'property="og:title"' in head
    assert 'property="og:image"' in head
    assert 'name="twitter:card" content="summary_large_image"' in head
    assert 'content="Arranged by Bobby Gray, Jr' in head


def test_head_without_image_uses_summary_card():
    meta = {**SMILE, "sheet_preview": None}
    head = build_tag_link_preview_head(meta)
    assert 'name="twitter:card" content="summary"' in head
    assert "og:image" not in head


def test_inject_and_prerender(tmp_path: Path):
    index = tmp_path / "index.html"
    index.write_text(
        "<!doctype html><html><head>"
        "<title>SingTags</title>"
        '<meta property="og:title" content="SingTags" />'
        '<meta name="description" content="Shell" />'
        "</head><body><div id='app'></div></body></html>\n",
        encoding="utf-8",
    )
    tags = tmp_path / "tags" / "1"
    tags.mkdir(parents=True)
    (tags / "metadata.json").write_text(
        '{"tag_id":1,"title":"Smile","arranger":"Ada","sheet_preview":"a.webp"}',
        encoding="utf-8",
    )
    out = tmp_path / "tag-previews"
    n = prerender_tag_link_previews(
        index_html_path=index,
        tags_dir=tmp_path / "tags",
        out_dir=out,
        origin="https://www.singtags.com",
        media_base="/library",
    )
    assert n == 1
    page = (out / "1").read_text(encoding="utf-8")
    assert page.count("<title>") == 1
    assert "<title>Smile · SingTags</title>" in page
    assert 'property="og:url" content="https://www.singtags.com/tag/1"' in page
    assert "og:image" in page
    # Shell defaults must not win Discord's "first tag wins" rule.
    assert 'property="og:title" content="SingTags"' not in page
    assert 'content="Shell"' not in page

    # Re-inject is idempotent (marker replaced, not stacked).
    from prerender_tag_link_previews import MARKER_START

    again = inject_link_preview(page, build_tag_link_preview_head(SMILE))
    assert again.count(MARKER_START) == 1
