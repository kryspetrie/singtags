#!/usr/bin/env python3
"""Run the full local mirror repair pipeline end-to-end.

Steps:
  1. Inventory: delete instructional (guidelines) PDFs; quarantine not-found folders
  2. Repair: enrich metadata, download real sheets (images/PDFs), normalize names, OCR
  3. Optional audio fill pass (skipped by default; sheets+metadata first)
  4. Frontier: probe for new sequential IDs beyond the known max
  5. Rebuild catalog.jsonl

Safe to re-run: existing good files are skipped; state lives under
Barbershop_Tags_Library/_state/.

Examples:
  python mirror/run_full_mirror.py
  python mirror/run_full_mirror.py --with-audio          # also re-fetch missing MP3s
  python mirror/run_full_mirror.py --limit 50            # smoke / staged run
  python mirror/run_full_mirror.py --skip-frontier
"""

from __future__ import annotations

import sys
from pathlib import Path

_MIRROR_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _MIRROR_DIR.parent
for _p in (_REPO_ROOT, _MIRROR_DIR):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

# Prefer user-space micromamba tesseract when /usr/bin/tesseract is missing
_tess_dir = Path.home() / "micromamba/envs/tesseract/bin"
if _tess_dir.is_dir():
    import os

    os.environ["PATH"] = str(_tess_dir) + os.pathsep + os.environ.get("PATH", "")

import argparse
import traceback
from datetime import datetime, timezone



from lib.config import ROOT_DOWNLOAD_DIR, STATE_DIR
from lib.state import ensure_state_dir, load_sync_state, save_json, state_path


def _log(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    log_path = state_path("full_mirror.log")
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def step_inventory(root: Path) -> None:
    _log("STEP 1/5 — inventory: delete guidelines PDFs, quarantine not-found")
    old_argv = sys.argv[:]
    sys.argv = [
        "inventory.py",
        "--root",
        str(root),
        "--delete-guidelines",
        "--quarantine",
    ]
    try:
        from inventory import main as inventory_main

        inventory_main()
    finally:
        sys.argv = old_argv
    _log("STEP 1 done")


def step_repair(root: Path, *, ocr: bool, skip_audio: bool, limit: int) -> None:
    label = "sheets+OCR" if skip_audio else "full assets+OCR"
    _log(f"STEP 2/5 — bulk metadata + repair ({label}), limit={limit or 'all'}")
    from enrich import iter_ids_from_library
    from sync import run_bulk_metadata, run_ocr_backfill, run_repair

    _log("STEP 2a — ONE bulk api.php export → refresh all metadata.json")
    stats = run_bulk_metadata(root, from_cache=False, create_missing=True, limit=0)
    if not stats.get("ok"):
        raise RuntimeError("bulk metadata export failed")

    # Cheap local pass: OCR sheets that were downloaded but never OCR'd
    if ocr:
        _log("STEP 2b — local OCR backfill for sheets missing lyrics")
        run_ocr_backfill(root, force_ocr=False, limit=limit)

    ids = iter_ids_from_library(root)
    report = state_path("inventory_report.json")
    if report.exists():
        import json

        data = json.loads(report.read_text(encoding="utf-8"))
        missing = [int(x) for x in (data.get("missing_ids") or [])]
        if missing:
            before = len(ids)
            ids = sorted(set(ids) | set(missing))
            _log(f"added {len(ids) - before} missing IDs from inventory (now {len(ids)} total)")
    if 1 not in ids:
        ids = [1] + ids

    run_repair(
        root,
        ids,
        ocr=ocr,
        skip_audio=skip_audio,
        limit=limit,
        skip_complete=True,
        force=False,
        force_ocr=False,
        resume=True,
    )
    _log("STEP 2 done")


def step_audio_fill(root: Path, *, ocr: bool, limit: int) -> None:
    _log("STEP 3/5 — audio fill pass (download any missing learning tracks)")
    from sync import run_repair

    # skip_audio=False; skip tags that already have audio+sheet+lyrics
    run_repair(
        root,
        None,
        ocr=ocr,
        skip_audio=False,
        limit=limit,
        skip_complete=True,
        force=False,
        force_ocr=False,
    )
    _log("STEP 3 done")


def step_frontier(root: Path, *, ocr: bool, miss_limit: int) -> None:
    _log(f"STEP 4/5 — frontier assets for remote tags missing locally (cap={miss_limit})")
    from sync import run_frontier

    # Bulk export should already exist from step_repair; frontier uses identity match
    run_frontier(root, ocr=ocr, miss_limit=miss_limit, skip_complete=True)
    _log("STEP 4 done")


def step_catalog(root: Path) -> None:
    _log("STEP 5/5 — build catalog.jsonl")
    old_argv = sys.argv[:]
    sys.argv = ["build_catalog.py", "--root", str(root)]
    try:
        from build_catalog import main as catalog_main

        catalog_main()
    finally:
        sys.argv = old_argv
    _log("STEP 5 done")


def write_status(payload: dict) -> None:
    ensure_state_dir()
    save_json(state_path("full_mirror_status.json"), payload)


def main() -> int:
    parser = argparse.ArgumentParser(description="Full tags mirror repair pipeline")
    parser.add_argument("--root", type=Path, default=ROOT_DOWNLOAD_DIR)
    parser.add_argument("--ocr", action="store_true", default=True, help="OCR sheets (default on)")
    parser.add_argument("--no-ocr", action="store_true", help="Disable OCR")
    parser.add_argument(
        "--with-audio",
        action="store_true",
        help="After sheet/metadata pass, run a second pass for missing MP3s",
    )
    parser.add_argument("--skip-inventory", action="store_true")
    parser.add_argument("--skip-repair", action="store_true")
    parser.add_argument("--skip-frontier", action="store_true")
    parser.add_argument("--skip-catalog", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="Limit repair tags (0=all)")
    parser.add_argument("--miss-limit", type=int, default=40)
    args = parser.parse_args()

    ocr = not args.no_ocr
    started = datetime.now(timezone.utc).isoformat()
    write_status(
        {
            "status": "running",
            "started_at": started,
            "root": str(args.root),
            "ocr": ocr,
            "with_audio": args.with_audio,
            "limit": args.limit,
        }
    )

    if ocr:
        # Import after PATH tweak at module load
        from extract_text import RapidOCR, ocr_available, tesseract_available

        if not ocr_available():
            _log(
                "ERROR: OCR requested but no engine available. "
                "Activate ./venv (rapidocr-onnxruntime) and/or put tesseract on PATH."
            )
            write_status({"status": "failed", "error": "ocr_unavailable", "started_at": started})
            return 1
        _log(
            f"OCR engines: rapidocr={'yes' if RapidOCR is not None else 'no'} "
            f"tesseract={'yes' if tesseract_available() else 'no'}"
        )

    _log("=" * 72)
    _log("FULL MIRROR PIPELINE START")
    _log(f"root={args.root} ocr={ocr} with_audio={args.with_audio} limit={args.limit or 'all'}")
    _log(f"log={state_path('full_mirror.log')}")
    _log("=" * 72)

    try:
        if not args.skip_inventory:
            step_inventory(args.root)
        else:
            _log("STEP 1 skipped")

        if not args.skip_repair:
            # Primary pass: metadata + real sheets + normalize + OCR (no audio re-fetch)
            step_repair(args.root, ocr=ocr, skip_audio=True, limit=args.limit)
            if args.with_audio:
                step_audio_fill(args.root, ocr=False, limit=args.limit)
            else:
                _log("STEP 3/5 — audio fill skipped (pass --with-audio to enable)")
        else:
            _log("STEP 2–3 skipped")

        if not args.skip_frontier:
            step_frontier(args.root, ocr=ocr, miss_limit=args.miss_limit)
        else:
            _log("STEP 4 skipped")

        if not args.skip_catalog:
            step_catalog(args.root)
        else:
            _log("STEP 5 skipped")

        finished = datetime.now(timezone.utc).isoformat()
        write_status(
            {
                "status": "completed",
                "started_at": started,
                "finished_at": finished,
                "root": str(args.root),
                "ocr": ocr,
                "with_audio": args.with_audio,
                "limit": args.limit,
            }
        )
        _log("FULL MIRROR PIPELINE COMPLETE")
        return 0
    except KeyboardInterrupt:
        write_status({"status": "interrupted", "started_at": started})
        _log("Interrupted by user")
        return 130
    except Exception as exc:
        write_status(
            {
                "status": "failed",
                "started_at": started,
                "error": str(exc),
                "traceback": traceback.format_exc(),
            }
        )
        _log(f"FAILED: {exc}")
        _log(traceback.format_exc())
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
