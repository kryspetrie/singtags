#!/usr/bin/env python3
"""Build offline pack manifests (sheets + audio) for progressive PWA caching."""

from __future__ import annotations

import argparse
import gzip
import json
from datetime import datetime, timezone
from pathlib import Path


def file_size(sample: Path, rel: str) -> int:
    p = sample / rel
    try:
        return p.stat().st_size if p.is_file() else 0
    except OSError:
        return 0


def build(sample: Path, out: Path) -> None:
    tags_dir = sample / "tags"
    sheet_entries: list[dict] = []
    audio_entries: list[dict] = []
    sheet_total = 0
    audio_total = 0

    for meta_path in sorted(tags_dir.glob("*/metadata.json")):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        tid = meta.get("tag_id")
        if not isinstance(tid, int):
            continue

        pages = meta.get("sheet_pages")
        if not isinstance(pages, list):
            pages = []
        page_paths = [p for p in pages if isinstance(p, str)]
        detail_rel = f"tags/{tid}/metadata.json"
        preview = meta.get("sheet_preview")
        if isinstance(preview, str) and preview:
            cache_paths = [preview]
            bytes_sheets = file_size(sample, preview) + file_size(sample, detail_rel)
        elif page_paths:
            cache_paths = page_paths
            bytes_sheets = sum(file_size(sample, p) for p in page_paths) + file_size(
                sample, detail_rel
            )
        else:
            cache_paths = []
            bytes_sheets = 0
        if cache_paths:
            sheet_entries.append(
                {
                    "tagId": tid,
                    "paths": cache_paths,
                    "bytes": bytes_sheets,
                    "detailPath": detail_rel,
                }
            )
            sheet_total += bytes_sheets

        audio = meta.get("audio") or {}
        audio_tiers = meta.get("audio_tiers") or {}
        layout = meta.get("audio_layout_summary") or {}
        ultra_policy = layout.get("ultra_low") if isinstance(layout, dict) else None

        # Prefer ultra-low pack paths when seeded; fall back to originals.
        audio_paths: list[str] = []
        if isinstance(audio_tiers, dict) and audio_tiers:
            for part, tiers in audio_tiers.items():
                if not isinstance(tiers, dict):
                    continue
                chosen = None
                if ultra_policy == "mono_solos":
                    if part == "mix" and layout.get("mix_disjoint"):
                        chosen = tiers.get("ultra_mix") or tiers.get("ultra_stereo")
                    else:
                        # Voice solos only — mix is reconstructed client-side.
                        chosen = tiers.get("ultra_solo")
                elif ultra_policy == "mono_downmix":
                    chosen = tiers.get("ultra_downmix")
                elif part == "mix" and tiers.get("ultra_mix"):
                    # Mix-only tags (often labeled stereo_fallback with only mix).
                    chosen = tiers.get("ultra_mix")
                elif ultra_policy == "stereo_fallback":
                    chosen = tiers.get("ultra_stereo")
                if not chosen and ultra_policy not in {
                    "mono_solos",
                    "mono_downmix",
                    "stereo_fallback",
                }:
                    chosen = tiers.get("playback") or tiers.get("original")
                if isinstance(chosen, str):
                    audio_paths.append(chosen)
        elif isinstance(audio, dict):
            audio_paths = [p for p in audio.values() if isinstance(p, str)]

        bytes_audio = sum(file_size(sample, p) for p in audio_paths)
        if audio_paths:
            entry = {
                "tagId": tid,
                "paths": audio_paths,
                "bytes": bytes_audio,
            }
            if isinstance(ultra_policy, str):
                entry["ultraLow"] = ultra_policy
            audio_entries.append(entry)
            audio_total += bytes_audio

    out.mkdir(parents=True, exist_ok=True)
    built_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def write_gz(name: str, payload: object) -> None:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        path = out / name
        with gzip.open(path, "wb", compresslevel=9) as fh:
            fh.write(raw)
        print(f"  {name}: {len(raw)} bytes → {path.stat().st_size} gzip")

    write_gz(
        "offline-sheets.json.gz",
        {
            "version": 1,
            "kind": "sheets",
            "builtAt": built_at,
            "totalBytes": sheet_total,
            "entries": sheet_entries,
        },
    )
    write_gz(
        "offline-audio.json.gz",
        {
            "version": 1,
            "kind": "audio",
            "builtAt": built_at,
            "totalBytes": audio_total,
            "entries": audio_entries,
        },
    )
    print(
        f"Wrote offline manifests: {len(sheet_entries)} sheet tags "
        f"({sheet_total} B), {len(audio_entries)} audio tags ({audio_total} B) → {out}"
    )


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--sample",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "sample-data",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "web" / "public" / "indexes",
    )
    args = p.parse_args()
    build(args.sample, args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
