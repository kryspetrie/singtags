#!/usr/bin/env python3
"""Orchestrate bulk metadata sync + asset repair for the tags mirror.

**Live entrypoint** (also used by ``run_full_mirror.py`` and ``lambda_sync.py``).

Modes (mutually exclusive):
  --bulk-meta     ONE ``api.php?n=50000`` export → refresh all ``metadata.json``
  --frontier      Download missing assets for remote tags not yet complete locally
  --repair        Repair missing assets for known library IDs
  --ids           Targeted sync for a comma-separated id list
  --ocr-backfill  Local OCR only (sheets on disk, lyrics missing)
  --asr-backfill  Local Whisper ASR → ``part_lyrics``

Per-tag pipeline (``sync_one``): skip-if-complete → fetch missing sheet/audio →
normalize → audio_layout/align → Opus tiers → primary lyrics (ASR/OCR; never
overwrite ``lyrics_source=manual``).

Origin care: never scrape per-tag HTML. Metadata only via bulk export.
File downloads (sheets/MP3s via ``dbaction``) are fine. See README.md.
"""

from __future__ import annotations

import sys
from pathlib import Path

_MIRROR_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _MIRROR_DIR.parent
for _p in (_REPO_ROOT, _MIRROR_DIR):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import argparse
from datetime import datetime, timezone

from assets import download_parts_for_tag, missing_audio_parts, register_existing_parts
from enrich import apply_bulk_export, iter_ids_from_library, parse_id_list
from extract_text import process_folder
from lib.api import load_cached_export
from lib.audio_layout import ensure_audio_layouts
from lib.audio_tiers import ensure_audio_tiers
from lib.complete import (
    audio_parts_present,
    find_sheet_file,
    has_trusted_primary_lyrics,
    has_usable_asr_primary,
    has_usable_lyrics,
    lyrics_are_accepted,
    part_asr_text,
    promote_asr_to_lyrics,
    tag_looks_complete,
)
from lib.config import API_BULK_N, FRONTIER_MISS_LIMIT, ROOT_DOWNLOAD_DIR
from lib.http import pause_between_requests, wait_for_origin
from lib.identity import index_local_library, match_remote_to_folder
from lib.state import (
    find_folder_for_id,
    load_metadata,
    load_sync_state,
    save_metadata,
    save_sync_state,
)
from normalize import normalize_folder


def _ensure_audio_layout_metadata(folder: Path) -> None:
    """Classify part-left / mono / etc. on local audio into metadata.json."""
    meta = load_metadata(folder)
    if not meta:
        return
    if ensure_audio_layouts(folder, meta, force=False):
        save_metadata(folder, meta)
        summary = meta.get("audio_layout_summary") or {}
        print(
            "   audio_layout "
            f"parts={summary.get('parts')} mix={summary.get('mix')} "
            f"ultra_low={summary.get('ultra_low')} "
            f"solo_side={summary.get('solo_side')} "
            f"mix_disjoint={summary.get('mix_disjoint')}"
        )
        align = meta.get("audio_align_summary") or {}
        if align:
            applied = align.get("applied_ms") or {}
            print(
                "   audio_align "
                f"status={align.get('status')} "
                f"applied={applied or '{}'}"
            )


def _ensure_audio_tier_files(folder: Path) -> None:
    """Encode 64k playback + ultra-low Opus tiers when originals change."""
    meta = load_metadata(folder)
    if not meta:
        return
    if ensure_audio_tiers(folder, meta, force=False):
        save_metadata(folder, meta)
        summary = meta.get("audio_tiers_summary") or {}
        print(
            "   audio_tiers "
            f"policy={summary.get('ultra_policy')} "
            f"mix_only={summary.get('mix_only')} "
            f"mix_disjoint={summary.get('mix_disjoint')} "
            f"parts={len(summary.get('parts') or [])} "
            f"align={summary.get('align_status')} "
            f"align_applied={summary.get('align_applied_ms') or {}}"
        )


def _apply_asr_primary(folder: Path, meta: dict) -> dict:
    """Promote best ASR part → main lyrics when appropriate; persist if changed."""
    if promote_asr_to_lyrics(meta):
        part = meta.get("lyrics_asr_part") or "lead"
        save_metadata(folder, meta)
        print(f"   primary lyrics ← {part} ASR")
    return meta


def _run_primary_asr(
    folder: Path,
    meta: dict,
    *,
    force_asr: bool = False,
    asr_model: str | None = None,
) -> dict:
    """ASR Lead (or next available part) until one yields words, or parts exhausted."""
    parts = audio_parts_present(folder, meta)
    if not parts:
        return meta

    from extract_audio_lyrics import (
        DEFAULT_ASR_MODEL,
        ffmpeg_available,
        process_folder as asr_process_folder,
        whisper_available,
    )

    if not ffmpeg_available() or not whisper_available():
        print("   skip ASR — ffmpeg/faster-whisper unavailable")
        return meta

    model = asr_model or DEFAULT_ASR_MODEL
    for part in parts:
        if not force_asr and part_asr_text(meta, part):
            return meta
        print(f"   ASR primary part={part} model={model}")
        asr_process_folder(
            folder,
            model_name=model,
            force=force_asr,
            parts=(part,),
        )
        meta = load_metadata(folder) or meta
        if part_asr_text(meta, part):
            return meta
        print(f"   {part} ASR had no usable words — trying next part if any")
    return meta


def _finish_primary_lyrics(
    folder: Path,
    *,
    ocr: bool,
    force_ocr: bool,
    asr: bool = True,
    force_asr: bool = False,
    asr_model: str | None = None,
) -> None:
    """Remote/manual lyrics win; else ASR when audio present; else OCR fallback."""
    meta = load_metadata(folder) or {}

    if lyrics_are_accepted(meta):
        print("   skip ASR/OCR — accepted lyrics locked")
        return

    # API / HTML / PDF / manual already give a good primary — skip ASR and OCR.
    if has_trusted_primary_lyrics(meta):
        print(
            f"   skip ASR/OCR — primary lyrics from {meta.get('lyrics_source')}"
        )
        return

    has_audio = bool(audio_parts_present(folder, meta))

    if asr and has_audio:
        meta = _run_primary_asr(
            folder, meta, force_asr=force_asr, asr_model=asr_model
        )
        meta = load_metadata(folder) or meta

    meta = _apply_asr_primary(folder, meta)
    meta = load_metadata(folder) or meta

    if has_trusted_primary_lyrics(meta):
        print(
            f"   skip OCR — primary lyrics from {meta.get('lyrics_source')}"
        )
        return

    lyrics_ok = has_usable_lyrics(meta) and not force_ocr
    asr_ok = has_usable_asr_primary(meta)

    if force_ocr:
        want_ocr = True
    elif lyrics_ok:
        want_ocr = False
    elif asr_ok:
        want_ocr = False
    elif has_audio and asr:
        print("   OCR fallback — ASR produced no usable words")
        want_ocr = True
    else:
        want_ocr = bool(ocr)

    if want_ocr:
        print("   OCR for primary lyrics")
        process_folder(
            folder,
            do_ocr=True,
            force_ocr=force_ocr,
            skip_if_ocr_lyrics=not force_ocr,
        )
    elif not has_usable_lyrics(meta):
        print("   (primary lyrics still missing)")


def _sync_with_origin_poll(
    tag_id: int,
    root: Path,
    *,
    ocr: bool,
    skip_audio: bool = True,
    skip_complete: bool = True,
    force: bool = False,
    force_ocr: bool = False,
    poll_minutes: float = 0,
    asr: bool = True,
    force_asr: bool = False,
    asr_model: str | None = None,
) -> str:
    """Run sync_one; on http_error, poll origin every poll_minutes until up, then retry."""
    while True:
        status = sync_one(
            tag_id,
            root,
            ocr=ocr,
            skip_audio=skip_audio,
            skip_complete=skip_complete,
            force=force,
            force_ocr=force_ocr,
            asr=asr,
            force_asr=force_asr,
            asr_model=asr_model,
        )
        if status != "http_error" or poll_minutes <= 0:
            return status
        print(
            f"   Tag #{tag_id}: origin unavailable — "
            f"polling every {poll_minutes:g} minute(s) (cursor not advanced)"
        )
        wait_for_origin(poll_minutes=poll_minutes)


def sync_one(
    tag_id: int,
    root: Path,
    ocr: bool = True,
    skip_audio: bool = True,
    *,
    skip_complete: bool = True,
    force: bool = False,
    force_ocr: bool = False,
    asr: bool = True,
    force_asr: bool = False,
    asr_model: str | None = None,
) -> str:
    """Download missing assets + normalize + primary lyrics. Returns status string.

    Metadata must already come from bulk API export (``--bulk-meta`` / enrich.py).
    This path never scrapes per-tag HTML pages.
    """
    print(f"=== Sync tag #{tag_id} ===")
    folder = find_folder_for_id(tag_id, root)

    if skip_complete and not force and not force_ocr and folder:
        meta = load_metadata(folder)
        if tag_looks_complete(folder, meta, require_audio=not skip_audio):
            # Still fill audio_layout + Opus tiers when missing (cheap local ffmpeg).
            _ensure_audio_layout_metadata(folder)
            _ensure_audio_tier_files(folder)
            print("   SKIP complete (sheet+metadata+lyrics already present)")
            return "skipped"

    meta = load_metadata(folder) if folder else {}
    if not meta or not meta.get("discovered_assets"):
        export = load_cached_export()
        if export:
            remote = next(
                (t for t in export.get("tags") or [] if t.get("tag_id") == tag_id),
                None,
            )
            if remote is None:
                print(f"   Tag #{tag_id}: not in bulk export")
                return "not_found"
            parsed_reuse = remote
        else:
            print("   No cached bulk export — run sync with --bulk-meta first")
            return "http_error"
    else:
        parsed_reuse = {
            **meta,
            "tag_id": tag_id,
            "status": meta.get("status") or "ok",
            "discovered_assets": meta.get("discovered_assets") or {},
        }

    if folder:
        register_existing_parts(folder, meta)
        if meta:
            save_metadata(folder, meta)

    sheet_ok = bool(folder and find_sheet_file(folder, meta))
    audio_missing = (
        (not skip_audio)
        and folder is not None
        and bool(missing_audio_parts(folder, meta))
    )
    need_assets = not sheet_ok or audio_missing or folder is None

    if need_assets:
        why = []
        if folder is None:
            why.append("no folder")
        if not sheet_ok:
            why.append("sheet missing")
        if audio_missing:
            why.append("audio missing")
        print(f"   fetching missing assets only ({', '.join(why) or 'needed'})")
        asset_result = download_parts_for_tag(
            tag_id,
            root,
            force_sheet=False,
            skip_audio=skip_audio,
            parsed=parsed_reuse,
        )
        if isinstance(asset_result, dict) and asset_result.get("status") == "http_error":
            return "http_error"
        if isinstance(asset_result, dict) and asset_result.get("status") == "not_found":
            return "not_found"
    else:
        print("   skip asset download — sheet present; audio skipped or already local")
        if folder:
            m = load_metadata(folder)
            register_existing_parts(folder, m)
            save_metadata(folder, m)

    folder = find_folder_for_id(tag_id, root)
    if folder:
        normalize_folder(folder, root)
        folder = find_folder_for_id(tag_id, root) or folder
        _ensure_audio_layout_metadata(folder)
        _ensure_audio_tier_files(folder)
        _finish_primary_lyrics(
            folder,
            ocr=ocr,
            force_ocr=force_ocr,
            asr=asr,
            force_asr=force_asr,
            asr_model=asr_model,
        )
    return "ok"


def run_bulk_metadata(
    root: Path,
    *,
    from_cache: bool = False,
    n: int = API_BULK_N,
    create_missing: bool = True,
    limit: int = 0,
) -> dict:
    """One-shot metadata refresh from api.php (or cached XML)."""
    return apply_bulk_export(
        root,
        fetch=not from_cache,
        n=n,
        create_missing=create_missing,
        dry_run=False,
        limit=limit,
    )


def run_frontier(
    root: Path,
    ocr: bool = True,
    miss_limit: int = FRONTIER_MISS_LIMIT,
    *,
    skip_complete: bool = True,
    force: bool = False,
    force_ocr: bool = False,
    poll_minutes: float = 0,
    asr: bool = True,
    force_asr: bool = False,
    asr_model: str | None = None,
    skip_audio: bool = True,
    limit: int = 0,
) -> None:
    """Download assets for remote tags that have no local sheet yet.

    Uses the bulk export (must already be on disk from --bulk-meta). Does not
    probe sequential IDs via HTML.
    """
    export = load_cached_export()
    if export is None:
        print("No cached remote_export.xml — run with --bulk-meta first")
        return

    local_index = index_local_library(root)
    claimed: set[Path] = set()
    work: list[int] = []
    for remote in export.get("tags") or []:
        tag_id = remote.get("tag_id")
        if not isinstance(tag_id, int):
            continue
        folder, _method = match_remote_to_folder(remote, local_index, claimed=claimed)
        if folder is None:
            work.append(tag_id)
            continue
        claimed.add(folder)
        meta = load_metadata(folder)
        if force or not find_sheet_file(folder, meta):
            work.append(tag_id)

    if limit:
        work = work[:limit]
    elif miss_limit and miss_limit > 0:
        # Cap this run (legacy flag; default 40 keeps weekly Lambda light)
        work = work[:miss_limit]

    print(f"Frontier/assets: {len(work)} tag(s) need download (of {export.get('count')} remote)")
    if poll_minutes > 0:
        print(f"Origin poll interval: {poll_minutes:g} minute(s) on http_error")

    state = load_sync_state()
    done = 0
    for tag_id in work:
        status = _sync_with_origin_poll(
            tag_id,
            root,
            ocr=ocr,
            skip_audio=skip_audio,
            skip_complete=skip_complete,
            force=force,
            force_ocr=force_ocr,
            poll_minutes=poll_minutes,
            asr=asr,
            force_asr=force_asr,
            asr_model=asr_model,
        )
        if status != "skipped":
            pause_between_requests()
        if status in {"ok", "skipped"}:
            state["max_confirmed_id"] = max(int(state.get("max_confirmed_id") or 0), tag_id)
        elif status != "not_found":
            failures = set(state.get("failures") or [])
            failures.add(tag_id)
            state["failures"] = sorted(failures)
        state["last_run"] = datetime.now(timezone.utc).isoformat()
        save_sync_state(state)
        done += 1
    print(f"Frontier/assets complete; processed={done}")


def run_ocr_backfill(root: Path, *, force_ocr: bool = False, limit: int = 0) -> None:
    """Local-only: OCR any tag that has a sheet but missing usable lyrics."""
    from extract_text import ocr_available

    print("OCR backfill (local only, no downloads)...")
    if not ocr_available():
        print(
            "ERROR: OCR engines unavailable. Activate the project venv and ensure "
            "rapidocr-onnxruntime is installed and/or tesseract is on PATH "
            "(e.g. export PATH=\"$HOME/micromamba/envs/tesseract/bin:$PATH\")."
        )
        return
    done = 0
    for tag_id in iter_ids_from_library(root):
        folder = find_folder_for_id(tag_id, root)
        if not folder:
            continue
        meta = load_metadata(folder)
        if not meta:
            continue
        if not find_sheet_file(folder, meta):
            continue
        if not force_ocr and has_usable_lyrics(meta):
            continue
        if not force_ocr and has_usable_asr_primary(meta):
            if promote_asr_to_lyrics(meta):
                save_metadata(folder, meta)
                print(f"=== Skip OCR #{tag_id} — primary ← ASR ===")
                done += 1
                if limit and done >= limit:
                    break
            continue
        print(f"=== OCR backfill #{tag_id} ===")
        register_existing_parts(folder, meta)
        save_metadata(folder, meta)
        process_folder(
            folder,
            do_ocr=True,
            force_ocr=force_ocr,
            skip_if_ocr_lyrics=not force_ocr,
        )
        done += 1
        if limit and done >= limit:
            break
    print(f"OCR backfill finished ({done} tag(s))")


def run_repair(
    root: Path,
    ids: list | None,
    ocr: bool = True,
    skip_audio: bool = True,
    limit: int = 0,
    *,
    skip_complete: bool = True,
    force: bool = False,
    force_ocr: bool = False,
    resume: bool = True,
    poll_minutes: float = 0,
    start_id: int | None = None,
    asr: bool = True,
    force_asr: bool = False,
    asr_model: str | None = None,
) -> None:
    """Repair missing sheets/audio for known library IDs (no per-tag HTML)."""
    if ids is None:
        ids = iter_ids_from_library(root)
        if 1 not in ids:
            ids = [1] + ids
    state = load_sync_state()
    if start_id is not None:
        cursor = max(1, int(start_id))
    elif resume and not force:
        cursor = int(state.get("repair_cursor") or 0)
    else:
        cursor = 0
    if cursor:
        before = len(ids)
        ids = [i for i in ids if i >= cursor]
        print(f"Resuming repair from id>={cursor} ({before} → {len(ids)} remaining)")
    print(f"Repairing {len(ids)} tag(s)... (skip_complete={skip_complete})")
    if poll_minutes > 0:
        print(f"Origin poll interval: {poll_minutes:g} minute(s) on http_error")
    done = 0
    skipped = 0
    for tag_id in ids:
        status = "error"
        try:
            status = _sync_with_origin_poll(
                tag_id,
                root,
                ocr=ocr,
                skip_audio=skip_audio,
                skip_complete=skip_complete,
                force=force,
                force_ocr=force_ocr,
                poll_minutes=poll_minutes,
                asr=asr,
                force_asr=force_asr,
                asr_model=asr_model,
            )
            if status == "skipped":
                skipped += 1
            if status in {"ok", "skipped"}:
                state["max_confirmed_id"] = max(int(state.get("max_confirmed_id") or 0), tag_id)
            elif status != "not_found":
                failures = set(state.get("failures") or [])
                failures.add(tag_id)
                state["failures"] = sorted(failures)
        except Exception as exc:
            print(f"   Tag #{tag_id}: {exc}")
            failures = set(state.get("failures") or [])
            failures.add(tag_id)
            state["failures"] = sorted(failures)
            status = "error"
        done += 1
        state["repair_cursor"] = tag_id + 1
        state["last_run"] = datetime.now(timezone.utc).isoformat()
        save_sync_state(state)
        if status != "skipped":
            pause_between_requests()
        if limit and done >= limit:
            break
    print(f"Repair pass finished (processed={done}, skipped_complete={skipped})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Tags mirror sync / repair")
    parser.add_argument("--root", type=Path, default=ROOT_DOWNLOAD_DIR)
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument(
        "--bulk-meta",
        action="store_true",
        help="ONE api.php request (n=50000) + refresh all local metadata.json",
    )
    g.add_argument(
        "--frontier",
        action="store_true",
        help="Download assets for remote tags missing locally (uses cached bulk export)",
    )
    g.add_argument("--repair", action="store_true", help="Repair missing assets for known library IDs")
    g.add_argument("--ids", type=str, help="Targeted ids, e.g. 1,2180,5903")
    g.add_argument(
        "--ocr-backfill",
        action="store_true",
        help="Local-only OCR for tags that already have sheets but no lyrics",
    )
    g.add_argument(
        "--asr-backfill",
        action="store_true",
        help="Local-only ASR into part_lyrics from Lead/Bari/Bass/Tenor left channel",
    )
    parser.add_argument(
        "--from-cache",
        action="store_true",
        help="With --bulk-meta: reuse _state/remote_export.xml (no network)",
    )
    parser.add_argument(
        "--n",
        type=int,
        default=API_BULK_N,
        help=f"Bulk API page size (default {API_BULK_N})",
    )
    parser.add_argument(
        "--ocr",
        action="store_true",
        default=True,
        help="Enable OCR fallback for primary lyrics (default: on)",
    )
    parser.add_argument(
        "--no-ocr",
        action="store_true",
        help="Disable OCR (ASR-only primary lyrics when audio exists)",
    )
    parser.add_argument(
        "--asr-model",
        default="large-v3",
        help="faster-whisper model for sync primary ASR / --asr-backfill (default: large-v3)",
    )
    parser.add_argument(
        "--skip-asr",
        action="store_true",
        help="Do not run primary ASR during sync (OCR-only when lyrics missing)",
    )
    parser.add_argument(
        "--force-asr",
        action="store_true",
        help="Re-run part ASR even when part_lyrics already has text",
    )
    parser.add_argument(
        "--skip-audio",
        action="store_true",
        default=True,
        help="Do not download learning-track MP3s (default: true)",
    )
    parser.add_argument(
        "--with-audio",
        action="store_true",
        help="Allow downloading missing MP3s (still skips files already on disk)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-process even when tag looks complete; disables repair resume "
        "(does not force OCR — use --force-ocr for that)",
    )
    parser.add_argument(
        "--force-ocr",
        action="store_true",
        help="Re-run lyric OCR even when Lead ASR or usable lyrics exist",
    )
    parser.add_argument(
        "--no-skip-complete",
        action="store_true",
        help="Always run asset fetch even if tag looks complete",
    )
    parser.add_argument(
        "--no-resume",
        action="store_true",
        help="Ignore repair_cursor and start from the beginning of the id list",
    )
    parser.add_argument(
        "--start-id",
        type=int,
        default=None,
        metavar="N",
        help="Start repair at tag id N (and higher). Overrides repair_cursor / --no-resume.",
    )
    parser.add_argument(
        "--poll-minutes",
        type=float,
        default=5,
        help="When origin is down, wait this many minutes between probes and retry "
        "(default: 5). Set 0 to fail http_error immediately without waiting.",
    )
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--miss-limit", type=int, default=FRONTIER_MISS_LIMIT)
    parser.add_argument(
        "--inventory",
        action="store_true",
        help="Run inventory (delete guidelines PDFs) before sync",
    )
    args = parser.parse_args()
    skip_complete = not args.no_skip_complete and not args.force and not args.force_ocr
    skip_audio = not args.with_audio
    ocr = bool(args.ocr) and not args.no_ocr
    asr = not args.skip_asr

    if args.inventory:

        from inventory import main as inv_main

        old = sys.argv
        sys.argv = ["inventory.py", "--root", str(args.root), "--delete-guidelines"]
        try:
            inv_main()
        finally:
            sys.argv = old

    if args.bulk_meta:
        stats = run_bulk_metadata(
            args.root,
            from_cache=args.from_cache,
            n=args.n,
            create_missing=True,
            limit=args.limit,
        )
        if not stats.get("ok"):
            raise SystemExit(1)
    elif args.ocr_backfill:
        run_ocr_backfill(args.root, force_ocr=args.force_ocr, limit=args.limit)
    elif args.asr_backfill:
        from extract_audio_lyrics import run_asr_backfill

        run_asr_backfill(
            args.root,
            model_name=args.asr_model,
            force=args.force_asr,
            limit=args.limit,
        )
    elif args.frontier:
        run_frontier(
            args.root,
            ocr=ocr,
            miss_limit=args.miss_limit,
            skip_complete=skip_complete,
            force=args.force,
            force_ocr=args.force_ocr,
            poll_minutes=args.poll_minutes,
            asr=asr,
            force_asr=args.force_asr,
            asr_model=args.asr_model,
            skip_audio=skip_audio,
            limit=args.limit,
        )
    elif args.repair:
        run_repair(
            args.root,
            None,
            ocr=ocr,
            skip_audio=skip_audio,
            limit=args.limit,
            skip_complete=skip_complete,
            force=args.force,
            force_ocr=args.force_ocr,
            resume=not args.no_resume,
            poll_minutes=args.poll_minutes,
            start_id=args.start_id,
            asr=asr,
            force_asr=args.force_asr,
            asr_model=args.asr_model,
        )
    else:
        ids = parse_id_list(args.ids)
        if args.limit:
            ids = ids[: args.limit]
        run_repair(
            args.root,
            ids,
            ocr=ocr,
            skip_audio=skip_audio,
            limit=0,
            skip_complete=skip_complete,
            force=args.force,
            force_ocr=args.force_ocr,
            resume=False,
            poll_minutes=args.poll_minutes,
            start_id=args.start_id,
            asr=asr,
            force_asr=args.force_asr,
            asr_model=args.asr_model,
        )


if __name__ == "__main__":
    main()
