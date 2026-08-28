#!/usr/bin/env python3
"""Apply remote tag metadata from the bulk API export (one request).

Do NOT scrape per-tag HTML pages for metadata — that hammers an unindexed DB.
Use ``api.php?n=50000`` once, then match local folders by identity_key (not tag_id).
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
from typing import Any, Optional

from lib.api import fetch_all_tags, load_cached_export
from lib.complete import ACCEPTED_LYRIC_KEYS, lyrics_are_accepted
from lib.config import API_BULK_N, ROOT_DOWNLOAD_DIR
from lib.identity import (
    ensure_identity_fields,
    identity_key,
    index_local_library,
    match_remote_to_folder,
)
from lib.names import build_folder_name
from lib.state import (
    field_has_value,
    find_folder_for_id,
    iter_tag_folders,
    load_metadata,
    load_sync_state,
    read_tag_id_from_folder,
    save_metadata,
    save_sync_state,
    state_path,
)


# Always refresh these from the remote export (volatile / authoritative on origin).
REMOTE_REFRESH_KEYS = {
    "tag_id",
    "source_url",
    "status",
    "title",
    "alt_title",
    "subtitle",
    "version",
    "key",
    "writ_key",
    "arranger",
    "arranger_website",
    "year",
    "parts_count",
    "type",
    "recording",
    "teach_vid",
    "collection",
    "classic",
    "posted_by",
    "provider",
    "provider_website",
    "learning_tracks_by",
    "quartet_website",
    "teacher",
    "teacher_website",
    "made_famous_by",
    "sung_website",
    "sung_year",
    "rating",
    "votes",
    "rating_count",
    "date_posted",
    "download_count",
    "stamp",
    "last_updated_remote",
    "sheet_alt_url",
    "comments",
    "notes",
    "keywords",
    "discovered_assets",
    "videos",
    "remote",
    "metadata_source",
    "identity_key",
    "identity_hash",
    "identity",
}

LOCAL_ONLY_KEYS = {
    "parts",
    "files",
    "sheet_text",
    "sheet_text_method",
    "ocr_raw",
    "ocr_confidence",
    "part_lyrics",
    "folder_name",
    "lyrics_reviewed_at",
    "downloaded_at",
    "sheet_format",
    "lyrics_asr_part",
    "lyrics_finalized",
    "lyrics_finalized_at",
    "lyrics_chosen_from",
}


def merge_metadata(existing: dict, remote: dict, *, refresh_remote: bool = True) -> dict:
    """Merge a remote API row into local metadata.

    When ``refresh_remote`` is True (bulk sync), origin fields overwrite local
    mirrors of those fields. Local-only keys and accepted/manual lyrics are kept.
    """
    merged = dict(existing)

    if refresh_remote:
        for key in REMOTE_REFRESH_KEYS:
            if key in remote:
                merged[key] = remote[key]
        if remote.get("arranger"):
            merged["arranger_source"] = remote.get("arranger_source") or "api"
    else:
        for key, value in remote.items():
            if key in LOCAL_ONLY_KEYS:
                continue
            if key in {"lyrics", "lyrics_source", "arranger_source"}:
                continue
            if field_has_value(merged.get(key)):
                continue
            if field_has_value(value):
                merged[key] = value

    # Lyrics: never clobber accepted/manual review; otherwise prefer remote API
    # text when refreshing, or fill gaps only when not refreshing.
    remote_lyrics = remote.get("lyrics")
    if remote_lyrics in {":", "", "Comments:", "Lyrics:"}:
        remote_lyrics = None
    existing_lyrics = existing.get("lyrics")
    existing_source = existing.get("lyrics_source")

    if lyrics_are_accepted(existing):
        for key in ACCEPTED_LYRIC_KEYS:
            if key in existing:
                merged[key] = existing[key]
    elif existing_source == "manual" and field_has_value(existing_lyrics):
        merged["lyrics"] = existing_lyrics
        merged["lyrics_source"] = "manual"
        if existing.get("lyrics_reviewed_at"):
            merged["lyrics_reviewed_at"] = existing["lyrics_reviewed_at"]
    elif refresh_remote and field_has_value(remote_lyrics):
        merged["lyrics"] = remote_lyrics
        merged["lyrics_source"] = "api"
    elif field_has_value(existing_lyrics):
        merged["lyrics"] = existing_lyrics
        if existing_source:
            merged["lyrics_source"] = existing_source
    elif field_has_value(remote_lyrics):
        merged["lyrics"] = remote_lyrics
        merged["lyrics_source"] = "api"

    # Preserve every local-only key from existing
    for key in LOCAL_ONLY_KEYS:
        if key in existing:
            merged[key] = existing[key]

    ensure_identity_fields(merged)
    merged["enriched_at"] = datetime.now(timezone.utc).isoformat()
    return merged


def ensure_tag_folder(tag_id: int, meta: dict, root: Path) -> Path:
    existing = find_folder_for_id(tag_id, root)
    folder_name = build_folder_name(
        tag_id,
        meta.get("title") or f"Tag {tag_id}",
        meta.get("key"),
        meta.get("arranger"),
    )
    target = root / folder_name
    if existing is None:
        target.mkdir(parents=True, exist_ok=True)
        return target
    if existing.resolve() == target.resolve():
        return existing
    return existing


def apply_remote_row(
    remote: dict,
    root: Path,
    local_index: dict,
    *,
    claimed: set[Path],
    create_missing: bool = True,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Match one remote row to a local folder and write merged metadata."""
    from lib.complete import has_usable_media, remote_advertises_media

    tag_id = remote.get("tag_id")
    folder, method = match_remote_to_folder(remote, local_index, claimed=claimed)
    advertises = remote_advertises_media(remote)

    if folder is None and create_missing and isinstance(tag_id, int):
        # Do not create stubs for origin rows with no sheet/audio (deleted / empty).
        if not advertises:
            return {
                "status": "skipped_no_media",
                "tag_id": tag_id,
                "title": remote.get("title"),
                "method": "no_media",
            }
        if dry_run:
            return {"status": "would_create", "tag_id": tag_id, "method": "new"}
        folder = ensure_tag_folder(tag_id, remote, root)
        method = "created"
    elif folder is None:
        return {
            "status": "unmatched",
            "tag_id": tag_id,
            "identity_key": remote.get("identity_key"),
            "title": remote.get("title"),
        }

    claimed.add(folder)
    existing = load_metadata(folder) if (folder / "metadata.json").exists() else {}
    merged = merge_metadata(existing, remote, refresh_remote=True)
    merged["folder_name"] = folder.name
    merged["match_method"] = method
    if isinstance(tag_id, int):
        merged["tag_id"] = tag_id
    # Origin listing with no sheet/audio (or local empty stub) → hide from catalog.
    if not advertises and not has_usable_media(folder, merged):
        merged["status"] = "unavailable"
        merged["unavailable_reason"] = "no_remote_media"
    if dry_run:
        return {
            "status": "ok",
            "tag_id": tag_id,
            "folder": folder.name,
            "method": method,
            "title": remote.get("title"),
        }

    save_metadata(folder, merged)
    return {
        "status": "ok",
        "tag_id": tag_id,
        "folder": folder.name,
        "method": method,
        "title": remote.get("title"),
    }


def apply_bulk_export(
    root: Path,
    *,
    export: Optional[dict] = None,
    fetch: bool = True,
    n: int = API_BULK_N,
    create_missing: bool = True,
    dry_run: bool = False,
    limit: int = 0,
) -> dict[str, Any]:
    """Fetch (or reuse) full API export and refresh all local metadata.json files."""
    if export is None:
        if fetch:
            export = fetch_all_tags(n=n)
        else:
            export = load_cached_export()
    if export is None:
        return {"ok": False, "error": "no_export"}

    tags = export.get("tags") or []
    if limit:
        tags = tags[:limit]

    local_index = index_local_library(root)
    claimed: set[Path] = set()
    stats = {
        "ok": True,
        "available": export.get("available"),
        "export_count": len(export.get("tags") or []),
        "applied": 0,
        "created": 0,
        "matched_identity": 0,
        "matched_sheet_alt": 0,
        "matched_tag_id": 0,
        "skipped_no_media": 0,
        "unmatched": 0,
        "errors": 0,
    }
    unmatched_rows: list[dict] = []

    print(
        f"Applying bulk metadata to library ({len(tags)} remote row(s), "
        f"{len(local_index['folders'])} local folder(s))..."
    )
    for remote in tags:
        try:
            result = apply_remote_row(
                remote,
                root,
                local_index,
                claimed=claimed,
                create_missing=create_missing,
                dry_run=dry_run,
            )
        except Exception as exc:
            stats["errors"] += 1
            print(f"   error on id={remote.get('tag_id')}: {exc}")
            continue

        status = result.get("status")
        method = result.get("method")
        if status == "ok":
            stats["applied"] += 1
            if method == "created":
                stats["created"] += 1
            elif method == "identity":
                stats["matched_identity"] += 1
            elif method == "identity_loose":
                stats["matched_identity"] += 1
            elif method == "sheet_alt":
                stats["matched_sheet_alt"] += 1
            elif method == "tag_id":
                stats["matched_tag_id"] += 1
            if stats["applied"] <= 5 or stats["applied"] % 500 == 0:
                print(
                    f"   [{stats['applied']}] #{result.get('tag_id')} "
                    f"← {method} → {result.get('folder')}"
                )
        elif status == "would_create":
            stats["created"] += 1
        elif status == "skipped_no_media":
            stats["skipped_no_media"] += 1
        else:
            stats["unmatched"] += 1
            unmatched_rows.append(result)

    # Local folders never claimed by a remote row (removed from origin export).
    orphans = [f for f in local_index["folders"] if f not in claimed]
    stats["local_orphans"] = len(orphans)
    unavailable_orphans = 0
    if orphans and not dry_run:
        orphan_list = []
        for folder in orphans:
            meta = load_metadata(folder) if (folder / "metadata.json").exists() else {}
            orphan_list.append(
                {
                    "folder": folder.name,
                    "tag_id": meta.get("tag_id") or read_tag_id_from_folder(folder),
                    "identity_key": meta.get("identity_key") or identity_key(meta),
                }
            )
            # Gone from the bulk export and no local media → treat as deleted.
            from lib.complete import has_usable_media

            if not has_usable_media(folder, meta):
                meta = dict(meta)
                meta["status"] = "unavailable"
                meta["unavailable_reason"] = "removed_from_remote_export"
                save_metadata(folder, meta)
                unavailable_orphans += 1
        from lib.state import save_json

        save_json(state_path("local_orphans.json"), orphan_list)
    stats["unavailable_orphans"] = unavailable_orphans

    state = load_sync_state()
    ids = [t.get("tag_id") for t in (export.get("tags") or []) if isinstance(t.get("tag_id"), int)]
    if ids:
        state["max_confirmed_id"] = max(ids)
    state["last_run"] = datetime.now(timezone.utc).isoformat()
    state["last_bulk_export_stamp"] = export.get("stamp")
    state["last_bulk_export_count"] = len(export.get("tags") or [])
    state["last_bulk_export_at"] = export.get("fetched_at") or state["last_run"]
    if not dry_run:
        save_sync_state(state)

    print(
        f"Bulk apply done: applied={stats['applied']} created={stats['created']} "
        f"identity={stats['matched_identity']} sheet_alt={stats['matched_sheet_alt']} "
        f"tag_id={stats['matched_tag_id']} unmatched={stats['unmatched']} "
        f"orphans={stats['local_orphans']} errors={stats['errors']}"
    )
    return stats


def enrich_id(tag_id: int, root: Path, dry_run: bool = False) -> Optional[dict]:
    """Deprecated path: prefer apply_bulk_export.

    Kept for callers that pass a single id. Uses cached bulk export when possible
    so we do not hit per-tag HTML pages.
    """
    export = load_cached_export()
    if export is None:
        print(
            "   No cached remote_export.xml — run: python enrich.py --bulk "
            "(refuses per-tag HTML scrape to protect origin)"
        )
        return None

    remote = next((t for t in export["tags"] if t.get("tag_id") == tag_id), None)
    if remote is None:
        print(f"   Tag #{tag_id}: not in cached export")
        return {"tag_id": tag_id, "status": "not_found"}

    local_index = index_local_library(root)
    claimed: set[Path] = set()
    result = apply_remote_row(
        remote,
        root,
        local_index,
        claimed=claimed,
        create_missing=True,
        dry_run=dry_run,
    )
    if result.get("status") != "ok":
        return {"tag_id": tag_id, "status": "not_found"}
    folder = find_folder_for_id(tag_id, root)
    if folder is None:
        # May have matched by identity under a different previous id — search claimed
        for path in claimed:
            return load_metadata(path)
        return remote
    return load_metadata(folder)


def iter_ids_from_library(root: Path) -> list[int]:
    ids: set[int] = set()
    for folder in iter_tag_folders(root):
        tag_id = read_tag_id_from_folder(folder)
        if tag_id is not None:
            ids.add(tag_id)
    return sorted(ids)


def parse_id_list(text: str) -> list[int]:
    ids: list[int] = []
    for chunk in text.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if "-" in chunk:
            a, b = chunk.split("-", 1)
            ids.extend(range(int(a), int(b) + 1))
        else:
            ids.append(int(chunk))
    return ids


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enrich tag metadata from bulk API export (one request)"
    )
    parser.add_argument("--root", type=Path, default=ROOT_DOWNLOAD_DIR)
    parser.add_argument(
        "--bulk",
        action="store_true",
        help="Fetch api.php?n=N once and refresh all local metadata (recommended)",
    )
    parser.add_argument(
        "--from-cache",
        action="store_true",
        help="Reuse _state/remote_export.xml instead of fetching",
    )
    parser.add_argument(
        "--n",
        type=int,
        default=API_BULK_N,
        help=f"API page size (default {API_BULK_N} — entire DB in one shot)",
    )
    parser.add_argument("--ids", type=str, help="Apply cached export rows for these ids only")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="Apply at most N remote rows")
    parser.add_argument(
        "--no-create",
        action="store_true",
        help="Do not create folders for remote tags missing locally",
    )
    args = parser.parse_args()

    if args.bulk or args.from_cache or not args.ids:
        if not args.bulk and not args.from_cache and not args.ids:
            # Default action: bulk
            args.bulk = True
        stats = apply_bulk_export(
            args.root,
            fetch=not args.from_cache,
            n=args.n,
            create_missing=not args.no_create,
            dry_run=args.dry_run,
            limit=args.limit,
        )
        if not stats.get("ok"):
            raise SystemExit(1)
        return

    # Targeted ids from cache only
    export = load_cached_export()
    if export is None:
        print("No cached export; run with --bulk first")
        raise SystemExit(1)
    want = set(parse_id_list(args.ids))
    export = {**export, "tags": [t for t in export["tags"] if t.get("tag_id") in want]}
    apply_bulk_export(
        args.root,
        export=export,
        fetch=False,
        create_missing=not args.no_create,
        dry_run=args.dry_run,
        limit=args.limit,
    )


if __name__ == "__main__":
    main()
