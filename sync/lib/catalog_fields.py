"""Compact catalog fields shared by build_catalog and Lambda catalog patch."""

from __future__ import annotations

from typing import Any, Optional


def compact_part_lyrics(meta: dict) -> Optional[dict[str, dict[str, Any]]]:
    """Per-part {text, model} only — drop raw and other ASR bookkeeping."""
    raw = meta.get("part_lyrics") or {}
    if not isinstance(raw, dict) or not raw:
        return None
    out: dict[str, dict[str, Any]] = {}
    for part, entry in raw.items():
        key = str(part).lower()
        if isinstance(entry, dict):
            text = entry.get("text")
            if not isinstance(text, str) or not text.strip():
                continue
            row: dict[str, Any] = {"text": text.strip()}
            model = entry.get("model")
            if isinstance(model, str) and model.strip():
                row["model"] = model.strip()
            out[key] = row
        elif isinstance(entry, str) and entry.strip():
            out[key] = {"text": entry.strip()}
    return out or None
