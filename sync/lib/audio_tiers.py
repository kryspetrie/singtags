"""Publish Opus tiers (playback / ultra-low) alongside mirrored MP3 originals."""

from __future__ import annotations

import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .audio_align import applied_align_ms, ensure_audio_align, ffmpeg_align_filter
from .audio_layout import (
    VOICE_PARTS,
    ensure_audio_layouts,
    mix_is_disjoint,
    parts_are_recombinable,
)
from .complete import audio_parts_present, find_audio_part_file
from .config import (
    AUDIO_ALIGN_MIN_OFFSET_MS,
    AUDIO_PLAYBACK_KBPS,
    AUDIO_STEREO_GOOD_KBPS,
    AUDIO_ULTRA_LOW_MONO_KBPS,
    MAX_FILENAME_LEN,
    PART_DISPLAY,
)
from .http import sha256_bytes
from .names import build_base_name

TIER_PLAYBACK = "playback"
TIER_ULTRA_SOLO = "ultra_solo"
TIER_ULTRA_MIX = "ultra_mix"
TIER_ULTRA_STEREO = "ultra_stereo"
TIER_ULTRA_DOWNMIX = "ultra_downmix"

TIER_SUFFIX = {
    TIER_PLAYBACK: "Playback",
    TIER_ULTRA_SOLO: "Solo",
    TIER_ULTRA_MIX: "Ultra Mix",
    TIER_ULTRA_STEREO: "Ultra",
    TIER_ULTRA_DOWNMIX: "Downmix",
}

AUDIO_PARTS = ("lead", "tenor", "bari", "bass", "mix")
VALID_AUDIO_SUFFIXES = {".mp3", ".m4a", ".mp4", ".ogg", ".wav", ".aac", ".flac"}


def is_valid_audio_source(path: Path | None) -> bool:
    return path is not None and path.is_file() and path.suffix.lower() in VALID_AUDIO_SUFFIXES


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def probe_channels(path: Path) -> int:
    try:
        out = subprocess.check_output(
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
        return max(1, int(out.split(",")[0] or out or "1"))
    except (subprocess.CalledProcessError, ValueError, IndexError):
        return 1


def tier_filename(meta: dict, part: str, tier: str) -> str:
    base = build_base_name(meta.get("title"), meta.get("key"), meta.get("arranger"))
    label = PART_DISPLAY.get(part.lower(), part.capitalize())
    suffix = TIER_SUFFIX[tier]
    name = f"{base} - {label} - {suffix}.opus"
    if len(name) <= MAX_FILENAME_LEN:
        return name
    stem, ext = name.rsplit(".", 1)
    keep = MAX_FILENAME_LEN - len(ext) - 2
    return stem[:keep].rstrip() + "…." + ext


def resolve_solo_side(part: str, meta: dict) -> str:
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
    return "left"


def is_mix_only_tag(folder: Path, meta: dict) -> bool:
    voices = audio_parts_present(folder, meta)
    mix_path = find_audio_part_file(folder, "mix", meta)
    return mix_path is not None and not voices


def ultra_policy(meta: dict) -> str:
    summary = meta.get("audio_layout_summary") or {}
    return str(summary.get("ultra_low") or "stereo_fallback")


def _part_source_sha256(meta: dict, part: str) -> Optional[str]:
    entry = (meta.get("parts") or {}).get(part) or {}
    return entry.get("sha256") or entry.get("source_sha256")


def _tier_entry(meta: dict, part: str) -> dict[str, Any]:
    entry = (meta.setdefault("parts", {}).setdefault(part, {}))
    tiers = entry.setdefault("audio_tiers", {})
    if not isinstance(tiers, dict):
        tiers = {}
        entry["audio_tiers"] = tiers
    return tiers


def _tier_is_fresh(
    meta: dict,
    part: str,
    tier: str,
    source_sha256: Optional[str],
    *,
    align_ms: float = 0.0,
) -> bool:
    if not source_sha256:
        return False
    tiers = ((meta.get("parts") or {}).get(part) or {}).get("audio_tiers") or {}
    info = tiers.get(tier) if isinstance(tiers, dict) else None
    if not isinstance(info, dict):
        return False
    filename = info.get("filename")
    if not filename:
        return False
    if info.get("source_sha256") != source_sha256:
        return False
    try:
        stored = float(info.get("align_applied_ms") or 0.0)
    except (TypeError, ValueError):
        stored = 0.0
    return abs(stored - float(align_ms)) < 0.05


def _join_af(*parts: Optional[str]) -> Optional[str]:
    bits = [p for p in parts if p]
    return ",".join(bits) if bits else None


def _run_ffmpeg(args: list[str]) -> None:
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(err or f"ffmpeg failed ({proc.returncode})")


def encode_playback_opus(
    src: Path,
    dest: Path,
    *,
    channels: int,
    align_ms: float = 0.0,
) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    args = ["-i", str(src)]
    af = ffmpeg_align_filter(align_ms)
    if af:
        args.extend(["-af", af])
    args.extend(["-c:a", "libopus", "-b:a", f"{AUDIO_PLAYBACK_KBPS}k", "-vbr", "off"])
    if channels >= 2:
        args.extend(["-mapping_family", "255"])
    else:
        args.extend(["-ac", "1"])
    args.append(str(dest))
    _run_ffmpeg(args)


def encode_ultra_solo_opus(
    src: Path,
    dest: Path,
    *,
    solo_side: str,
    channels: int,
    align_ms: float = 0.0,
) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if channels < 2:
        pan = "pan=mono|c0=c0"
    elif solo_side == "right":
        pan = "pan=mono|c0=c1"
    else:
        pan = "pan=mono|c0=c0"
    af = _join_af(ffmpeg_align_filter(align_ms), pan)
    args = [
        "-i",
        str(src),
        "-af",
        af or pan,
        "-c:a",
        "libopus",
        "-b:a",
        f"{AUDIO_ULTRA_LOW_MONO_KBPS}k",
        "-vbr",
        "off",
        "-ac",
        "1",
        str(dest),
    ]
    _run_ffmpeg(args)


def encode_ultra_downmix_opus(
    src: Path,
    dest: Path,
    *,
    channels: int,
    align_ms: float = 0.0,
) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if channels < 2:
        pan = "pan=mono|c0=c0"
    else:
        pan = "pan=mono|c0=0.5*c0+0.5*c1"
    af = _join_af(ffmpeg_align_filter(align_ms), pan)
    args = [
        "-i",
        str(src),
        "-af",
        af or pan,
        "-c:a",
        "libopus",
        "-b:a",
        f"{AUDIO_ULTRA_LOW_MONO_KBPS}k",
        "-vbr",
        "off",
        "-ac",
        "1",
        str(dest),
    ]
    _run_ffmpeg(args)


def encode_ultra_stereo_opus(
    src: Path,
    dest: Path,
    *,
    kbps: int = AUDIO_STEREO_GOOD_KBPS,
    align_ms: float = 0.0,
) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    channels = probe_channels(src)
    args = ["-i", str(src)]
    af = ffmpeg_align_filter(align_ms)
    if af:
        args.extend(["-af", af])
    args.extend(["-c:a", "libopus", "-b:a", f"{kbps}k", "-vbr", "off"])
    if channels >= 2:
        args.extend(["-mapping_family", "255"])
    else:
        args.extend(["-ac", "1"])
    args.append(str(dest))
    _run_ffmpeg(args)


def _write_tier_file(
    folder: Path,
    meta: dict,
    part: str,
    tier: str,
    src: Path,
    *,
    encode_fn,
    bitrate_kbps: int,
    channels: int,
    align_ms: float = 0.0,
    extra: Optional[dict[str, Any]] = None,
) -> bool:
    source_sha = _part_source_sha256(meta, part)
    filename = tier_filename(meta, part, tier)
    dest = folder / filename
    tiers = _tier_entry(meta, part)
    existing = tiers.get(tier) if isinstance(tiers.get(tier), dict) else {}
    try:
        existing_align = float(existing.get("align_applied_ms") or 0.0)
    except (TypeError, ValueError):
        existing_align = 0.0
    if (
        existing.get("filename") == filename
        and existing.get("source_sha256") == source_sha
        and abs(existing_align - float(align_ms)) < 0.05
        and dest.is_file()
        and dest.stat().st_size > 0
    ):
        return False

    encode_fn()
    if not dest.is_file() or dest.stat().st_size <= 0:
        raise RuntimeError(f"encoder produced no output: {dest.name}")

    data = dest.read_bytes()
    tiers[tier] = {
        "filename": filename,
        "sha256": sha256_bytes(data),
        "bytes": len(data),
        "codec": "opus",
        "bitrate_kbps": bitrate_kbps,
        "channels": channels,
        "source_sha256": source_sha,
        "align_applied_ms": round(float(align_ms), 1),
        "encoded_at": datetime.now(timezone.utc).isoformat(),
        **(extra or {}),
    }
    return True


def _remove_stale_tier_files(folder: Path, meta: dict, part: str, keep_tiers: set[str]) -> None:
    tiers = ((meta.get("parts") or {}).get(part) or {}).get("audio_tiers") or {}
    if not isinstance(tiers, dict):
        return
    for tier, info in list(tiers.items()):
        if tier in keep_tiers or not isinstance(info, dict):
            continue
        name = info.get("filename")
        if name:
            path = folder / name
            if path.is_file():
                try:
                    path.unlink()
                except OSError:
                    pass
        tiers.pop(tier, None)


def _present_audio_parts(folder: Path, meta: dict) -> list[str]:
    out: list[str] = []
    for part in AUDIO_PARTS:
        src = find_audio_part_file(folder, part, meta)
        if is_valid_audio_source(src):
            out.append(part)
    return out


def _encode_part_playback(folder: Path, meta: dict, part: str, *, force: bool) -> bool:
    src = find_audio_part_file(folder, part, meta)
    if not is_valid_audio_source(src):
        return False
    source_sha = _part_source_sha256(meta, part)
    align_ms = applied_align_ms(meta, part)
    if not force and _tier_is_fresh(meta, part, TIER_PLAYBACK, source_sha, align_ms=align_ms):
        filename = ((meta.get("parts") or {}).get(part) or {}).get("audio_tiers", {}).get(
            TIER_PLAYBACK, {}
        ).get("filename")
        if filename and (folder / filename).is_file():
            return False
    channels = probe_channels(src)
    changed = _write_tier_file(
        folder,
        meta,
        part,
        TIER_PLAYBACK,
        src,
        encode_fn=lambda: encode_playback_opus(
            src,
            folder / tier_filename(meta, part, TIER_PLAYBACK),
            channels=channels,
            align_ms=align_ms,
        ),
        bitrate_kbps=AUDIO_PLAYBACK_KBPS,
        channels=1 if channels < 2 else 2,
        align_ms=align_ms,
    )
    return changed


def _encode_ultra_for_part(
    folder: Path,
    meta: dict,
    part: str,
    *,
    policy: str,
    mix_only: bool,
    force: bool,
) -> bool:
    src = find_audio_part_file(folder, part, meta)
    if not is_valid_audio_source(src):
        return False
    source_sha = _part_source_sha256(meta, part)
    channels = probe_channels(src)
    align_ms = applied_align_ms(meta, part)
    changed = False

    if mix_only and part == "mix":
        tier = TIER_ULTRA_MIX
        if not force and _tier_is_fresh(meta, part, tier, source_sha, align_ms=align_ms):
            return False
        dest = folder / tier_filename(meta, part, tier)
        changed = _write_tier_file(
            folder,
            meta,
            part,
            tier,
            src,
            encode_fn=lambda: encode_ultra_stereo_opus(
                src, dest, kbps=AUDIO_STEREO_GOOD_KBPS, align_ms=align_ms
            ),
            bitrate_kbps=AUDIO_STEREO_GOOD_KBPS,
            channels=1 if channels < 2 else 2,
            align_ms=align_ms,
            extra={"tier_role": "ultra_mix"},
        )
        _remove_stale_tier_files(folder, meta, part, {TIER_PLAYBACK, tier})
        return changed

    if part == "mix" and (mix_is_disjoint(meta) or not parts_are_recombinable(meta)):
        tier = TIER_ULTRA_MIX
        if not force and _tier_is_fresh(meta, part, tier, source_sha, align_ms=align_ms):
            return False
        dest = folder / tier_filename(meta, part, tier)
        changed = _write_tier_file(
            folder,
            meta,
            part,
            tier,
            src,
            encode_fn=lambda: encode_ultra_stereo_opus(
                src, dest, kbps=AUDIO_STEREO_GOOD_KBPS, align_ms=align_ms
            ),
            bitrate_kbps=AUDIO_STEREO_GOOD_KBPS,
            channels=1 if channels < 2 else 2,
            align_ms=align_ms,
            extra={
                "tier_role": "ultra_mix",
                "mix_disjoint": mix_is_disjoint(meta),
                "parts_recombinable": parts_are_recombinable(meta),
            },
        )
        _remove_stale_tier_files(
            folder, meta, part, {TIER_PLAYBACK, tier, TIER_ULTRA_STEREO}
        )
        return changed

    if part not in VOICE_PARTS:
        _remove_stale_tier_files(
            folder,
            meta,
            part,
            {TIER_PLAYBACK, TIER_ULTRA_MIX} if part == "mix" else {TIER_PLAYBACK},
        )
        return False

    if policy == "mono_solos":
        tier = TIER_ULTRA_SOLO
        if not force and _tier_is_fresh(meta, part, tier, source_sha, align_ms=align_ms):
            return False
        solo_side = resolve_solo_side(part, meta)
        dest = folder / tier_filename(meta, part, tier)
        changed = _write_tier_file(
            folder,
            meta,
            part,
            tier,
            src,
            encode_fn=lambda: encode_ultra_solo_opus(
                src, dest, solo_side=solo_side, channels=channels, align_ms=align_ms
            ),
            bitrate_kbps=AUDIO_ULTRA_LOW_MONO_KBPS,
            channels=1,
            align_ms=align_ms,
            extra={"tier_role": "ultra_solo", "solo_side": solo_side},
        )
        _remove_stale_tier_files(folder, meta, part, {TIER_PLAYBACK, tier})
        return changed

    if policy == "mono_downmix":
        tier = TIER_ULTRA_DOWNMIX
        if not force and _tier_is_fresh(meta, part, tier, source_sha, align_ms=align_ms):
            return False
        dest = folder / tier_filename(meta, part, tier)
        changed = _write_tier_file(
            folder,
            meta,
            part,
            tier,
            src,
            encode_fn=lambda: encode_ultra_downmix_opus(
                src, dest, channels=channels, align_ms=align_ms
            ),
            bitrate_kbps=AUDIO_ULTRA_LOW_MONO_KBPS,
            channels=1,
            align_ms=align_ms,
            extra={"tier_role": "ultra_downmix"},
        )
        _remove_stale_tier_files(folder, meta, part, {TIER_PLAYBACK, tier})
        return changed

    # stereo_fallback
    tier = TIER_ULTRA_STEREO
    if not force and _tier_is_fresh(meta, part, tier, source_sha, align_ms=align_ms):
        return False
    dest = folder / tier_filename(meta, part, tier)
    changed = _write_tier_file(
        folder,
        meta,
        part,
        tier,
        src,
        encode_fn=lambda: encode_ultra_stereo_opus(
            src, dest, kbps=AUDIO_STEREO_GOOD_KBPS, align_ms=align_ms
        ),
        bitrate_kbps=AUDIO_STEREO_GOOD_KBPS,
        channels=1 if channels < 2 else 2,
        align_ms=align_ms,
        extra={"tier_role": "ultra_stereo"},
    )
    _remove_stale_tier_files(folder, meta, part, {TIER_PLAYBACK, tier})
    return changed


def ensure_audio_tiers(folder: Path, meta: dict, *, force: bool = False) -> bool:
    """Encode playback + ultra-low Opus tiers for local audio parts.

    Requires ``audio_layout_summary`` (runs layout analysis first when missing).
    Returns True when metadata changed.
    """
    if not ffmpeg_available():
        return False

    changed = False

    if not meta.get("audio_layout_summary"):
        ensure_audio_layouts(folder, meta, force=False)
        changed = True
    else:
        if (meta.get("audio_layout_summary") or {}).get("ultra_low") == "mono_solos":
            # Layout may predate alignment — fill offsets before recombinability demotion.
            if ensure_audio_align(folder, meta, force=False):
                changed = True
        from .audio_layout import apply_parts_recombinability

        if apply_parts_recombinability(meta):
            changed = True

    parts = _present_audio_parts(folder, meta)
    if not parts:
        return False

    mix_only = is_mix_only_tag(folder, meta)
    policy = ultra_policy(meta)
    host_mix = mix_is_disjoint(meta) or not parts_are_recombinable(meta)

    for part in parts:
        if _encode_part_playback(folder, meta, part, force=force):
            changed = True

    if mix_only:
        if _encode_ultra_for_part(
            folder, meta, "mix", policy=policy, mix_only=True, force=force
        ):
            changed = True
    else:
        for part in parts:
            if part in VOICE_PARTS:
                if _encode_ultra_for_part(
                    folder, meta, part, policy=policy, mix_only=False, force=force
                ):
                    changed = True
        if "mix" in parts and host_mix:
            if _encode_ultra_for_part(
                folder, meta, "mix", policy=policy, mix_only=False, force=force
            ):
                changed = True

    align_summary = meta.get("audio_align_summary") or {}
    layout_summary = meta.get("audio_layout_summary") or {}
    summary = {
        "ultra_policy": policy,
        "mix_only": mix_only,
        "mix_disjoint": layout_summary.get("mix_disjoint") is True,
        "mix_cache": layout_summary.get("mix_cache"),
        "parts_recombinable": layout_summary.get("parts_recombinable"),
        "recombine_reason": layout_summary.get("recombine_reason"),
        "playback_kbps": AUDIO_PLAYBACK_KBPS,
        "parts": parts,
        "align_status": align_summary.get("status"),
        "align_applied_ms": align_summary.get("applied_ms") or {},
        "align_min_offset_ms": AUDIO_ALIGN_MIN_OFFSET_MS,
        "encoded_at": datetime.now(timezone.utc).isoformat(),
    }
    if meta.get("audio_tiers_summary") != summary:
        meta["audio_tiers_summary"] = summary
        changed = True

    return changed


def encode_tiers_for_part(folder: Path, meta: dict, part: str, *, force: bool = False) -> bool:
    """Encode tiers for one part after a fresh download."""
    if part not in AUDIO_PARTS:
        return False
    if not ffmpeg_available():
        return False
    if not meta.get("audio_layout_summary"):
        ensure_audio_layouts(folder, meta, force=False)
    elif (meta.get("audio_layout_summary") or {}).get("ultra_low") == "mono_solos":
        ensure_audio_align(folder, meta, force=False)
    mix_only = is_mix_only_tag(folder, meta)
    policy = ultra_policy(meta)
    changed = False
    if _encode_part_playback(folder, meta, part, force=force):
        changed = True
    if mix_only and part == "mix":
        if _encode_ultra_for_part(folder, meta, part, policy=policy, mix_only=True, force=force):
            changed = True
    elif part == "mix" and mix_is_disjoint(meta):
        if _encode_ultra_for_part(folder, meta, part, policy=policy, mix_only=False, force=force):
            changed = True
    elif part in VOICE_PARTS:
        if _encode_ultra_for_part(folder, meta, part, policy=policy, mix_only=False, force=force):
            changed = True
    if changed:
        align_summary = meta.get("audio_align_summary") or {}
        meta["audio_tiers_summary"] = {
            **(meta.get("audio_tiers_summary") or {}),
            "align_status": align_summary.get("status"),
            "align_applied_ms": align_summary.get("applied_ms") or {},
            "align_min_offset_ms": AUDIO_ALIGN_MIN_OFFSET_MS,
            "encoded_at": datetime.now(timezone.utc).isoformat(),
        }
    return changed
