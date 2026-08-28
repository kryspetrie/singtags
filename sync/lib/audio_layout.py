"""Classify learning-track stereo layout for ultra-low cache decisions.

Kinds:
  part_left   — featured voice on left, other parts on right
  part_right  — featured voice on right, other parts on left
  mono        — 1 channel or dual-mono (L≈R)
  near_mono   — weak stereo / ambiance only
  stereo_other — real stereo but not part-predominant
  unknown     — missing / decode failure / silence

When multiple part tracks exist, solo_side is inferred by cross-part
correlation: the side that is *similar across parts* is the “others”
accompaniment; the dissimilar side is the solo.
"""

from __future__ import annotations

import array
import math
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .complete import find_audio_part_file
from .config import (
    AUDIO_MIX_DISJOINT_CORR,
    AUDIO_PARTS_RECOMBINE_MIN_MEAN_CORR,
    AUDIO_PARTS_RECOMBINE_MIN_TRUSTED_NONLEAD,
    AUDIO_PARTS_STEREO_CORR,
    AUDIO_PARTS_STEREO_MIN_VOICES,
)

AUDIO_LAYOUT_PARTS = ("lead", "tenor", "bari", "bass", "mix")
VOICE_PARTS = ("lead", "tenor", "bari", "bass")
REF_PART = "lead"

ANALYZE_SECONDS = 5.0
ANALYZE_RATE = 16000

# Classification thresholds (tuned on classic + sample library scans).
CORR_DUAL_MONO = 0.92
BAL_DUAL_MONO = 0.15
CORR_NEAR_MONO = 0.85
SIDE_MID_NEAR_MONO = 0.12
SIDE_MID_SEPARATED = 0.25
CORR_SEPARATED = 0.85
CROSS_PART_MARGIN = 0.12  # min |corr_L − corr_R| to trust cross-part vote


def _rms(samples: array.array) -> float:
    if not samples:
        return 0.0
    acc = 0.0
    for x in samples:
        acc += x * x
    return math.sqrt(acc / len(samples))


def _corr(a: array.array, b: array.array) -> float:
    n = min(len(a), len(b))
    if n < 256:
        return 0.0
    step = max(1, n // 4000)
    sa = a[0:n:step]
    sb = b[0:n:step]
    m = len(sa)
    if m < 64:
        return 0.0
    mean_a = sum(sa) / m
    mean_b = sum(sb) / m
    num = 0.0
    den_a = 0.0
    den_b = 0.0
    for i in range(m):
        da = sa[i] - mean_a
        db = sb[i] - mean_b
        num += da * db
        den_a += da * da
        den_b += db * db
    den = math.sqrt(den_a) * math.sqrt(den_b)
    if den < 1e-12:
        return 0.0
    return max(-1.0, min(1.0, num / den))


def decode_stereo_pcm(
    path: Path,
    *,
    seconds: float = ANALYZE_SECONDS,
    sample_rate: int = ANALYZE_RATE,
) -> Optional[tuple[array.array, array.array, int]]:
    """Return (left, right, channels). Mono files duplicate into both sides."""
    if path.suffix.lower() not in {".mp3", ".m4a", ".mp4", ".ogg", ".wav", ".aac", ".flac"}:
        return None
    try:
        probe = subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=channels",
                "-of",
                "csv=p=0",
                str(path),
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        channels = int(probe.split(",")[0] or probe or "0")
    except (subprocess.CalledProcessError, ValueError, IndexError):
        channels = 0

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

    samples = array.array("h")
    samples.frombytes(raw)
    if len(samples) < sample_rate:  # < ~0.5s stereo
        return None
    left = samples[0::2]
    right = samples[1::2]
    if channels <= 0:
        channels = 2
    return left, right, channels


def metrics_from_lr(left: array.array, right: array.array) -> dict[str, float]:
    rl = _rms(left)
    rr = _rms(right)
    bal = (rl - rr) / (rl + rr + 1e-9)
    corr = _corr(left, right)
    mid = array.array("h", (int((l + r) / 2) for l, r in zip(left, right)))
    side = array.array("h", (int((l - r) / 2) for l, r in zip(left, right)))
    sm = _rms(side) / (_rms(mid) + 1e-9)
    return {
        "balance": round(bal, 4),
        "correlation": round(corr, 4),
        "side_mid": round(sm, 4),
        "rms_left": round(rl, 2),
        "rms_right": round(rr, 2),
    }


def classify_from_metrics(
    *,
    channels: int,
    balance: float,
    correlation: float,
    side_mid: float,
    solo_side_hint: Optional[str] = None,
) -> tuple[str, Optional[str]]:
    """Return (kind, solo_side)."""
    if channels <= 1:
        return "mono", None

    if abs(correlation) >= CORR_DUAL_MONO and abs(balance) < BAL_DUAL_MONO:
        return "mono", None

    if side_mid < SIDE_MID_NEAR_MONO or (
        abs(correlation) >= CORR_NEAR_MONO and abs(balance) < BAL_DUAL_MONO
    ):
        return "near_mono", None

    separated = side_mid >= SIDE_MID_SEPARATED and abs(correlation) < CORR_SEPARATED
    if not separated:
        return "stereo_other", None

    if solo_side_hint in ("left", "right"):
        kind = "part_left" if solo_side_hint == "left" else "part_right"
        return kind, solo_side_hint

    # Fallback without cross-part evidence: quieter side ≈ solo (1 vs 3 voices).
    solo = "left" if balance <= 0 else "right"
    kind = "part_left" if solo == "left" else "part_right"
    return kind, solo


def _mean_pairwise_corr(channels: list[array.array]) -> Optional[float]:
    if len(channels) < 2:
        return None
    vals = []
    for i in range(len(channels)):
        for j in range(i + 1, len(channels)):
            vals.append(_corr(channels[i], channels[j]))
    if not vals:
        return None
    return sum(vals) / len(vals)


def infer_solo_side_from_parts(
    decoded: dict[str, tuple[array.array, array.array, int]],
) -> Optional[str]:
    """Cross-part: accompaniment side correlates across files; solo does not."""
    voice = {k: v for k, v in decoded.items() if k in VOICE_PARTS}
    if len(voice) < 2:
        return None
    lefts = [v[0] for v in voice.values()]
    rights = [v[1] for v in voice.values()]
    corr_l = _mean_pairwise_corr(lefts)
    corr_r = _mean_pairwise_corr(rights)
    if corr_l is None or corr_r is None:
        return None
    # Higher cross-part correlation → that side is shared “others”.
    if corr_r - corr_l >= CROSS_PART_MARGIN:
        return "left"
    if corr_l - corr_r >= CROSS_PART_MARGIN:
        return "right"
    return None


def _part_sha256(meta: dict, part: str) -> Optional[str]:
    info = (meta.get("parts") or {}).get(part) or {}
    sha = info.get("sha256") or info.get("source_sha256")
    return str(sha) if sha else None


def analyze_file(
    path: Path,
    *,
    solo_side_hint: Optional[str] = None,
    decoded: Optional[tuple[array.array, array.array, int]] = None,
) -> dict[str, Any]:
    got = decoded or decode_stereo_pcm(path)
    now = datetime.now(timezone.utc).isoformat()
    if got is None:
        return {
            "kind": "unknown",
            "solo_side": None,
            "channels": 0,
            "analyzed_at": now,
        }
    left, right, channels = got
    m = metrics_from_lr(left, right)
    if m["rms_left"] + m["rms_right"] < 50:
        return {
            "kind": "unknown",
            "solo_side": None,
            "channels": channels,
            **m,
            "analyzed_at": now,
        }
    kind, solo = classify_from_metrics(
        channels=channels,
        balance=m["balance"],
        correlation=m["correlation"],
        side_mid=m["side_mid"],
        solo_side_hint=solo_side_hint,
    )
    return {
        "kind": kind,
        "solo_side": solo,
        "channels": 1 if channels <= 1 else 2,
        **m,
        "analyzed_at": now,
    }


def mix_is_disjoint(meta: dict) -> bool:
    """True when mix audio is unrelated to voice learning tracks (host mix in cache)."""
    summary = meta.get("audio_layout_summary") or {}
    if summary.get("mix_disjoint") is True:
        return True
    return summary.get("mix_cache") == "hosted"


def parts_are_recombinable(meta: dict) -> bool:
    """True when mono-solo extract + client reconstruct is safe for this tag."""
    summary = meta.get("audio_layout_summary") or {}
    if summary.get("parts_recombinable") is False:
        return False
    if summary.get("ultra_low") == "stereo_fallback":
        return False
    return True


def _voice_align_stats(meta: dict) -> tuple[list[str], list[str], list[float]]:
    """Return (nonlead_parts_with_align, trusted_nonlead, nonlead_corrs)."""
    parts = meta.get("parts") or {}
    nonlead: list[str] = []
    trusted: list[str] = []
    corrs: list[float] = []
    for part in VOICE_PARTS:
        if part == REF_PART:
            continue
        entry = parts.get(part)
        if not isinstance(entry, dict):
            continue
        align = entry.get("audio_align")
        if not isinstance(align, dict) or "corr" not in align:
            continue
        nonlead.append(part)
        try:
            corrs.append(float(align.get("corr") or 0.0))
        except (TypeError, ValueError):
            corrs.append(0.0)
        if align.get("trusted"):
            trusted.append(part)
    return nonlead, trusted, corrs


def _high_stereo_voice_count(meta: dict) -> int:
    """Count voice parts that look like full stereo / not a hard solo–accomp split."""
    parts = meta.get("parts") or {}
    n = 0
    for part in VOICE_PARTS:
        layout = (parts.get(part) or {}).get("audio_layout") or {}
        if not isinstance(layout, dict):
            continue
        try:
            corr = float(layout.get("correlation") or 0.0)
        except (TypeError, ValueError):
            corr = 0.0
        kind = layout.get("kind")
        if corr > AUDIO_PARTS_STEREO_CORR or kind in ("near_mono", "stereo_other", "mixed"):
            n += 1
    return n


def apply_parts_recombinability(meta: dict) -> bool:
    """Set parts_recombinable / maybe demote ultra_low to stereo_fallback.

    Returns True when audio_layout_summary changed.
    Respects recombine_reason == \"manual\" (curator override).
    """
    changed = False

    # Refresh align summary status from per-part entries (fixes Lead-always-trusted bug).
    parts = meta.get("parts") or {}
    part_align = {
        p: entry["audio_align"]
        for p in VOICE_PARTS
        if isinstance((entry := parts.get(p)), dict)
        and isinstance(entry.get("audio_align"), dict)
        and "corr" in entry["audio_align"]
    }
    if part_align:
        from .audio_align import summarize_align

        tag_summary = summarize_align(part_align)
        # Preserve analyzed_at from existing summary when status/trusted unchanged.
        prev = meta.get("audio_align_summary") or {}
        if (
            prev.get("status") != tag_summary.get("status")
            or prev.get("trusted_parts") != tag_summary.get("trusted_parts")
            or prev.get("applied_ms") != tag_summary.get("applied_ms")
        ):
            meta["audio_align_summary"] = tag_summary
            changed = True

    summary = dict(meta.get("audio_layout_summary") or {})
    if not summary:
        return changed

    if summary.get("recombine_reason") == "manual" and "parts_recombinable" in summary:
        return changed

    ultra = summary.get("ultra_low") or "stereo_fallback"
    recombinable = True
    reason: str | None = None

    if ultra == "stereo_fallback":
        recombinable = False
        reason = summary.get("recombine_reason") or "stereo_not_split"
    elif ultra == "mono_solos":
        nonlead, trusted_nonlead, corrs = _voice_align_stats(meta)
        mean_corr = sum(corrs) / len(corrs) if corrs else 0.0
        need = min(AUDIO_PARTS_RECOMBINE_MIN_TRUSTED_NONLEAD, len(nonlead)) if nonlead else 0
        h2_fail = bool(nonlead) and (
            len(trusted_nonlead) < need or mean_corr < AUDIO_PARTS_RECOMBINE_MIN_MEAN_CORR
        )
        h3 = _high_stereo_voice_count(meta) >= AUDIO_PARTS_STEREO_MIN_VOICES
        # H3 only as supporting evidence when alignment is weak/borderline.
        h2_weak = bool(nonlead) and (
            h2_fail or mean_corr < (AUDIO_PARTS_RECOMBINE_MIN_MEAN_CORR + 0.2)
        )

        if h2_fail:
            recombinable = False
            reason = "align_untrusted"
        elif h3 and h2_weak:
            recombinable = False
            reason = "stereo_not_split"

    # Mix-disjoint alone does not demote parts (good stems + wrong mix file).

    new_summary = dict(summary)
    new_summary["parts_recombinable"] = recombinable
    if recombinable:
        new_summary.pop("recombine_reason", None)
    elif reason:
        new_summary["recombine_reason"] = reason

    if not recombinable and ultra == "mono_solos":
        new_summary["ultra_low"] = "stereo_fallback"
        # Host mix whenever present — reconstruction from solos is off.
        if "mix" in (meta.get("parts") or {}):
            new_summary["mix_cache"] = "hosted"

    if meta.get("audio_layout_summary") != new_summary:
        meta["audio_layout_summary"] = new_summary
        changed = True
    return changed


def analyze_mix_match(
    decoded: dict[str, tuple[array.array, array.array, int]],
) -> dict[str, Any]:
    """Compare mix mono downmix to each voice part; detect unrelated mix tracks."""
    if "mix" not in decoded:
        return {}
    voice = {k: v for k, v in decoded.items() if k in VOICE_PARTS}
    if len(voice) < 2:
        return {}

    mix_l, mix_r, _ = decoded["mix"]
    mix_m = array.array("h", (int((l + r) / 2) for l, r in zip(mix_l, mix_r)))
    if _rms(mix_m) < 50:
        return {}

    corrs: dict[str, float] = {}
    for part, (vl, vr, _) in voice.items():
        vm = array.array("h", (int((l + r) / 2) for l, r in zip(vl, vr)))
        if _rms(vm) < 50:
            continue
        corrs[part] = round(_corr(vm, mix_m), 4)

    if not corrs:
        return {}

    best = max(corrs.values())
    disjoint = best < AUDIO_MIX_DISJOINT_CORR
    return {
        "mix_correlation": round(best, 4),
        "mix_correlations": corrs,
        "mix_disjoint": disjoint,
        "mix_cache": "hosted" if disjoint else "reconstruct",
    }


def summarize_layouts(part_layouts: dict[str, dict[str, Any]]) -> dict[str, Any]:
    voice_kinds = [
        (part_layouts[p] or {}).get("kind")
        for p in VOICE_PARTS
        if p in part_layouts and part_layouts[p]
    ]
    voice_kinds = [k for k in voice_kinds if k and k != "unknown"]
    mix_kind = (part_layouts.get("mix") or {}).get("kind")

    parts_summary = "unknown"
    solo_side = None
    ultra_low = "stereo_fallback"

    if voice_kinds:
        counts = Counter(voice_kinds)
        top, n = counts.most_common(1)[0]
        if n >= max(2, (len(voice_kinds) + 1) // 2):
            parts_summary = top
        else:
            parts_summary = "mixed"

        sides = [
            (part_layouts[p] or {}).get("solo_side")
            for p in VOICE_PARTS
            if (part_layouts.get(p) or {}).get("solo_side")
        ]
        if sides:
            solo_side = Counter(sides).most_common(1)[0][0]

        if parts_summary in ("part_left", "part_right") and n >= 3:
            ultra_low = "mono_solos"
            if parts_summary == "part_left":
                solo_side = solo_side or "left"
            else:
                solo_side = solo_side or "right"
        elif parts_summary in ("mono", "near_mono") and n >= 3:
            ultra_low = "mono_downmix"
            solo_side = None
        elif sum(1 for k in voice_kinds if k in ("mono", "near_mono")) >= 3:
            ultra_low = "mono_downmix"
            parts_summary = "mono" if "mono" in counts else "near_mono"
            solo_side = None

    return {
        "parts": parts_summary,
        "mix": mix_kind or "unknown",
        "ultra_low": ultra_low,
        "solo_side": solo_side,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }


def ensure_audio_layouts(
    folder: Path,
    meta: dict,
    *,
    force: bool = False,
) -> bool:
    """Analyze local audio parts; write audio_layout on each + summary.

    Returns True if metadata was modified.
    """
    paths: dict[str, Path] = {}
    for part in AUDIO_LAYOUT_PARTS:
        path = find_audio_part_file(folder, part, meta)
        if path is None or not path.is_file():
            continue
        if path.suffix.lower() not in {".mp3", ".m4a", ".mp4", ".ogg", ".wav", ".aac", ".flac"}:
            continue
        paths[part] = path
    if not paths:
        return False

    changed = False
    parts_meta = meta.setdefault("parts", {})

    # Skip when every present part already has layout matching current sha256.
    if not force:
        all_fresh = True
        for part, path in paths.items():
            entry = parts_meta.get(part) or {}
            layout = entry.get("audio_layout") or {}
            sha = _part_sha256(meta, part)
            if not layout.get("kind"):
                all_fresh = False
                break
            if sha and layout.get("source_sha256") and layout.get("source_sha256") != sha:
                all_fresh = False
                break
            if not sha and not layout.get("kind"):
                all_fresh = False
                break
        if all_fresh and meta.get("audio_layout_summary"):
            # Still apply recombinability demotion when flags are missing / outdated.
            return apply_parts_recombinability(meta)

    decoded: dict[str, tuple[array.array, array.array, int]] = {}
    for part, path in paths.items():
        got = decode_stereo_pcm(path)
        if got is not None:
            decoded[part] = got

    solo_hint = infer_solo_side_from_parts(decoded)
    layouts: dict[str, dict[str, Any]] = {}

    for part, path in paths.items():
        hint = solo_hint if part in VOICE_PARTS else None
        layout = analyze_file(path, solo_side_hint=hint, decoded=decoded.get(part))
        sha = _part_sha256(meta, part)
        if sha:
            layout["source_sha256"] = sha
        # Drop bulky rms from stored metadata; keep balance/corr/side_mid.
        layout.pop("rms_left", None)
        layout.pop("rms_right", None)

        entry = parts_meta.setdefault(part, {})
        prev = entry.get("audio_layout")
        if prev != layout:
            entry["audio_layout"] = layout
            changed = True
        layouts[part] = layout

    summary = summarize_layouts(layouts)
    mix_info = analyze_mix_match(decoded)
    if mix_info:
        summary.update(mix_info)

    if meta.get("audio_layout_summary") != summary:
        meta["audio_layout_summary"] = summary
        changed = True

    # Accompaniment-channel timing vs Lead (mono_solos reconstruction).
    from .audio_align import ensure_audio_align

    if ensure_audio_align(folder, meta, force=force):
        changed = True

    # May demote mono_solos → stereo_fallback when parts are not recombinable.
    # Do not re-call ensure_audio_align after demotion (would wipe align diagnostics).
    if apply_parts_recombinability(meta):
        changed = True

    return changed


def process_folder(folder: Path, meta: dict, *, force: bool = False) -> dict:
    """Convenience: ensure layouts and return summary (may mutate meta)."""
    ensure_audio_layouts(folder, meta, force=force)
    return meta.get("audio_layout_summary") or {}
