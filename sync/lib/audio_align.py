"""Align voice-part learning tracks for mono-solo reconstruction.

For ``ultra_low == mono_solos`` tags, the non-solo (“accompaniment”) channel is
shared across Lead/Tenor/Bari/Bass. Cross-correlating that channel vs Lead
estimates per-part start offsets so reconstructed mixes stay in sync.

Offsets with ``|offset_ms| < AUDIO_ALIGN_MIN_OFFSET_MS`` are recorded but not
applied. Trusted offsets at/above the threshold are baked into Opus tiers at
encode time (see ``lib/audio_tiers.py``).
"""

from __future__ import annotations

import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Must precede numpy so BLAS does not oversubscribe on short xcorr work.
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import numpy as np

from .audio_layout import VOICE_PARTS
from .complete import find_audio_part_file
from .config import (
    AUDIO_ALIGN_ANALYZE_SECONDS,
    AUDIO_ALIGN_MAX_SEARCH_MS,
    AUDIO_ALIGN_MIN_CORR,
    AUDIO_ALIGN_MIN_CORR_GAIN,
    AUDIO_ALIGN_MIN_OFFSET_MS,
    AUDIO_ALIGN_RATE,
)

REF_PART = "lead"
VALID_AUDIO_SUFFIXES = {".mp3", ".m4a", ".mp4", ".ogg", ".wav", ".aac", ".flac"}


def _solo_side(meta: dict, part: str | None = None) -> Optional[str]:
    """Solo channel for a part / tag (left|right)."""
    if part:
        layout = ((meta.get("parts") or {}).get(part) or {}).get("audio_layout") or {}
        ss = layout.get("solo_side")
        if ss in ("left", "right"):
            return ss
        kind = layout.get("kind")
        if kind == "part_left":
            return "left"
        if kind == "part_right":
            return "right"
    summary = meta.get("audio_layout_summary") or {}
    if summary.get("solo_side") in ("left", "right"):
        return summary["solo_side"]
    if summary.get("parts") == "part_left":
        return "left"
    if summary.get("parts") == "part_right":
        return "right"
    return None


def decode_stereo_f32(
    path: Path,
    *,
    seconds: float = AUDIO_ALIGN_ANALYZE_SECONDS,
    sample_rate: int = AUDIO_ALIGN_RATE,
) -> Optional[tuple[np.ndarray, np.ndarray]]:
    if path.suffix.lower() not in VALID_AUDIO_SUFFIXES:
        return None
    try:
        raw = subprocess.check_output(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                str(path),
                "-t",
                str(seconds),
                "-ac",
                "2",
                "-ar",
                str(sample_rate),
                "-f",
                "s16le",
                "-",
            ],
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    samples = np.frombuffer(raw, dtype=np.int16)
    if samples.size < sample_rate * 2:
        return None
    left = samples[0::2].astype(np.float32)
    right = samples[1::2].astype(np.float32)
    return left, right


def accomp_channel(left: np.ndarray, right: np.ndarray, solo_side: str) -> np.ndarray:
    """Non-solo side (shared trio / accompaniment)."""
    return right if solo_side == "left" else left


def xcorr_lag_samples(
    ref: np.ndarray,
    sig: np.ndarray,
    *,
    max_lag: int,
    downsample: int = 4,
) -> tuple[int, float, float]:
    """Return ``(lag_samples, peak_corr, zero_corr)``.

    Positive lag means ``sig`` is early relative to ``ref`` (shift ``sig`` later
    / adelay to align). Negative lag means ``sig`` is late (trim start of ``sig``).
    """
    n = min(ref.size, sig.size)
    if n < max(256, max_lag * 2):
        return 0, 0.0, 0.0
    ds = max(1, downsample)
    a = ref[:n:ds].astype(np.float64)
    b = sig[:n:ds].astype(np.float64)
    a = a - a.mean()
    b = b - b.mean()
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)
    if na < 1e-9 or nb < 1e-9:
        return 0, 0.0, 0.0
    a = a / na
    b = b / nb
    max_lag_ds = max(1, max_lag // ds)
    corr = np.correlate(a, b, mode="full")
    mid = len(a) - 1
    window = corr[mid - max_lag_ds : mid + max_lag_ds + 1]
    idx = int(np.argmax(window))
    lag_ds = idx - max_lag_ds
    if lag_ds >= 0:
        aa, bb = a[lag_ds:], b[: b.size - lag_ds]
    else:
        aa, bb = a[: a.size + lag_ds], b[-lag_ds:]
    if aa.size < 64:
        return 0, 0.0, 0.0
    aa = aa - aa.mean()
    bb = bb - bb.mean()
    peak = float(np.dot(aa, bb) / ((np.linalg.norm(aa) * np.linalg.norm(bb)) + 1e-12))
    m = min(a.size, b.size)
    az = a[:m] - a[:m].mean()
    bz = b[:m] - b[:m].mean()
    zero = float(np.dot(az, bz) / ((np.linalg.norm(az) * np.linalg.norm(bz)) + 1e-12))
    return lag_ds * ds, peak, zero


def _part_sha(meta: dict, part: str) -> Optional[str]:
    info = (meta.get("parts") or {}).get(part) or {}
    sha = info.get("sha256") or info.get("source_sha256")
    return str(sha) if sha else None


def _align_entry(
    *,
    ref_part: str,
    offset_ms: float,
    corr: float,
    zero_corr: float,
    trusted: bool,
    source_sha256: Optional[str],
) -> dict[str, Any]:
    applied = 0.0
    if trusted and abs(offset_ms) >= AUDIO_ALIGN_MIN_OFFSET_MS:
        applied = round(offset_ms, 1)
    entry: dict[str, Any] = {
        "ref_part": ref_part,
        "offset_ms": round(offset_ms, 1),
        "corr": round(corr, 3),
        "zero_corr": round(zero_corr, 3),
        "trusted": trusted,
        "applied_ms": applied,
        "method": "accomp_xcorr",
        "min_offset_ms": AUDIO_ALIGN_MIN_OFFSET_MS,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }
    if source_sha256:
        entry["source_sha256"] = source_sha256
    return entry


def applied_align_ms(meta: dict, part: str) -> float:
    """Delay (ms) baked into tiers for this part: >0 adelay, <0 trim start, else 0."""
    if part == REF_PART:
        return 0.0
    info = ((meta.get("parts") or {}).get(part) or {}).get("audio_align") or {}
    if not info.get("trusted"):
        return 0.0
    try:
        applied = float(info.get("applied_ms") or 0.0)
    except (TypeError, ValueError):
        return 0.0
    if abs(applied) < AUDIO_ALIGN_MIN_OFFSET_MS:
        return 0.0
    return applied


def ffmpeg_align_filter(align_ms: float) -> Optional[str]:
    """Return an ffmpeg ``-af`` fragment, or None when no adjustment needed."""
    if abs(align_ms) < AUDIO_ALIGN_MIN_OFFSET_MS:
        return None
    if align_ms > 0:
        # Delay whole stream (stereo-safe: both channels).
        ms = int(round(align_ms))
        return f"adelay={ms}|{ms}"
    # Part is late vs Lead — drop leading audio.
    start = abs(align_ms) / 1000.0
    return f"atrim=start={start:.6f},asetpts=PTS-STARTPTS"


def summarize_align(part_align: dict[str, dict[str, Any]]) -> dict[str, Any]:
    trusted = [p for p, a in part_align.items() if a.get("trusted")]
    trusted_nonlead = [p for p in trusted if p != REF_PART]
    nonlead = [p for p in part_align if p != REF_PART]
    applied = {
        p: a.get("applied_ms")
        for p, a in part_align.items()
        if abs(float(a.get("applied_ms") or 0)) >= AUDIO_ALIGN_MIN_OFFSET_MS
    }
    status = "ok"
    if not part_align:
        status = "skipped"
    elif nonlead:
        # Lead is always trusted — require enough *other* voices before status ok.
        need = min(2, len(nonlead))
        if len(trusted_nonlead) < need:
            status = "untrusted"
        elif applied:
            status = "skewed"
    elif applied:
        status = "skewed"
    return {
        "status": status,
        "ref_part": REF_PART,
        "min_offset_ms": AUDIO_ALIGN_MIN_OFFSET_MS,
        "trusted_parts": sorted(trusted),
        "applied_ms": applied,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }


def ensure_audio_align(folder: Path, meta: dict, *, force: bool = False) -> bool:
    """Estimate/write per-part ``audio_align`` for mono_solos tags.

    Returns True when metadata changed.
    """
    summary = meta.get("audio_layout_summary") or {}
    if summary.get("ultra_low") != "mono_solos":
        # Clear stale align data when policy is not mono_solos.
        changed = False
        if meta.pop("audio_align_summary", None) is not None:
            changed = True
        parts = meta.get("parts") or {}
        for part, entry in parts.items():
            if isinstance(entry, dict) and "audio_align" in entry:
                entry.pop("audio_align", None)
                changed = True
        return changed

    solo_side = _solo_side(meta)
    if solo_side not in ("left", "right"):
        return False

    paths: dict[str, Path] = {}
    for part in VOICE_PARTS:
        path = find_audio_part_file(folder, part, meta)
        if path is None or not path.is_file():
            continue
        if path.suffix.lower() not in VALID_AUDIO_SUFFIXES:
            continue
        paths[part] = path
    if REF_PART not in paths or len(paths) < 2:
        return False

    parts_meta = meta.setdefault("parts", {})
    if not force:
        all_fresh = True
        for part, path in paths.items():
            entry = parts_meta.get(part) or {}
            align = entry.get("audio_align") or {}
            sha = _part_sha(meta, part)
            if not align:
                all_fresh = False
                break
            if sha and align.get("source_sha256") and align.get("source_sha256") != sha:
                all_fresh = False
                break
            if part != REF_PART and "offset_ms" not in align:
                all_fresh = False
                break
        if all_fresh and meta.get("audio_align_summary"):
            return False

    decoded: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    for part, path in paths.items():
        got = decode_stereo_f32(path)
        if got is not None:
            decoded[part] = got
    if REF_PART not in decoded:
        return False

    ref_acc = accomp_channel(*decoded[REF_PART], solo_side)
    max_lag = int(AUDIO_ALIGN_RATE * AUDIO_ALIGN_MAX_SEARCH_MS / 1000)
    part_align: dict[str, dict[str, Any]] = {}
    changed = False

    # Lead is the timeline reference.
    lead_entry = _align_entry(
        ref_part=REF_PART,
        offset_ms=0.0,
        corr=1.0,
        zero_corr=1.0,
        trusted=True,
        source_sha256=_part_sha(meta, REF_PART),
    )
    lead_meta = parts_meta.setdefault(REF_PART, {})
    if lead_meta.get("audio_align") != lead_entry:
        lead_meta["audio_align"] = lead_entry
        changed = True
    part_align[REF_PART] = lead_entry

    for part, (left, right) in decoded.items():
        if part == REF_PART:
            continue
        acc = accomp_channel(left, right, solo_side)
        lag, peak, zero = xcorr_lag_samples(ref_acc, acc, max_lag=max_lag)
        # Positive offset_ms => adelay this part; negative => trim start (part is late).
        offset_ms = 1000.0 * lag / AUDIO_ALIGN_RATE
        trusted = (
            peak >= AUDIO_ALIGN_MIN_CORR
            and (peak - zero) >= AUDIO_ALIGN_MIN_CORR_GAIN
        ) or (peak >= AUDIO_ALIGN_MIN_CORR and abs(offset_ms) < AUDIO_ALIGN_MIN_OFFSET_MS)
        # High corr with tiny offset is trusted even if gain is ~0 (already aligned).
        if peak >= AUDIO_ALIGN_MIN_CORR and abs(offset_ms) < 1.0:
            trusted = True
        entry = _align_entry(
            ref_part=REF_PART,
            offset_ms=offset_ms,
            corr=peak,
            zero_corr=zero,
            trusted=trusted,
            source_sha256=_part_sha(meta, part),
        )
        part_meta = parts_meta.setdefault(part, {})
        if part_meta.get("audio_align") != entry:
            part_meta["audio_align"] = entry
            changed = True
        part_align[part] = entry

    tag_summary = summarize_align(part_align)
    if meta.get("audio_align_summary") != tag_summary:
        meta["audio_align_summary"] = tag_summary
        changed = True

    return changed
