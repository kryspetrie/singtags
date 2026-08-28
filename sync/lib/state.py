"""Persistent sync / inventory state helpers."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

from .config import ROOT_DOWNLOAD_DIR, STATE_DIR

SOURCE_URL_RE = re.compile(r"[?&]id=(\d+)", re.IGNORECASE)
TAG_ID_FOLDER_RE = re.compile(r"\s-\s(\d+)$")


def ensure_state_dir() -> Path:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    return STATE_DIR


def state_path(name: str) -> Path:
    ensure_state_dir()
    return STATE_DIR / name


def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default if default is not None else {}
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    tmp.replace(path)


def load_sync_state() -> dict:
    state = load_json(
        state_path("sync_state.json"),
        default={
            "max_confirmed_id": 0,
            "failures": [],
            "last_run": None,
            "frontier_misses": 0,
            "asr_pending": [],
        },
    )
    if "asr_pending" not in state:
        state["asr_pending"] = []
    return state


def save_sync_state(state: dict) -> None:
    save_json(state_path("sync_state.json"), state)


def extract_id_from_source_url(text: str) -> Optional[int]:
    match = SOURCE_URL_RE.search(text)
    return int(match.group(1)) if match else None


def extract_id_from_folder_name(name: str) -> Optional[int]:
    match = TAG_ID_FOLDER_RE.search(name)
    return int(match.group(1)) if match else None


def read_tag_id_from_folder(folder: Path) -> Optional[int]:
    """Resolve tag id from metadata.json (tag_id / source_url) or folder name."""
    meta_path = folder / "metadata.json"
    if meta_path.exists():
        try:
            meta = load_json(meta_path, default={})
            if isinstance(meta.get("tag_id"), int):
                return meta["tag_id"]
            src = meta.get("source_url")
            if isinstance(src, str) and src.strip():
                tag_id = extract_id_from_source_url(src)
                if tag_id is not None:
                    return tag_id
        except Exception:
            pass

    return extract_id_from_folder_name(folder.name)


def load_metadata(folder: Path) -> dict:
    return load_json(folder / "metadata.json", default={})


def field_has_value(value: Any) -> bool:
    """True when a metadata field should be treated as already set (do not clobber)."""
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return bool(value)
    return True


def save_metadata(folder: Path, meta: dict) -> None:
    save_json(folder / "metadata.json", meta)


def iter_tag_folders(root: Path = ROOT_DOWNLOAD_DIR):
    if not root.exists():
        return
    for path in sorted(root.iterdir()):
        if not path.is_dir():
            continue
        if path.name.startswith("_"):
            continue
        yield path


def find_folder_for_id(tag_id: int, root: Path = ROOT_DOWNLOAD_DIR) -> Optional[Path]:
    """Find an existing folder for tag_id.

    Prefer ``metadata.json`` tag_id over the folder-name suffix — remote ids are
    pseudo-keys and may be reassigned; bulk sync rewrites metadata first.
    """
    name_hit: Optional[Path] = None
    for folder in iter_tag_folders(root):
        meta_path = folder / "metadata.json"
        if meta_path.exists():
            try:
                meta = load_json(meta_path, default={})
                if meta.get("tag_id") == tag_id:
                    return folder
            except Exception:
                pass
        if name_hit is None and extract_id_from_folder_name(folder.name) == tag_id:
            name_hit = folder
    if name_hit is not None:
        return name_hit
    for folder in iter_tag_folders(root):
        if read_tag_id_from_folder(folder) == tag_id:
            return folder
    return None


def index_folders_by_id(root: Path = ROOT_DOWNLOAD_DIR) -> dict[int, Path]:
    """Build tag_id → folder map in one pass (metadata wins over folder-name suffix)."""
    by_name: dict[int, Path] = {}
    by_meta: dict[int, Path] = {}
    for folder in iter_tag_folders(root):
        meta_path = folder / "metadata.json"
        if meta_path.exists():
            try:
                meta = load_json(meta_path, default={})
                tid = meta.get("tag_id")
                if isinstance(tid, int) and tid not in by_meta:
                    by_meta[tid] = folder
                    continue
            except Exception:
                pass
        from_name = extract_id_from_folder_name(folder.name)
        if from_name is not None and from_name not in by_name and from_name not in by_meta:
            by_name[from_name] = folder
    out = dict(by_name)
    out.update(by_meta)
    return out
