#!/usr/bin/env python3
"""Weekly Lambda entrypoint: frontier sync + OCR + light CPU ASR (small.en).

Fail-fast on origin outages — do not poll/sleep for hours inside Lambda.
Step Functions (infra/statemachine/weekly_sync.asl.json) waits 1 hour between
attempts for up to 24 tries (~1 day), then gives up until the next weekly run.

Env (defaults match docs/AWS_STATIC_MIRROR_SITE.md):
  ASR_ENABLED=1
  ASR_MODEL=small.en
  ASR_BEAM_SIZE=1
  ASR_MIN_REMAINING_SECONDS=90
  ORIGIN_RETRY_INTERVAL_SECONDS=3600
  ORIGIN_RETRY_MAX_ATTEMPTS=24
  ROOT_DOWNLOAD_DIR / MIRROR_ROOT — optional override of library root
  FRONTIER_MISS_LIMIT — optional
  POLL_MINUTES — ignored/forced to 0 in Lambda (use Step Functions retries)

handler(event, context) is the Lambda target. Local dry-run:
  python mirror/lambda_sync.py --local [--limit N]
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
import os
from datetime import datetime, timezone
from typing import Any, Optional

from extract_audio_lyrics import process_folder_asr, whisper_available, ffmpeg_available
from lib.config import FRONTIER_MISS_LIMIT, ROOT_DOWNLOAD_DIR
from lib.http import origin_reachable
from lib.lambda_runtime import (
    Deadline,
    clear_origin_retry,
    get_origin_attempt,
    load_asr_config,
    load_origin_retry_config,
    mark_origin_retry,
    normalize_asr_pending,
    retry_response,
    set_asr_pending,
)
from lib.state import find_folder_for_id, load_sync_state, save_sync_state
from sync import _finish_primary_lyrics


def _resolve_root() -> Path:
    raw = os.environ.get("MIRROR_ROOT") or os.environ.get("ROOT_DOWNLOAD_DIR")
    if raw:
        return Path(raw)
    return ROOT_DOWNLOAD_DIR


def _maybe_run_asr(
    tag_id: int,
    root: Path,
    *,
    asr_cfg,
    deadline: Deadline,
    pending: list[int],
) -> str:
    """Run ASR for tag_id or defer to asr_pending. Returns ok|skipped|deferred|error."""
    if not asr_cfg.enabled:
        return "skipped"
    if not deadline.enough_for_asr(asr_cfg.min_remaining_seconds):
        if tag_id not in pending:
            pending.append(tag_id)
        print(
            f"   Tag #{tag_id}: defer ASR "
            f"(remaining={deadline.remaining_seconds():.0f}s < {asr_cfg.min_remaining_seconds:g}s)"
        )
        return "deferred"
    folder = find_folder_for_id(tag_id, root)
    if folder is None:
        print(f"   Tag #{tag_id}: ASR skip (no folder)")
        return "skipped"
    if not ffmpeg_available() or not whisper_available():
        print(f"   Tag #{tag_id}: ASR unavailable (ffmpeg/whisper); deferring")
        if tag_id not in pending:
            pending.append(tag_id)
        return "deferred"
    print(
        f"   Tag #{tag_id}: ASR model={asr_cfg.model_name} "
        f"device={asr_cfg.device} beam={asr_cfg.beam_size}"
    )
    try:
        stats = process_folder_asr(
            folder,
            model_name=asr_cfg.model_name,
            force=False,
            device=asr_cfg.device,
            compute_type=asr_cfg.compute_type,
            beam_size=asr_cfg.beam_size,
        )
        print(f"   Tag #{tag_id}: ASR stats={stats}")
        return "ok"
    except Exception as exc:
        print(f"   Tag #{tag_id}: ASR error ({exc}); deferring")
        if tag_id not in pending:
            pending.append(tag_id)
        return "error"


def drain_asr_pending(
    root: Path,
    state: dict,
    *,
    asr_cfg,
    deadline: Deadline,
) -> list[int]:
    """ASR-only pass for ids left from prior runs. Returns still-pending ids."""
    pending = normalize_asr_pending(state)
    if not pending:
        return []
    if not asr_cfg.enabled:
        print(f"ASR disabled; leaving asr_pending={pending}")
        return pending
    print(f"Draining asr_pending ({len(pending)} id(s)) before frontier...")
    remaining: list[int] = []
    for tag_id in pending:
        status = _maybe_run_asr(
            tag_id,
            root,
            asr_cfg=asr_cfg,
            deadline=deadline,
            pending=remaining,
        )
        if status == "deferred":
            idx = pending.index(tag_id)
            for rest in pending[idx:]:
                if rest not in remaining:
                    remaining.append(rest)
            break
        if status in {"error"} and tag_id not in remaining:
            remaining.append(tag_id)
        elif status in {"ok", "skipped"}:
            folder = find_folder_for_id(tag_id, root)
            if folder is not None:
                _finish_primary_lyrics(
                    folder,
                    ocr=True,
                    force_ocr=False,
                    asr=False,  # parts already transcribed above
                    asr_model=asr_cfg.model_name,
                )
    return remaining


def run_frontier_with_asr(
    root: Path,
    state: dict,
    *,
    asr_cfg,
    deadline: Deadline,
    miss_limit: int,
    skip_audio: bool,
    limit: int = 0,
) -> str:
    """Bulk metadata once, then download missing assets. Fail-fast on origin errors.

    Never scrapes per-tag HTML pages.
    """
    from enrich import apply_bulk_export
    from sync import run_frontier

    pending = normalize_asr_pending(state)
    print(f"Weekly: bulk metadata export then frontier assets (ASR={asr_cfg.enabled}/{asr_cfg.model_name})")

    stats = apply_bulk_export(root, fetch=True, create_missing=True)
    if not stats.get("ok"):
        set_asr_pending(state, pending)
        state["last_run"] = datetime.now(timezone.utc).isoformat()
        save_sync_state(state)
        print("   Bulk metadata export failed — abort (external retry)")
        return "http_error"

    # Asset downloads for tags still missing sheets (capped by miss_limit / limit)
    before_pending = list(pending)
    run_frontier(
        root,
        ocr=True,
        miss_limit=miss_limit,
        skip_complete=True,
        force=False,
        force_ocr=False,
        poll_minutes=0,
        asr=asr_cfg.enabled,
        asr_model=asr_cfg.model_name,
        skip_audio=skip_audio,
        limit=limit,
    )

    # Optional: ASR drain for newly synced tags is handled inside sync_one when asr=True.
    # Keep asr_pending from prior deferrals.
    set_asr_pending(state, before_pending)
    state["last_run"] = datetime.now(timezone.utc).isoformat()
    save_sync_state(state)
    print(
        f"Frontier complete; max_confirmed_id={state.get('max_confirmed_id')} "
        f"asr_pending={state.get('asr_pending')}"
    )
    return "ok"


def run_weekly_sync(
    root: Path,
    *,
    context: Any = None,
    event: Optional[dict] = None,
    miss_limit: Optional[int] = None,
    skip_audio: bool = False,
    limit: int = 0,
) -> dict:
    """Drain asr_pending, then frontier+OCR+ASR. Fail-fast if origin is down."""
    event = event or {}
    asr_cfg = load_asr_config()
    retry_cfg = load_origin_retry_config()
    deadline = Deadline.from_lambda_context(context)
    miss = miss_limit
    if miss is None:
        miss = int(os.environ.get("FRONTIER_MISS_LIMIT") or FRONTIER_MISS_LIMIT)

    state = load_sync_state()
    attempt = get_origin_attempt(event, state)
    print(
        f"Weekly sync root={root} attempt={attempt}/{retry_cfg.max_attempts} "
        f"remaining≈{deadline.remaining_seconds():.0f}s asr={asr_cfg}"
    )

    # Local-only ASR drain does not need origin; still fail-fast before frontier.
    still_pending = drain_asr_pending(root, state, asr_cfg=asr_cfg, deadline=deadline)
    set_asr_pending(state, still_pending)
    state["last_run"] = datetime.now(timezone.utc).isoformat()
    save_sync_state(state)

    if not origin_reachable():
        print("Origin unreachable — exit immediately (Step Functions will retry hourly)")
        mark_origin_retry(state, attempt=attempt, reason="origin_unreachable", cfg=retry_cfg)
        save_sync_state(state)
        return retry_response(
            attempt=attempt,
            cfg=retry_cfg,
            reason="origin_unreachable",
            extra={"asr_pending": normalize_asr_pending(state)},
        )

    frontier_status = run_frontier_with_asr(
        root,
        state,
        asr_cfg=asr_cfg,
        deadline=deadline,
        miss_limit=miss,
        skip_audio=skip_audio,
        limit=limit,
    )
    if frontier_status == "http_error":
        mark_origin_retry(state, attempt=attempt, reason="http_error", cfg=retry_cfg)
        save_sync_state(state)
        return retry_response(
            attempt=attempt,
            cfg=retry_cfg,
            reason="http_error",
            extra={
                "max_confirmed_id": state.get("max_confirmed_id"),
                "asr_pending": normalize_asr_pending(state),
            },
        )

    clear_origin_retry(state)
    state["last_run"] = datetime.now(timezone.utc).isoformat()
    save_sync_state(state)
    return {
        "ok": True,
        "retry_origin": False,
        "exhausted": False,
        "attempt": attempt,
        "max_attempts": retry_cfg.max_attempts,
        "interval_seconds": retry_cfg.interval_seconds,
        "max_confirmed_id": state.get("max_confirmed_id"),
        "asr_pending": normalize_asr_pending(state),
        "asr_model": asr_cfg.model_name if asr_cfg.enabled else None,
        "limit": int(event.get("limit") or 0),
    }


def handler(event: Optional[dict] = None, context: Any = None) -> dict:
    """AWS Lambda handler (invoked by Step Functions weekly sync state machine)."""
    event = event or {}
    root = _resolve_root()
    limit = int(event.get("limit") or 0)
    return run_weekly_sync(
        root,
        context=context,
        event=event,
        limit=limit,
        skip_audio=False,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Weekly Lambda sync (local runner)")
    parser.add_argument("--local", action="store_true", help="Run against local library root")
    parser.add_argument("--root", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=0, help="Cap frontier ids this run")
    parser.add_argument(
        "--skip-audio",
        action="store_true",
        help="Do not download MP3s (ASR will only use files already on disk)",
    )
    parser.add_argument(
        "--miss-limit",
        type=int,
        default=None,
        help="Frontier consecutive miss limit",
    )
    parser.add_argument(
        "--attempt",
        type=int,
        default=1,
        help="Simulate Step Functions attempt number (default 1)",
    )
    args = parser.parse_args()
    if not args.local and args.root is None:
        parser.error("Use --local or --root for CLI runs (Lambda uses handler())")
    root = args.root or _resolve_root()
    os.environ.setdefault("ASR_ENABLED", "1")
    os.environ.setdefault("ASR_MODEL", "small.en")
    os.environ.setdefault("ASR_BEAM_SIZE", "1")
    result = run_weekly_sync(
        root,
        context=None,
        event={"attempt": args.attempt},
        miss_limit=args.miss_limit,
        skip_audio=args.skip_audio,
        limit=args.limit,
    )
    print(result)


if __name__ == "__main__":
    main()
