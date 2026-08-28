"""Tests for publishable-media heuristics (deleted / empty origin tags)."""

from __future__ import annotations

import json
from pathlib import Path

from lib.complete import has_usable_media, remote_advertises_media


def test_remote_advertises_media_ignores_zip_only():
    assert not remote_advertises_media({"discovered_assets": {"_zip": {"url": "http://x"}}})
    assert remote_advertises_media(
        {"discovered_assets": {"sheet": {"url": "http://sheet"}, "_zip": {"url": "http://z"}}}
    )
    assert remote_advertises_media({"discovered_assets": {"lead": {"url": "http://a"}}})


def test_has_usable_media_requires_sheet_or_audio(tmp_path: Path):
    meta = {"tag_id": 1, "title": "Empty", "parts": {}, "status": "missing_assets"}
    (tmp_path / "metadata.json").write_text(json.dumps(meta), encoding="utf-8")
    assert not has_usable_media(tmp_path, meta)

    sheet = tmp_path / "Sheet.pdf"
    sheet.write_bytes(b"%PDF-1.4")
    meta["parts"] = {"sheet": {"filename": "Sheet.pdf"}}
    assert has_usable_media(tmp_path, meta)

    sheet.unlink()
    assert not has_usable_media(tmp_path, meta)

    audio = tmp_path / "Lead.mp3"
    audio.write_bytes(b"ID3")
    assert has_usable_media(tmp_path, meta)
