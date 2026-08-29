#!/usr/bin/env python3
"""Restore arranger credits from remote_export.xml (preserve co-arranger commas).

Path sanitization used to strip commas from Arranger into metadata.json, which
broke multi-arranger filter facets. After normalize_arranger is in place:

  python3 sync/mirror/repair_arrangers.py
  python3 build/build_indexes.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "sync"))

from lib.names import normalize_arranger  # noqa: E402


def load_api_arrangers(export_xml: Path) -> dict[int, str]:
    text = export_xml.read_text(encoding="utf-8", errors="replace")
    out: dict[int, str] = {}
    for block in re.finditer(r"<tag\b[\s\S]*?</tag>", text):
        chunk = block.group(0)
        id_m = re.search(r"<id>(\d+)</id>", chunk)
        arr_m = re.search(r"<Arranger>([^<]*)</Arranger>", chunk)
        if not id_m or not arr_m:
            continue
        tid = int(id_m.group(1))
        raw = arr_m.group(1).strip()
        if not raw:
            continue
        cleaned = normalize_arranger(raw)
        if cleaned:
            out[tid] = cleaned
    return out


def tag_id_of(meta: dict, folder: Path) -> int | None:
    for key in ("tag_id", "id"):
        v = meta.get(key)
        if isinstance(v, int):
            return v
        if isinstance(v, str) and v.isdigit():
            return int(v)
    m = re.search(r"- (\d+)$", folder.name)
    return int(m.group(1)) if m else None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--library", type=Path, default=ROOT / "library")
    ap.add_argument(
        "--export",
        type=Path,
        default=ROOT / "library" / "_state" / "remote_export.xml",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.export.is_file():
        print(f"missing export: {args.export}", file=sys.stderr)
        return 1

    api = load_api_arrangers(args.export)
    print(f"API arrangers: {len(api)}")

    changed = 0
    scanned = 0
    for folder in sorted(args.library.iterdir()):
        if not folder.is_dir() or folder.name.startswith(("_", ".")):
            continue
        meta_path = folder / "metadata.json"
        if not meta_path.is_file():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        tid = tag_id_of(meta, folder)
        if tid is None or tid not in api:
            continue
        scanned += 1
        new_arr = api[tid]
        old_arr = meta.get("arranger")
        if old_arr == new_arr:
            continue
        print(f"{tid}: {old_arr!r} -> {new_arr!r}")
        if not args.dry_run:
            meta["arranger"] = new_arr
            if not meta.get("arranger_source"):
                meta["arranger_source"] = "api"
            meta_path.write_text(
                json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        changed += 1

    print(f"scanned={scanned} changed={changed} dry_run={args.dry_run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
