#!/usr/bin/env python3
"""Guess best lyrics, page-accept them, or review disputes.

Not part of live sync — see lyrics/README.md.
"""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
_MIRROR_DIR = _REPO_ROOT / "mirror"
for _p in (_REPO_ROOT, _MIRROR_DIR):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))


import argparse
import re
import shutil
import textwrap
from collections import Counter

from lib.config import ROOT_DOWNLOAD_DIR
from lib.lyric_choose import (
    append_review_item,
    collect_candidates,
    flatten_lyrics,
    is_confident_guess,
    load_batch_cursor,
    load_review_queue,
    load_suggestions,
    lyrics_quality_issues,
    pending_review_ids,
    pick_best,
    review_queue_path,
    save_batch_cursor,
    save_review_queue,
    save_suggestions,
    sentence_case_lyrics,
    suggestion_row,
    suggestions_path,
    SUMMARY_NAME,
    finalize_lyrics,
)
from lib.state import (
    index_folders_by_id,
    iter_tag_folders,
    load_metadata,
    save_json,
    save_metadata,
    state_path,
)

_IDS = re.compile(r"\d+")

def page_size(requested: int) -> int:
    if requested > 0:
        return requested
    rows = shutil.get_terminal_size((120, 50)).lines
    # Fit one screen, but never fewer than 50 tags.
    return max(50, rows - 8)

def analyze(root: Path) -> tuple[list[dict], dict]:
    rows: list[dict] = []
    stats: Counter[str] = Counter()
    empty: list[dict] = []
    auto_review: list[tuple[dict, str]] = []
    in_review = pending_review_ids()
    for folder in iter_tag_folders(root):
        meta = load_metadata(folder) if (folder / "metadata.json").exists() else {}
        if not meta:
            continue
        if meta.get("lyrics_finalized"):
            stats["already_finalized"] += 1
            continue
        if meta.get("lyrics_source") == "manual":
            stats["skipped_manual"] += 1
            continue
        row = suggestion_row(folder, meta)
        if row is None:
            stats["skipped"] += 1
            continue
        if row.get("tag_id") in in_review:
            stats["already_in_review"] += 1
            continue
        src = row.get("suggested_source") or "none"
        lyrics = row.get("suggested_lyrics")
        if not lyrics:
            stats["no_usable"] += 1
            empty.append(row)
            continue
        if not is_confident_guess(lyrics, src):
            issues = row.get("quality_issues") or lyrics_quality_issues(lyrics, src)
            reason = issues[0] if issues else "needs_review"
            stats[f"auto_review:{reason}"] += 1
            auto_review.append((row, reason if reason != "unreliable_source" else "ocr_unreliable"))
            continue
        stats[f"pick:{src.split(':')[0]}"] += 1
        rows.append(row)

    path = save_suggestions(rows)
    for row in empty:
        append_review_item(row, reason="no_usable_lyrics")
    for row, reason in auto_review:
        append_review_item(row, reason=reason)

    # Suggestion list changed — restart paging at the top.
    save_batch_cursor({"next_index": 0, "accepted": 0, "disputed": 0, "pages": 0})

    summary = {
        "suggestions": len(rows),
        "queued_empty_for_review": len(empty),
        "queued_auto_review": len(auto_review),
        "stats": dict(stats),
        "path": str(path),
        "review_queue": str(review_queue_path()),
    }
    save_json(state_path(SUMMARY_NAME), summary)
    return rows, summary

def print_page(page: list[dict], *, start_index: int, total: int) -> None:
    cols = shutil.get_terminal_size((140, 50)).columns
    id_w = max(2, len(str(len(page))))
    name_w = 30
    lyric_w = max(20, cols - name_w - id_w - 6)

    def clip(text: str, width: int) -> str:
        text = flatten_lyrics(text) or ""
        if len(text) <= width:
            return text
        if width <= 3:
            return text[:width]
        return text[: width - 1] + "…"

    print()
    print(f"Tags {start_index + 1}–{start_index + len(page)} of {total}")
    print("-" * min(cols, 80))
    for i, row in enumerate(page, start=1):
        name = clip(row.get("title") or "", name_w).ljust(name_w)
        lyrics = sentence_case_lyrics(row.get("suggested_lyrics") or "(empty)")
        print(f"{name} | {str(i).rjust(id_w)} | {clip(lyrics, lyric_w)}")
    print("-" * min(cols, 80))
    print(
        "Disagree: type page ids (e.g. 3,7,12).  Enter = accept rest.  "
        "s = skip page.  q = quit."
    )

def parse_disagree(raw: str, n: int) -> list[int] | None:
    raw = raw.strip().lower()
    if raw in {"q", "quit"}:
        return None
    if raw in {"s", "skip"}:
        return []
    if not raw:
        return []
    ids = [int(m) for m in _IDS.findall(raw)]
    bad = [i for i in ids if i < 1 or i > n]
    if bad:
        print(f"   out of range: {bad} (this page is 1–{n})")
        return None
    # empty after parse of junk
    return sorted(set(ids))

def finalize_row(root: Path, row: dict, index: dict[int, Path], *, dry_run: bool) -> bool:
    tid = row.get("tag_id")
    folder = index.get(tid) if isinstance(tid, int) else None
    if folder is None:
        print(f"   missing folder for #{tid}")
        return False
    lyrics = sentence_case_lyrics(row.get("suggested_lyrics") or "")
    chosen = row.get("suggested_source") or "unknown"
    if dry_run:
        return True
    meta = load_metadata(folder)
    finalize_lyrics(meta, lyrics, chosen_from=chosen)
    save_metadata(folder, meta)
    return True

def run_batch(
    root: Path,
    rows: list[dict],
    *,
    size: int,
    dry_run: bool,
    reset: bool,
) -> int:
    if not sys.stdin.isatty():
        print("review_lyric_batch.py needs an interactive terminal (TTY).", file=sys.stderr)
        return 2

    cursor = load_batch_cursor()
    start = 0 if reset else int(cursor.get("next_index") or 0)
    if start >= len(rows):
        print(f"Nothing left to page ({len(rows)} suggestions; cursor={start}).")
        print("Run with --review for the dispute queue, or --reset-cursor to start over.")
        return 0

    index = index_folders_by_id(root)
    if reset:
        cursor = {"next_index": 0, "accepted": 0, "disputed": 0, "pages": 0}
        save_batch_cursor(cursor)
        start = 0
    accepted = disputed = skipped = 0
    i = start
    while i < len(rows):
        page = rows[i : i + size]
        print_page(page, start_index=i, total=len(rows))
        try:
            raw = input("> ")
        except (EOFError, KeyboardInterrupt):
            print()
            break
        kind = raw.strip().lower()
        if kind in {"q", "quit"}:
            break
        if kind in {"s", "skip"}:
            skipped += len(page)
            i += len(page)
            cursor["next_index"] = i
            cursor["pages"] = int(cursor.get("pages") or 0) + 1
            save_batch_cursor(cursor)
            continue
        disagree = parse_disagree(raw, len(page))
        if disagree is None:
            continue
        disagree_set = set(disagree)
        page_accepted = 0
        for n, row in enumerate(page, start=1):
            if n in disagree_set:
                append_review_item(row, reason="disputed")
                disputed += 1
                print(f"   #{n} → review  tag {row.get('tag_id')} {row.get('title')}")
            else:
                if finalize_row(root, row, index, dry_run=dry_run):
                    accepted += 1
                    page_accepted += 1
        i += len(page)
        cursor["next_index"] = i
        cursor["accepted"] = int(cursor.get("accepted") or 0) + page_accepted
        cursor["disputed"] = int(cursor.get("disputed") or 0) + len(disagree_set)
        cursor["pages"] = int(cursor.get("pages") or 0) + 1
        save_batch_cursor(cursor)
        print(f"   page done: accepted {page_accepted}, review {len(disagree_set)}")

    print()
    print(
        f"Session: accepted={accepted} disputed={disputed} skipped_page_tags={skipped}  "
        f"next_index={i}/{len(rows)}"
    )
    print(f"Review queue: {review_queue_path()}")
    return 0

def _print_candidates(cands: list[dict]) -> None:
    print()
    print("Sources:")
    for i, c in enumerate(cands, start=1):
        label = c.get("label") or c.get("kind") or "?"
        score = c.get("score")
        text = sentence_case_lyrics(c.get("text") or "")
        wrapped = textwrap.fill(text or "(empty)", width=78, subsequent_indent="      ")
        extra = f"  score={score}" if score is not None else ""
        print(f"  [{i}] {label}{extra}")
        print(f"      {wrapped}")
    print("  [e] type lyrics by hand")
    print("  [s] skip   [q] quit")

def read_typed_lyrics() -> str | None:
    print("Type lyrics. Empty line finishes. A lone empty first line cancels.")
    lines: list[str] = []
    try:
        first = input("lyrics> ")
    except (EOFError, KeyboardInterrupt):
        print()
        return None
    if not first.strip() and not lines:
        return None
    lines.append(first)
    while True:
        try:
            line = input("lyrics> ")
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if line == "":
            break
        lines.append(line)
    text = " ".join(" ".join(lines).split()).strip()
    return text or None

def run_review(root: Path, *, dry_run: bool, reset: bool) -> int:
    if not sys.stdin.isatty():
        print("review_lyric_batch.py needs an interactive terminal (TTY).", file=sys.stderr)
        return 2

    data = load_review_queue()
    items = [it for it in (data.get("items") or []) if it.get("status") != "done"]
    if not items:
        print("Review queue is empty.")
        return 0

    start = 0 if reset else int(data.get("cursor") or 0)
    index = index_folders_by_id(root)
    resolved = 0
    i = start
    while i < len(items):
        item = items[i]
        if item.get("status") == "done":
            i += 1
            continue
        tid = item.get("tag_id")
        folder = index.get(tid) if isinstance(tid, int) else None
        print()
        print("=" * 72)
        print(f"Review {i + 1}/{len(items)}  #{tid}  {item.get('title')}")
        print(f"arranger={item.get('arranger') or '—'}  reason={item.get('reason')}")
        if folder:
            print(f"folder={folder.name}")
        else:
            print("folder=(missing)")
            i += 1
            continue
        meta = load_metadata(folder)
        pick = pick_best(meta)
        cands = pick["candidates"] or collect_candidates(meta)
        # Always put suggested first if present
        sug = item.get("suggested_lyrics")
        if sug and not any(flatten_lyrics(c.get("text")) == flatten_lyrics(sug) for c in cands):
            cands = [{"label": "suggested", "text": sug, "score": None}, *cands]
        _print_candidates(cands)
        print(f"guess: {pick.get('source') or '—'} → {flatten_lyrics(pick.get('text') or '') or '(empty)'}")
        try:
            raw = input("pick # / e / s / q > ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not raw or raw in {"q", "quit"}:
            break
        if raw in {"s", "skip"}:
            i += 1
            data["cursor"] = i
            save_review_queue(data)
            continue
        lyrics = None
        chosen_from = "manual"
        if raw in {"e", "edit"}:
            lyrics = read_typed_lyrics()
            if lyrics is None:
                print("   cancelled")
                continue
            chosen_from = "manual"
        else:
            nums = _IDS.findall(raw)
            if not nums:
                print("   type a source number, e, s, or q")
                continue
            n = int(nums[0])
            if n < 1 or n > len(cands):
                print(f"   out of range (1–{len(cands)})")
                continue
            chosen = cands[n - 1]
            lyrics = sentence_case_lyrics(chosen.get("text") or "")
            chosen_from = chosen.get("label") or "review"
        if not lyrics:
            print("   empty lyrics — not finalized")
            continue
        if dry_run:
            print(f"   dry-run: would finalize from {chosen_from}: {flatten_lyrics(lyrics)[:80]}")
        else:
            finalize_lyrics(meta, lyrics, chosen_from=chosen_from)
            save_metadata(folder, meta)
            print(f"   finalized from {chosen_from}")
        item["status"] = "done"
        item["resolved_from"] = chosen_from
        items[i] = item
        data["items"] = items
        data["cursor"] = i + 1
        data["resolved"] = int(data.get("resolved") or 0) + 1
        save_review_queue(data)
        resolved += 1
        i += 1

    pending = sum(1 for it in items if it.get("status") != "done")
    print()
    print(f"Review session resolved={resolved}  still_pending={pending}")
    return 0

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Guess best lyrics, page-accept them, or review disputes."
    )
    parser.add_argument("--root", type=Path, default=ROOT_DOWNLOAD_DIR)
    parser.add_argument(
        "--analyze",
        action="store_true",
        help="Rebuild suggestions file and exit (no paging)",
    )
    parser.add_argument(
        "--from-cache",
        action="store_true",
        help="Reuse existing suggestions JSONL (skip re-analyze)",
    )
    parser.add_argument(
        "--review",
        action="store_true",
        help="Walk the dispute / empty-lyrics review queue",
    )
    parser.add_argument(
        "--gui",
        action="store_true",
        help="Open the sheet-music review window (use with --review)",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=0,
        help="Tags per page (default: max(50, terminal height))",
    )
    parser.add_argument("--reset-cursor", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.review:
        if args.gui:
            from review_queue_gui import ReviewApp

            return ReviewApp(
                args.root, dry_run=args.dry_run, reset=args.reset_cursor
            ).run()
        return run_review(args.root, dry_run=args.dry_run, reset=args.reset_cursor)

    if args.from_cache and not args.analyze:
        rows = load_suggestions()
        if not rows:
            print("No cached suggestions — analyzing…")
            rows, summary = analyze(args.root)
            print(
                f"Wrote {summary['suggestions']} suggestions → {summary['path']}\n"
                f"Empty/no-guess queued for review: {summary['queued_empty_for_review']}\n"
                f"Auto-queued (nonsense/incomplete/OCR): {summary.get('queued_auto_review', 0)}\n"
                f"stats={summary['stats']}"
            )
        else:
            print(f"Loaded {len(rows)} cached suggestions from {suggestions_path()}")
    else:
        print("Analyzing lyric sources…")
        rows, summary = analyze(args.root)
        print(
            f"Wrote {summary['suggestions']} suggestions → {summary['path']}\n"
            f"Empty/no-guess queued for review: {summary['queued_empty_for_review']}\n"
            f"Auto-queued (nonsense/incomplete/OCR): {summary.get('queued_auto_review', 0)}\n"
            f"stats={summary['stats']}"
        )

    if args.analyze:
        return 0

    return run_batch(
        args.root,
        rows,
        size=page_size(args.page_size),
        dry_run=args.dry_run,
        reset=args.reset_cursor,
    )

if __name__ == "__main__":
    raise SystemExit(main())
