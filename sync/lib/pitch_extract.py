#!/usr/bin/env python3
"""Extract TTBB pitch stacks from learning-track solos into a tag folder.

Uses the same solo-channel + alignment metadata as SingTags encode
(``audio_layout.solo_side``, ``audio_align.offset_ms`` / Solo.opus bake).

Writes next to ``metadata.json``:
  - ``pitch_stacks.json`` — timeline + nature guesses
  - ``pitch_studio.json`` — Tag Studio project JSON
  - ``pitch_summary.txt`` — human-readable progression
"""

from __future__ import annotations

import gzip
import json
import math
import os
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

import numpy as np

STACKS_FILENAME = "pitch_stacks.json"
STUDIO_FILENAME = "pitch_studio.json"
SUMMARY_FILENAME = "pitch_summary.txt"

VOICE_PARTS = ("bass", "bari", "lead", "tenor")  # low→high for reporting
ALIGN_PARTS = ("lead", "tenor", "bari", "bass")

SR = 22050
HOP = 512
WIN = 2048
FMIN = 65.0
FMAX = 1000.0

# Soft TTBB MIDI homes (guide tracks often sit mid-keyboard; correction is soft).
PART_MIDI_HOME = {
    "bass": (36, 55),
    "bari": (45, 62),
    "lead": (50, 67),
    "tenor": (55, 74),
}

# Pitch-class templates: (nature_id, offsets from root)
NATURES: list[tuple[str, tuple[int, ...]]] = [
    ("ninth", (0, 2, 4, 7, 10)),
    ("seventh", (0, 4, 7, 10)),
    ("m7", (0, 3, 7, 10)),
    ("major", (0, 4, 7)),
    ("minor", (0, 3, 7)),
    ("sixth", (0, 4, 7, 9)),
    ("madd6", (0, 3, 7, 9)),
    ("dim7", (0, 3, 6, 9)),
    ("halfdim", (0, 3, 6, 10)),
    ("aug", (0, 4, 8)),
]


def _pc(m: int) -> int:
    return int(m) % 12


def parse_tonality(meta: dict) -> tuple[int, str]:
    """Return (root_pc, mode) from writ_key / key."""
    wk = (meta.get("writ_key") or meta.get("key") or "").strip()
    # Major:Bb / Bb Major / Major:Bb
    name = wk
    mode = "major"
    if ":" in wk:
        mode_s, name = wk.split(":", 1)
        mode = "minor" if "min" in mode_s.lower() else "major"
    elif "min" in wk.lower():
        mode = "minor"
        name = wk.split()[0] if wk.split() else wk
    else:
        name = wk.replace("Major", "").replace("major", "").strip() or wk
    names = {
        "c": 0,
        "b#": 0,
        "db": 1,
        "c#": 1,
        "d": 2,
        "eb": 3,
        "d#": 3,
        "e": 4,
        "fb": 4,
        "f": 5,
        "e#": 5,
        "gb": 6,
        "f#": 6,
        "g": 7,
        "ab": 8,
        "g#": 8,
        "a": 9,
        "bb": 10,
        "a#": 10,
        "b": 11,
        "cb": 11,
    }
    key = name.lower().replace(" ", "").replace("♭", "b").replace("♯", "#")
    for tok in (key, key[:2], key[:1]):
        if tok in names:
            return names[tok], mode
    return 0, mode


def solo_side_for(meta: dict, part: str) -> Optional[str]:
    """Which channel holds the featured part (part_left → left)."""
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


def pitch_channel_for(meta: dict, part: str, *, kind: str) -> Optional[str]:
    """Channel to feed YIN.

    Learning tracks are Part-Left: featured voice on the **left** channel, other
    parts on the right. Downmix / mono average destroys that isolation.

    - ``solo_opus``: already the isolated left bake → no further pan
    - everything else (stereo MP3, etc.): **always left**, even when layout was
      mis-tagged mono/near_mono (common on polecats)
    """
    del meta, part  # channel policy is fixed for this pipeline
    if kind == "solo_opus":
        return None
    return "left"


def offset_ms_for(meta: dict, part: str) -> float:
    info = ((meta.get("parts") or {}).get(part) or {}).get("audio_align") or {}
    if info.get("applied_ms") is not None:
        return float(info["applied_ms"])
    if info.get("trusted") and info.get("offset_ms") is not None:
        return float(info["offset_ms"])
    return 0.0


def resolve_audio_path(folder: Path, meta: dict, part: str) -> tuple[Path, str]:
    """Return (path, kind) for pitch extract.

    Prefer Solo.opus (already left-isolated) else the stereo part MP3 so we can
    take the left channel. Never use Downmix — that blends L+R and ruins Part-Left.
    """
    info = (meta.get("parts") or {}).get(part) or {}
    tiers = info.get("audio_tiers") or {}
    solo = tiers.get("ultra_solo") or {}
    if solo.get("filename"):
        p = folder / solo["filename"]
        if p.is_file():
            return p, "solo_opus"
    fn = info.get("filename")
    if fn:
        p = folder / fn
        if p.is_file():
            return p, "mp3"
    for p in folder.glob(f"* - {part.capitalize()} - Solo.opus"):
        return p, "solo_opus"
    for p in folder.glob(f"* - {part.capitalize()}.mp3"):
        return p, "mp3"
    for p in folder.glob(f"* - {part.title()}.mp3"):
        return p, "mp3"
    raise FileNotFoundError(f"No audio for {part} in {folder.name}")


# Progressive loudness stages: start with peak-normalize only, then gently
# compress more if the arrangement is still sparse. Avoid crushing/clipping.
LOUDNESS_STAGES: list[dict[str, Any]] = [
    {"name": "normalize", "ffmpeg": "loudnorm=I=-16:TP=-1.5:LRA=11", "numpy_comp": 0.0},
    {
        "name": "light_comp",
        "ffmpeg": (
            "loudnorm=I=-16:TP=-1.5:LRA=11,"
            "acompressor=threshold=-20dB:ratio=3:attack=8:release=120:makeup=4:knee=4:detection=rms"
        ),
        "numpy_comp": 0.35,
    },
    {
        "name": "medium_comp",
        "ffmpeg": (
            "loudnorm=I=-14:TP=-1.5:LRA=8,"
            "acompressor=threshold=-24dB:ratio=5:attack=6:release=100:makeup=7:knee=5:detection=rms"
        ),
        "numpy_comp": 0.55,
    },
    {
        "name": "strong_comp",
        "ffmpeg": (
            "loudnorm=I=-14:TP=-1.5:LRA=7,"
            "acompressor=threshold=-28dB:ratio=7:attack=5:release=90:makeup=10:knee=6:detection=rms,"
            "alimiter=limit=0.95:level=false"
        ),
        "numpy_comp": 0.75,
    },
]


def peak_normalize(x: np.ndarray, peak: float = 0.95) -> np.ndarray:
    if x.size == 0:
        return x
    m = float(np.max(np.abs(x)))
    if m < 1e-9:
        return x
    return (x * np.float32(peak / m)).astype(np.float32)


def soft_compress(x: np.ndarray, amount: float) -> np.ndarray:
    """Gentle envelope compression (amount 0..1). No hard clipping boosts."""
    if x.size == 0 or amount <= 1e-6:
        return peak_normalize(x)
    y = np.asarray(x, dtype=np.float64)
    hop = 512
    n = max(1, len(y) // hop)
    env = np.empty(n, dtype=np.float64)
    for i in range(n):
        seg = y[i * hop : (i + 1) * hop]
        env[i] = math.sqrt(float(np.mean(seg * seg)) + 1e-12)
    if n >= 5:
        env = np.convolve(env, np.ones(5) / 5.0, mode="same")
    target = float(np.percentile(env, 75)) if n else 0.1
    target = max(target, 0.04)
    # ratio grows with amount; cap makeup
    ratio = 1.0 + 5.0 * amount
    max_boost = 1.0 + 4.0 * amount
    gain = np.ones(n, dtype=np.float64)
    for i, e in enumerate(env):
        if e < 1e-5:
            gain[i] = 0.0
            continue
        if e < target:
            boost = (target / e) ** (1.0 - 1.0 / ratio)
            gain[i] = min(max_boost, boost)
        else:
            gain[i] = (target / e) ** 0.15
    idx = np.clip(np.arange(len(y)) / hop, 0, n - 1)
    g = np.interp(idx, np.arange(n), gain)
    out = (y * g).astype(np.float32)
    return peak_normalize(out)


def decode_mono(
    path: Path,
    *,
    solo_side: Optional[str],
    offset_ms: float,
    sample_rate: int = SR,
    loudness_stage: int = 0,
) -> np.ndarray:
    """Decode featured-part mono (Part-Left → left channel) + staged loudness."""
    af: list[str] = []
    # Positive offset = pad start (part early vs Lead); negative = trim start.
    if offset_ms >= 50:
        af.append(f"adelay={int(offset_ms)}|{int(offset_ms)}")
    elif offset_ms <= -50:
        af.append(f"atrim=start={abs(offset_ms) / 1000.0}")
        af.append("asetpts=PTS-STARTPTS")

    chan: list[str]
    if solo_side == "left":
        # Part-Left learning track: featured voice ONLY on left.
        af.append("pan=mono|c0=c0")
        chan = []
    elif solo_side == "right":
        af.append("pan=mono|c0=c1")
        chan = []
    elif path.suffix.lower() == ".opus":
        # Baked Solo.opus is already the isolated featured channel.
        chan = ["-ac", "1"]
    else:
        # Stereo without layout: still take left (never average L+R).
        af.append("pan=mono|c0=c0")
        chan = []

    stage = LOUDNESS_STAGES[max(0, min(loudness_stage, len(LOUDNESS_STAGES) - 1))]
    af.append(str(stage["ffmpeg"]))

    cmd = ["ffmpeg", "-v", "error", "-i", str(path)]
    if af:
        cmd += ["-af", ",".join(af)]
    cmd += chan + ["-ar", str(sample_rate), "-f", "f32le", "-"]
    raw = subprocess.check_output(cmd, stderr=subprocess.DEVNULL)
    audio = np.frombuffer(raw, dtype=np.float32).copy()
    audio = soft_compress(audio, float(stage.get("numpy_comp") or 0.0))
    return audio


def yin_f0(x: np.ndarray, sr: int = SR, *, rms_gate: float = 0.0020) -> np.ndarray:
    """Frame-wise YIN fundamental estimate (Hz); NaN when unvoiced."""
    hop, win = HOP, WIN
    tau_min = max(2, int(sr / FMAX))
    tau_max = min(win - 2, int(sr / FMIN))
    out = np.full((max(0, (len(x) - win) // hop + 1),), np.nan, dtype=np.float64)
    if out.size == 0:
        return out
    # Pre-emphasize slightly
    y = np.ascontiguousarray(x, dtype=np.float64)
    thresh = 0.12
    for i in range(out.size):
        frame = y[i * hop : i * hop + win]
        rms = math.sqrt(float(np.mean(frame * frame)) + 1e-20)
        if rms < rms_gate:
            continue
        # Difference function
        w = frame - frame.mean()
        # Autocorr via FFT
        n = win * 2
        fa = np.fft.rfft(w, n)
        ac = np.fft.irfft(fa * np.conjugate(fa), n)[:win].real
        # YIN d(tau) = 2*(ac[0]-ac[tau]) for power-normalized; use cumulative mean norm
        d = ac[0] - ac
        d[0] = 1.0
        cum = np.cumsum(d)
        d_norm = np.empty_like(d)
        d_norm[0] = 1.0
        idxs = np.arange(1, win)
        d_norm[1:] = d[1:] * idxs / (cum[1:] + 1e-12)
        seg = d_norm[tau_min:tau_max]
        if seg.size < 3:
            continue
        # Absolute threshold
        below = np.where(seg < thresh)[0]
        if below.size:
            j = int(below[0])
            # refine to local min
            while j + 1 < seg.size and seg[j + 1] < seg[j]:
                j += 1
            tau = tau_min + j
        else:
            j = int(np.argmin(seg))
            if seg[j] > 0.35:
                continue
            tau = tau_min + j
        # Parabolic interpolation
        if 1 <= tau < win - 1:
            s0, s1, s2 = d_norm[tau - 1], d_norm[tau], d_norm[tau + 1]
            denom = 2 * (2 * s1 - s0 - s2)
            if abs(denom) > 1e-9:
                tau = tau + (s0 - s2) / denom
        out[i] = sr / tau
    return out


def hz_to_midi(f: np.ndarray) -> np.ndarray:
    m = np.full_like(f, np.nan, dtype=np.float64)
    ok = np.isfinite(f) & (f > 0)
    m[ok] = 69.0 + 12.0 * np.log2(f[ok] / 440.0)
    return m


def median_filter_nan(m: np.ndarray, k: int = 5) -> np.ndarray:
    if k < 2:
        return m
    r = k // 2
    out = m.copy()
    for i in range(len(m)):
        w = m[max(0, i - r) : i + r + 1]
        w = w[np.isfinite(w)]
        if w.size:
            out[i] = float(np.median(w))
    return out


def quantize_midi(m: np.ndarray) -> np.ndarray:
    q = np.full(len(m), -1, dtype=np.int16)
    ok = np.isfinite(m)
    q[ok] = np.rint(m[ok]).astype(np.int16)
    return q


def prefer_octave(midi: int, part: str, lead_midi: Optional[int]) -> int:
    """Nudge ±1–2 octaves toward part home / TTBB order without changing PC."""
    lo, hi = PART_MIDI_HOME[part]
    candidates = [midi + 12 * k for k in range(-3, 4)]
    best = midi
    best_score = 1e9
    for c in candidates:
        if c < 28 or c > 84:
            continue
        score = 0.0
        if c < lo:
            score += lo - c
        elif c > hi:
            score += c - hi
        if lead_midi is not None:
            if part == "tenor" and c < lead_midi:
                score += (lead_midi - c) * 1.5
            if part == "bass" and c > lead_midi:
                score += (c - lead_midi) * 1.2
            if part == "bari" and abs(c - lead_midi) > 12:
                score += 2.0
        if score < best_score:
            best_score = score
            best = c
    return best


def correct_stack_octaves(stack: dict[str, int]) -> dict[str, int]:
    lead = stack.get("lead")
    out = dict(stack)
    if lead is None:
        return out
    out["lead"] = prefer_octave(out["lead"], "lead", None)
    lead = out["lead"]
    for part in ("bass", "bari", "tenor"):
        if part in out:
            out[part] = prefer_octave(out[part], part, lead)
    # Re-assert tenor ≥ lead when a +12 fix is free
    if "tenor" in out and out["tenor"] < lead and out["tenor"] + 12 <= 84:
        out["tenor"] = out["tenor"] + 12
    return out


def guess_nature(midi: dict[str, int], tonality: int) -> dict[str, Any]:
    pcs = sorted({_pc(m) for m in midi.values()})
    if not pcs:
        return {"natureId": "unknown", "rootPc": tonality, "confidence": 0.0}
    best: Optional[tuple[float, str, int, int]] = None  # score, nature, root, missing
    for nature_id, offs in NATURES:
        tone_set = set(offs)
        for root in range(12):
            tones = { (root + o) % 12 for o in offs }
            if not set(pcs).issubset(tones):
                continue
            missing = len(tones - set(pcs))
            # Prefer fuller covers, prefer tonic/dominant roots lightly
            score = len(pcs) / max(1, len(tones)) - 0.08 * missing
            if root == tonality:
                score += 0.12
            if root == (tonality + 7) % 12:
                score += 0.06
            # Prefer sevenths when 4 pcs present
            if len(pcs) >= 4 and nature_id in ("seventh", "m7", "ninth"):
                score += 0.08
            if len(pcs) == 3 and nature_id in ("major", "minor"):
                score += 0.05
            tup = (score, nature_id, root, missing)
            if best is None or tup[0] > best[0]:
                best = tup
    if not best:
        return {
            "natureId": "unknown",
            "rootPc": _pc(midi["lead"]),
            "confidence": 0.0,
            "pcs": pcs,
        }
    score, nature_id, root, missing = best
    return {
        "natureId": nature_id,
        "rootPc": root,
        "confidence": round(float(max(0.0, min(1.0, score))), 3),
        "missing": missing,
        "pcs": pcs,
    }


def note_name(midi: int) -> str:
    names = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    return f"{names[_pc(midi)]}{midi // 12 - 1}"


def romanish(root_pc: int, nature: str, tonality: int, mode: str) -> str:
    deg = (root_pc - tonality) % 12
    majors = {0: "I", 2: "II", 4: "III", 5: "IV", 7: "V", 9: "VI", 11: "VII"}
    # chromatic labels
    label = majors.get(deg)
    if label is None:
        flats = {1: "bII", 3: "bIII", 6: "bV", 8: "bVI", 10: "bVII"}
        label = flats.get(deg, f"({deg})")
    if nature in ("minor", "m7", "madd6", "halfdim"):
        label = label.lower()
    if nature == "seventh":
        label += "7"
    elif nature == "m7":
        label += "7"
    elif nature == "ninth":
        label += "9"
    elif nature == "sixth":
        label += "6"
    elif nature == "dim7":
        label += "°7"
    elif nature == "halfdim":
        label += "ø7"
    elif nature == "aug":
        label += "+"
    return label


@dataclass
class StackEvent:
    t0: float
    t1: float
    midi: dict[str, int]
    midi_raw: dict[str, int]
    natureId: str
    rootPc: int
    confidence: float
    roman: str
    pcs: list[int]


def track_part(audio: np.ndarray, *, rms_gate: float = 0.0020) -> np.ndarray:
    f0 = yin_f0(audio, rms_gate=rms_gate)
    m = hz_to_midi(f0)
    m = median_filter_nan(m, 7)
    return quantize_midi(m)


def segment_stacks(
    series: dict[str, np.ndarray],
    *,
    tonality: int,
    mode: str,
    min_hold_s: float = 0.18,
    hop_s: float = HOP / SR,
    min_voices: int = 3,
) -> list[StackEvent]:
    n = min(len(series[p]) for p in ALIGN_PARTS)
    min_frames = max(2, int(min_hold_s / hop_s))
    events: list[StackEvent] = []

    def frame_stack(i: int) -> Optional[dict[str, int]]:
        raw = {}
        for p in ALIGN_PARTS:
            v = int(series[p][i])
            if v >= 0:
                raw[p] = v
        if "lead" not in raw:
            return None
        if len(raw) < min_voices:
            return None
        return raw

    def same_harmony(a: dict[str, int], b: dict[str, int]) -> bool:
        keys = set(a) | set(b)
        if len(keys) < min_voices:
            return False
        for p in keys:
            if p not in a or p not in b:
                return False
            if a[p] != b[p]:
                return False
        return True

    i = 0
    while i < n:
        raw0 = frame_stack(i)
        if raw0 is None:
            i += 1
            continue
        j = i + 1
        while j < n:
            rawj = frame_stack(j)
            if rawj is None or not same_harmony(raw0, rawj):
                break
            j += 1
        if j - i >= min_frames:
            # Fill missing voices from nearest voiced neighbor in-window if needed
            filled = dict(raw0)
            for p in ALIGN_PARTS:
                if p in filled:
                    continue
                for k in range(i, j):
                    v = int(series[p][k])
                    if v >= 0:
                        filled[p] = v
                        break
            if len(filled) < min_voices or "lead" not in filled:
                i = max(j, i + 1)
                continue
            corrected = correct_stack_octaves(filled)
            g = guess_nature(corrected, tonality)
            events.append(
                StackEvent(
                    t0=round(i * hop_s, 3),
                    t1=round(j * hop_s, 3),
                    midi=corrected,
                    midi_raw=filled,
                    natureId=str(g["natureId"]),
                    rootPc=int(g["rootPc"]),
                    confidence=float(g.get("confidence") or 0),
                    roman=romanish(int(g["rootPc"]), str(g["natureId"]), tonality, mode),
                    pcs=list(g.get("pcs") or []),
                )
            )
        i = max(j, i + 1)
    return events


def merge_same_harmony(events: list[StackEvent], gap_s: float = 0.12) -> list[StackEvent]:
    """Merge consecutive events with same PCs + nature (ignore brief octave flips)."""
    if not events:
        return events
    out = [events[0]]
    for ev in events[1:]:
        prev = out[-1]
        same = (
            prev.natureId == ev.natureId
            and prev.rootPc == ev.rootPc
            and prev.pcs == ev.pcs
            and ev.t0 - prev.t1 <= gap_s
        )
        if same:
            out[-1] = StackEvent(
                t0=prev.t0,
                t1=ev.t1,
                midi=ev.midi,
                midi_raw=ev.midi_raw,
                natureId=prev.natureId,
                rootPc=prev.rootPc,
                confidence=max(prev.confidence, ev.confidence),
                roman=prev.roman,
                pcs=prev.pcs,
            )
        else:
            out.append(ev)
    return out


METHOD = "yin_part_left+norm_progressive_v6"

# Learning tracks usually open with a sustained unison "blown pitch" then a rest.
BLOWN_MIN_S = 0.8
BLOWN_MAX_S = 8.0
BLOWN_SEARCH_S = 15.0
# Keep a short bridge when collapsing silence so chord changes don't abut harshly.
GAP_KEEP_S = 0.10
GAP_REMOVE_MIN_S = 0.28
# Only carry across tiny detection dropouts — do not invent long held chords.
BREATH_S = 0.12
# Don't crush silence / hard-quantize inside the closing ritardando.
RIT_PROTECT_S = 10.0
RIT_TAIL_FRAC = 0.22
# Snap attacks to nearest 8th when off-grid; never slice holds into 8ths.
QUANTIZE_SUBDIVISION = 8
SNAP_OFFGRID_FRAC = 0.18  # snap if more than ~18% of an 8th off


def _n_frames(series: dict[str, np.ndarray]) -> int:
    return min(len(series[p]) for p in ALIGN_PARTS)


def _active_count(series: dict[str, np.ndarray], i: int) -> int:
    return sum(1 for p in ALIGN_PARTS if int(series[p][i]) >= 0)


def _frame_pcs(series: dict[str, np.ndarray], i: int) -> set[int]:
    return {_pc(int(series[p][i])) for p in ALIGN_PARTS if int(series[p][i]) >= 0}


def _is_unison_blown_frame(series: dict[str, np.ndarray], i: int, tonality: int) -> bool:
    """True when ≥3 voices share one pitch class (typical blown pitch / octave unison)."""
    del tonality  # reserved for stricter tonic-only matching if needed
    pcs = _frame_pcs(series, i)
    return len(pcs) == 1 and _active_count(series, i) >= 3


def strip_blown_pitch(
    series: dict[str, np.ndarray],
    *,
    tonality: int,
    hop_s: float = HOP / SR,
) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    """Drop opening sustained unison + following rest; return sliced series + info."""
    n = _n_frames(series)
    max_i = min(n, int(BLOWN_SEARCH_S / hop_s))
    info: dict[str, Any] = {"stripped": False, "start_frame": 0, "start_s": 0.0}

    i = 0
    while i < max_i and _active_count(series, i) < 2:
        i += 1
    if i >= max_i or not _is_unison_blown_frame(series, i, tonality):
        return series, info

    last_blown = i
    j = i + 1
    while j < max_i:
        if _is_unison_blown_frame(series, j, tonality):
            last_blown = j
            j += 1
            continue
        if _active_count(series, j) < 2:
            # Silence — may still be inside the blown-pitch cue.
            if (j - last_blown) * hop_s > 0.55:
                break
            j += 1
            continue
        # Active non-unison harmony → song has started.
        break

    blown_dur = (last_blown - i + 1) * hop_s
    if blown_dur < BLOWN_MIN_S or blown_dur > BLOWN_MAX_S:
        return series, info

    # Skip trailing rest after the blown pitch.
    k = last_blown + 1
    while k < n and _active_count(series, k) < 2:
        k += 1
    if k <= 0 or k >= n:
        return series, info

    sliced = {p: series[p][k:].copy() for p in ALIGN_PARTS}
    info = {
        "stripped": True,
        "start_frame": int(k),
        "start_s": round(k * hop_s, 3),
        "blown_dur_s": round(blown_dur, 3),
        "blown_pc": next(iter(_frame_pcs(series, i)), None),
    }
    return sliced, info


def compress_gaps(
    series: dict[str, np.ndarray],
    *,
    hop_s: float = HOP / SR,
    keep_s: float = GAP_KEEP_S,
    remove_min_s: float = GAP_REMOVE_MIN_S,
    protect_tail_s: float = RIT_PROTECT_S,
) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    """Remove long all-quiet stretches so stacks aren't separated by huge holes.

    Silence in the closing tail is preserved more generously — tags often ritard
    and hold the final cadence rather than cutting to the next phrase.
    """
    n = _n_frames(series)
    keep_frames = max(1, int(round(keep_s / hop_s)))
    remove_min = max(keep_frames + 1, int(round(remove_min_s / hop_s)))
    protect_from = max(0, n - int(protect_tail_s / hop_s))
    active = np.array([_active_count(series, i) >= 2 for i in range(n)], dtype=bool)

    keep_mask = np.ones(n, dtype=bool)
    removed = 0
    i = 0
    while i < n:
        if active[i]:
            i += 1
            continue
        j = i
        while j < n and not active[j]:
            j += 1
        gap = j - i
        in_tail = i >= protect_from
        # In the ritardando tail, keep much more of each rest (held fermatas).
        local_keep = keep_frames * (6 if in_tail else 1)
        local_remove_min = remove_min * (3 if in_tail else 1)
        if gap >= local_remove_min:
            drop_from = i + local_keep
            if drop_from < j:
                keep_mask[drop_from:j] = False
                removed += j - drop_from
        i = j

    if removed == 0:
        return series, {"compressed": False, "frames_removed": 0, "seconds_removed": 0.0}

    out = {p: series[p][keep_mask].copy() for p in ALIGN_PARTS}
    return out, {
        "compressed": True,
        "frames_removed": int(removed),
        "seconds_removed": round(removed * hop_s, 3),
        "frames_before": int(n),
        "frames_after": int(keep_mask.sum()),
        "protect_tail_s": protect_tail_s,
    }


def _polecat_meter_prior(meta: dict) -> Optional[int]:
    """Known classic polecat meters (waltz vs common time) when OCR is blank."""
    tid = int(meta.get("tag_id") or meta.get("id") or 0)
    by_id = {
        90001: 3,  # My Wild Irish Rose
        90006: 3,  # Let Me Call You Sweetheart
        90009: 3,  # The Story of the Rose / Heart of My Heart
        90003: 4,  # Sweet And Lovely
        90002: 3,  # Wait 'Til The Sun Shines, Nellie (often waltz)
        90010: 3,  # Sweet Adeline
    }
    if tid in by_id:
        return by_id[tid]
    title = (meta.get("title") or "").lower()
    if any(k in title for k in ("irish rose", "sweetheart", "story of the rose", "heart of my heart", "adeline", "nellie")):
        return 3
    if "sweet and lovely" in title:
        return 4
    return None


def _sheet_meter_hint(folder: Path, meta: dict) -> Optional[tuple[int, str]]:
    """Best-effort 3/4 or 4/4 from metadata OCR text or tesseract on the sheet."""
    import re

    blobs: list[str] = []
    for key in ("sheet_text", "ocr_raw", "lyrics_raw", "ocr_text"):
        v = meta.get(key)
        if isinstance(v, str) and v.strip():
            blobs.append(v)

    def parse_meter(text: str) -> Optional[tuple[int, str]]:
        if re.search(r"\b3\s*/\s*4\b|¾|time\s*[:\s]*3", text, re.I):
            return 3, "ocr_sheet"
        if re.search(r"\b4\s*/\s*4\b|common\s+time|\bC\s*time\b", text, re.I):
            return 4, "ocr_sheet"
        # Cut time → still 2/2 feel but treat as 4/4 grid for quantize.
        if re.search(r"\b2\s*/\s*2\b|alla\s+breve|cut\s+time", text, re.I):
            return 4, "ocr_sheet"
        return None

    for b in blobs:
        hit = parse_meter(b)
        if hit:
            return hit

    # Light tesseract pass on first page / preview (optional).
    sheet = next(folder.glob("*Sheet.pdf"), None)
    preview = next(folder.glob("*Preview.webp"), None) or next(folder.glob("*Preview.png"), None)
    src = sheet or preview
    if src is None:
        return None
    png = Path("/tmp/pitch_extract_meter_ocr.png")
    try:
        if src.suffix.lower() == ".pdf":
            subprocess.check_call(
                [
                    "pdftoppm",
                    "-png",
                    "-r",
                    "180",
                    "-f",
                    "1",
                    "-l",
                    "1",
                    "-singlefile",
                    str(src),
                    str(png.with_suffix("")),
                ],
                stderr=subprocess.DEVNULL,
            )
        else:
            subprocess.check_call(
                ["ffmpeg", "-y", "-v", "error", "-i", str(src), str(png)],
                stderr=subprocess.DEVNULL,
            )
        txt = subprocess.check_output(
            ["tesseract", str(png), "stdout", "--psm", "6"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return parse_meter(txt)


def detect_tempo_meter(
    series: dict[str, np.ndarray],
    *,
    folder: Path,
    meta: dict,
    hop_s: float = HOP / SR,
) -> dict[str, Any]:
    """Estimate BPM (60–180) and 3/4 vs 4/4 from lead onsets + optional sheet OCR."""
    n = _n_frames(series)
    lead = series["lead"]
    onset = np.zeros(n, dtype=np.float64)
    prev = -1
    for i in range(n):
        v = int(lead[i])
        if v >= 0 and v != prev:
            onset[i] = 1.0
            prev = v
        elif v < 0:
            prev = -1
        # Soft boost when ≥3 voices re-enter together.
        if i > 0 and _active_count(series, i) >= 3 and _active_count(series, i - 1) < 2:
            onset[i] += 0.6

    # Light smoothing
    if n >= 3:
        onset = np.convolve(onset, np.array([0.25, 0.5, 0.25]), mode="same")
    if float(onset.max()) < 1e-9:
        return {
            "bpm": 104.0,
            "numerator": 4,
            "denominator": 4,
            "tempo_source": "default",
            "meter_source": "default",
            "tempo_score": 0.0,
        }

    onset = onset / (float(onset.max()) + 1e-12)
    candidates: list[tuple[float, float, int]] = []  # score, bpm, lag
    for bpm in range(60, 181):
        lag = int(round((60.0 / bpm) / hop_s))
        if lag < 2 or lag >= n // 2:
            continue
        a = onset[:-lag]
        b = onset[lag:]
        denom = float(np.linalg.norm(a) * np.linalg.norm(b)) + 1e-12
        score = float(np.dot(a, b) / denom)
        candidates.append((score, float(bpm), lag))
    candidates.sort(reverse=True)
    best_score, bpm, lag = candidates[0]

    # Prefer ballad/moderate polecat tempi when autocorr is close.
    for score, b, lg in candidates[:16]:
        if abs(score - best_score) > 0.025:
            break
        if 64 <= b <= 112:
            bpm, lag, best_score = b, lg, score
            break

    # Halve double-time guesses (onset autocorr often locks to 8ths as "beats").
    if bpm >= 118:
        half = bpm / 2.0
        half_lag = int(round((60.0 / half) / hop_s))
        if 2 <= half_lag < n // 2 and 55 <= half <= 105:
            a = onset[:-half_lag]
            b = onset[half_lag:]
            denom = float(np.linalg.norm(a) * np.linalg.norm(b)) + 1e-12
            half_score = float(np.dot(a, b) / denom)
            # Polecat learning tracks are almost never allegro >118 — prefer half.
            if half_score >= best_score * 0.55 or bpm >= 118:
                bpm, lag, best_score = half, half_lag, max(half_score, best_score * 0.9)

    ocr = _sheet_meter_hint(folder, meta)
    prior = _polecat_meter_prior(meta)
    s3 = s4 = 0.0
    for mult, sink in ((3, "s3"), (4, "s4")):
        L = lag * mult
        if L < n // 2:
            a = onset[:-L]
            b = onset[L:]
            denom = float(np.linalg.norm(a) * np.linalg.norm(b)) + 1e-12
            val = float(np.dot(a, b) / denom)
            if sink == "s3":
                s3 = val
            else:
                s4 = val

    if ocr is not None:
        numerator, meter_source = ocr
    elif prior is not None:
        numerator, meter_source = prior, "polecat_prior"
    elif s3 > s4 * 1.12:
        numerator, meter_source = 3, "onset_autocorr"
    else:
        numerator, meter_source = 4, "onset_autocorr"

    return {
        "bpm": round(bpm, 1),
        "numerator": int(numerator),
        "denominator": 4,
        "tempo_source": "onset_autocorr",
        "meter_source": meter_source,
        "tempo_score": round(best_score, 4),
        "meter_scores": {"3": round(s3, 4), "4": round(s4, 4)},
    }


def _copy_event(ev: StackEvent, t0: float, t1: float) -> StackEvent:
    return StackEvent(
        t0=round(t0, 3),
        t1=round(t1, 3),
        midi=ev.midi,
        midi_raw=ev.midi_raw,
        natureId=ev.natureId,
        rootPc=ev.rootPc,
        confidence=ev.confidence,
        roman=ev.roman,
        pcs=ev.pcs,
    )


def enrich_missing_voices(
    series: dict[str, np.ndarray],
    events: list[StackEvent],
    *,
    tonality: int,
    mode: str,
    hop_s: float = HOP / SR,
    search_s: float = 0.18,
) -> list[StackEvent]:
    """Fill only the 4th voice when a stack already has 3 in-window (no invention)."""
    if not events:
        return events
    n = _n_frames(series)
    radius = max(1, int(search_s / hop_s))
    out: list[StackEvent] = []
    for ev in events:
        midi = dict(ev.midi)
        raw = dict(ev.midi_raw)
        if len(midi) < 3 or "lead" not in midi:
            out.append(ev)
            continue
        i0 = int(ev.t0 / hop_s)
        i1 = max(i0 + 1, int(ev.t1 / hop_s))
        changed = False
        for part in ALIGN_PARTS:
            if part in midi:
                continue
            found = None
            for k in range(i0, min(n, i1)):
                v = int(series[part][k])
                if v >= 0:
                    found = v
                    break
            if found is None:
                for k in range(max(0, i0 - radius), min(n, i1 + radius)):
                    v = int(series[part][k])
                    if v >= 0:
                        found = v
                        break
            if found is not None:
                midi[part] = found
                raw[part] = found
                changed = True
        if not changed:
            out.append(ev)
            continue
        corrected = correct_stack_octaves(midi)
        g = guess_nature(corrected, tonality)
        out.append(
            StackEvent(
                t0=ev.t0,
                t1=ev.t1,
                midi=corrected,
                midi_raw=raw,
                natureId=str(g["natureId"]),
                rootPc=int(g["rootPc"]),
                confidence=float(g.get("confidence") or 0),
                roman=romanish(int(g["rootPc"]), str(g["natureId"]), tonality, mode),
                pcs=list(g.get("pcs") or []),
            )
        )
    return out


def fill_detection_holes(
    series: dict[str, np.ndarray],
    events: list[StackEvent],
    *,
    tonality: int,
    mode: str,
    hop_s: float = HOP / SR,
    min_gap_s: float = 0.14,
) -> list[StackEvent]:
    """Re-segment gaps between stacks; tags are almost never sparse."""
    if len(events) < 2:
        return events
    out: list[StackEvent] = [events[0]]
    for nxt in events[1:]:
        prev = out[-1]
        gap = nxt.t0 - prev.t1
        if gap >= min_gap_s:
            i0 = max(0, int(prev.t1 / hop_s))
            i1 = min(_n_frames(series), int(nxt.t0 / hop_s))
            if i1 - i0 >= 2:
                window = {p: series[p][i0:i1].copy() for p in ALIGN_PARTS}
                filled = segment_stacks(
                    window,
                    tonality=tonality,
                    mode=mode,
                    min_voices=2,
                    min_hold_s=0.08,
                    hop_s=hop_s,
                )
                for ev in filled:
                    out.append(
                        _copy_event(ev, prev.t1 + ev.t0, prev.t1 + ev.t1)
                    )
                # Carry last harmony across leftover voiced lead if still sparse.
                if out[-1].t1 + min_gap_s < nxt.t0:
                    lead = series["lead"]
                    a = int(out[-1].t1 / hop_s)
                    b = int(nxt.t0 / hop_s)
                    voiced = any(int(lead[k]) >= 0 for k in range(a, min(b, len(lead))))
                    if voiced:
                        carry = out[-1]
                        out.append(
                            _copy_event(
                                carry,
                                out[-1].t1,
                                nxt.t0,
                            )
                        )
        out.append(nxt)
    return merge_same_harmony(out, gap_s=0.18)


def compress_event_gaps(
    events: list[StackEvent],
    *,
    max_gap_s: float = BREATH_S,
    rit_start_s: Optional[float] = None,
    rit_max_gap_s: float = 0.35,
) -> list[StackEvent]:
    """Rebuild timeline so leftover holes stay tiny; allow more space in ritardando."""
    if not events:
        return events

    dur0 = max(0.10, events[0].t1 - events[0].t0)
    out = [_copy_event(events[0], 0.0, dur0)]
    # Map original times → shift as we go; rit_start refers to original timeline.
    orig_t0 = [ev.t0 for ev in events]
    for i in range(1, len(events)):
        ev = events[i]
        orig_gap = events[i].t0 - events[i - 1].t1
        in_rit = rit_start_s is not None and orig_t0[i] >= rit_start_s
        keep_gap = min(max(0.0, orig_gap), rit_max_gap_s if in_rit else max_gap_s)
        t0 = out[-1].t1 + keep_gap
        dur = max(0.10, ev.t1 - ev.t0)
        out.append(_copy_event(ev, t0, t0 + dur))
    return out


def densify_events(
    events: list[StackEvent],
    *,
    breath_s: float = BREATH_S,
    rit_start_s: Optional[float] = None,
) -> list[StackEvent]:
    """Bridge only tiny dropouts; keep natural chord lengths (no 8th chopping)."""
    if len(events) < 2:
        return events
    del rit_start_s
    out: list[StackEvent] = []
    for i, ev in enumerate(events):
        t0, t1 = ev.t0, ev.t1
        if i + 1 < len(events):
            nxt = events[i + 1]
            gap = nxt.t0 - t1
            # Only fill brief YIN dropouts — not phrase gaps.
            if 0 < gap <= max(0.05, breath_s):
                t1 = nxt.t0
        if out and t0 < out[-1].t1:
            t0 = out[-1].t1
        if t1 <= t0:
            continue
        out.append(_copy_event(ev, t0, t1))
    return out


def detect_ritardando_start(
    events: list[StackEvent],
    *,
    bpm: float,
) -> tuple[Optional[float], dict[str, Any]]:
    """Find where chord holds lengthen near the end (closing rit / fermata)."""
    info: dict[str, Any] = {"detected": False, "start_s": None}
    if len(events) < 10:
        return None, info
    durs = [max(0.05, e.t1 - e.t0) for e in events]
    total = events[-1].t1
    if total <= 8:
        return None, info
    cut = max(events[0].t1, total * (1.0 - RIT_TAIL_FRAC))
    body = [d for e, d in zip(events, durs) if e.t1 <= cut]
    tail = [d for e, d in zip(events, durs) if e.t0 >= cut]
    if len(body) < 4 or len(tail) < 2:
        # Fall back: protect last N seconds.
        start = max(0.0, total - RIT_PROTECT_S)
        info.update({"detected": True, "start_s": round(start, 3), "reason": "tail_protect"})
        return start, info
    body_med = float(np.median(body))
    tail_med = float(np.median(tail))
    beat = 60.0 / max(40.0, bpm)
    # Rit if tail holds are clearly longer than body (or longer than ~2 beats).
    if tail_med >= body_med * 1.55 or tail_med >= beat * 2.2:
        # Start a bit before the first long hold in the tail.
        start = cut
        for e, d in zip(events, durs):
            if e.t0 >= cut * 0.85 and d >= body_med * 1.45:
                start = e.t0
                break
        info.update(
            {
                "detected": True,
                "start_s": round(start, 3),
                "body_med_s": round(body_med, 3),
                "tail_med_s": round(tail_med, 3),
                "reason": "hold_lengthen",
            }
        )
        return start, info
    start = max(0.0, total - min(RIT_PROTECT_S, total * RIT_TAIL_FRAC))
    info.update({"detected": True, "start_s": round(start, 3), "reason": "tail_protect"})
    return start, info


def eighth_grid_s(bpm: float) -> float:
    """Seconds per 8th note (polecat charts almost never need 16ths)."""
    return (60.0 / max(40.0, bpm)) / 2.0


def align_to_first_measure(
    events: list[StackEvent],
    *,
    bpm: float,
    numerator: int,
) -> tuple[list[StackEvent], dict[str, Any]]:
    """Phase-align so a measure downbeat sits at t=0; music starts on the grid."""
    info: dict[str, Any] = {"phase_s": 0.0, "shifted": False}
    if not events or bpm <= 0:
        return events, info
    eighth = eighth_grid_s(bpm)
    bar = eighth * 2 * max(2, int(numerator))
    if bar <= 1e-6:
        return events, info

    # Pull first attack to 0 first.
    t_off = events[0].t0
    base = [_copy_event(e, e.t0 - t_off, e.t1 - t_off) for e in events]

    boundaries = [e.t0 for e in base[:48]] + [e.t1 for e in base[:48]]
    n_phases = max(1, int(round(bar / eighth)))
    best_phi, best_err = 0.0, 1e18
    for k in range(n_phases):
        phi = k * eighth
        err = 0.0
        for t in boundaries:
            x = (t - phi) / eighth
            err += abs(x - round(x))
        # Prefer downbeat (phi=0) on ties.
        err += 0.02 * k
        if err < best_err:
            best_err = err
            best_phi = phi

    if best_phi < eighth * 0.34:
        best_phi = 0.0
    out: list[StackEvent] = []
    for e in base:
        t0 = e.t0 - best_phi
        t1 = e.t1 - best_phi
        if t1 <= 1e-6:
            continue
        if t0 < 0:
            t0 = 0.0
        out.append(_copy_event(e, t0, t1))
    if out and out[0].t0 > eighth * 0.51:
        pad = out[0].t0
        out = [_copy_event(e, e.t0 - pad, e.t1 - pad) for e in out]
    info = {
        "phase_s": round(best_phi, 4),
        "shifted": bool(best_phi > 0 or t_off > 1e-4),
        "first_pull_s": round(t_off, 4),
        "eighth_s": round(eighth, 4),
        "bar_s": round(bar, 4),
    }
    return out, info


def quantize_events_to_tempo(
    events: list[StackEvent],
    *,
    bpm: float,
    subdivision: int = QUANTIZE_SUBDIVISION,
    rit_start_s: Optional[float] = None,
) -> list[StackEvent]:
    """Snap starts/ends to nearest 8th only when off-grid; keep natural durations."""
    del subdivision
    del rit_start_s
    if not events or bpm <= 0:
        return events
    grid = eighth_grid_s(bpm)
    if grid <= 1e-6:
        return events
    thr = SNAP_OFFGRID_FRAC

    def maybe_snap(t: float) -> float:
        units = t / grid
        nearest = round(units)
        if abs(units - nearest) > thr:
            return round(nearest * grid, 4)
        return round(t, 4)

    out: list[StackEvent] = []
    for ev in events:
        dur = max(0.08, ev.t1 - ev.t0)
        t0 = maybe_snap(ev.t0)
        t1 = maybe_snap(ev.t1)
        # Prefer preserving duration if snap collapsed the hold.
        if t1 <= t0:
            t1 = round(t0 + dur, 4)
        elif (t1 - t0) < dur * 0.55:
            t1 = round(t0 + dur, 4)
        if out and t0 < out[-1].t1:
            # Keep order; don't invent an 8th-sized slice.
            t0 = out[-1].t1
            t1 = max(t1, t0 + min(dur, grid))
        if t1 <= t0:
            continue
        out.append(_copy_event(ev, t0, t1))
    return out


def score_density(events: list[StackEvent]) -> dict[str, Any]:
    """Coverage / voicing density — sparse chords usually mean failed detection."""
    if not events:
        return {
            "coverage": 0.0,
            "sparse": True,
            "max_gap_s": 0.0,
            "mean_gap_s": 0.0,
            "avg_voices": 0.0,
        }
    span = max(1e-6, events[-1].t1 - events[0].t0)
    covered = sum(max(0.0, e.t1 - e.t0) for e in events)
    gaps = [events[i + 1].t0 - events[i].t1 for i in range(len(events) - 1)]
    gaps = [g for g in gaps if g > 0]
    max_gap = max(gaps) if gaps else 0.0
    mean_gap = float(np.mean(gaps)) if gaps else 0.0
    coverage = covered / span
    avg_voices = float(np.mean([len(e.midi) for e in events]))
    trio_frac = float(np.mean([len(e.midi) >= 3 for e in events]))
    # Sparse = big holes or incomplete TTBB — escalate loudness until denser.
    stacks_per_min = len(events) / max(span / 60.0, 1e-6)
    sparse = (
        max_gap > 0.95
        or coverage < 0.72
        or avg_voices < 3.15
        or trio_frac < 0.55
        or stacks_per_min < 16
    )
    return {
        "coverage": round(coverage, 3),
        "sparse": sparse,
        "max_gap_s": round(max_gap, 3),
        "mean_gap_s": round(mean_gap, 3),
        "avg_voices": round(avg_voices, 3),
        "trio_frac": round(trio_frac, 3),
        "stack_count": len(events),
        "duration_s": round(events[-1].t1, 3),
        "stacks_per_min": round(stacks_per_min, 2),
    }


def _voice_parts_present(meta: dict, folder: Path) -> bool:
    for part in ALIGN_PARTS:
        try:
            resolve_audio_path(folder, meta, part)
        except FileNotFoundError:
            return False
    return True


def process_folder(
    folder: Path,
    *,
    write_frames: bool = False,
    force: bool = False,
    write_metadata: bool = True,
) -> dict[str, Any]:
    """Extract pitches into ``pitch_stacks.json`` + ``pitch_studio.json`` in *folder*."""
    from .pitch_studio_project import build_project  # local import avoids cycles

    meta_path = folder / "metadata.json"
    meta = json.loads(meta_path.read_text())
    tag_id = int(meta.get("tag_id") or meta.get("id") or 0)
    if not tag_id:
        raise ValueError(f"no tag id in {folder.name}")
    if not _voice_parts_present(meta, folder):
        raise FileNotFoundError("missing Lead/Tenor/Bari/Bass audio")

    existing = meta.get("pitch_extract") if isinstance(meta.get("pitch_extract"), dict) else {}
    if (
        not force
        and (folder / STACKS_FILENAME).is_file()
        and (folder / STUDIO_FILENAME).is_file()
        and existing.get("method") == METHOD
    ):
        return {
            "id": tag_id,
            "title": meta.get("title"),
            "stacks": int(existing.get("stack_count") or 0),
            "skipped": True,
            "out": str(folder),
        }

    tonality, mode = parse_tonality(meta)
    hop_s = HOP / SR

    part_paths: dict[str, tuple[Path, str, Optional[str], float]] = {}
    for part in ALIGN_PARTS:
        path, kind = resolve_audio_path(folder, meta, part)
        side = pitch_channel_for(meta, part, kind=kind)
        # Solo.opus is already time-aligned; stereo MP3 may need audio_align.
        off = 0.0 if kind == "solo_opus" else offset_ms_for(meta, part)
        part_paths[part] = (path, kind, side, off)

    def _track_stage(
        stage_i: int, *, rms_gate: float = 0.0020
    ) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
        series_local: dict[str, np.ndarray] = {}
        sources_local: dict[str, Any] = {}
        max_len_local = 0
        # Slightly lower gate on later compress stages (quiets are louder, keep more).
        gate = rms_gate * (0.85 if stage_i >= 2 else 1.0)
        for part, (path, kind, side, off) in part_paths.items():
            audio = decode_mono(
                path, solo_side=side, offset_ms=off, loudness_stage=stage_i
            )
            q = track_part(audio, rms_gate=gate)
            series_local[part] = q
            max_len_local = max(max_len_local, len(q))
            sources_local[part] = {
                "file": path.name,
                "kind": kind,
                "solo_side": side,
                "offset_ms": off,
                "voiced_frac": float(np.mean(q >= 0)) if len(q) else 0.0,
                "midi_mad": None,
                "sha256": ((meta.get("parts") or {}).get(part) or {}).get("sha256"),
                "loudness_stage": LOUDNESS_STAGES[stage_i]["name"],
            }
            f0 = yin_f0(audio, rms_gate=gate)
            m = hz_to_midi(f0)
            m = median_filter_nan(m, 7)
            ok = np.isfinite(m)
            if ok.any():
                sources_local[part]["midi_mad"] = round(
                    float(np.median(np.abs(m[ok] - np.rint(m[ok])))), 4
                )
        for p in ALIGN_PARTS:
            if len(series_local[p]) < max_len_local:
                pad = np.full(max_len_local - len(series_local[p]), -1, dtype=np.int16)
                series_local[p] = np.concatenate([series_local[p], pad])
        return series_local, sources_local

    def _build_events(
        series_local: dict[str, np.ndarray],
        *,
        bpm: float,
        numerator: int,
        mv: int,
        min_hold_s: float = 0.18,
    ) -> tuple[list[StackEvent], dict[str, Any], dict[str, Any]]:
        ev = merge_same_harmony(
            segment_stacks(
                series_local,
                tonality=tonality,
                mode=mode,
                min_voices=mv,
                min_hold_s=min_hold_s,
            ),
            gap_s=0.22,
        )
        min_keep = max(0.12, min_hold_s * 0.75)
        ev = [e for e in ev if (e.t1 - e.t0) >= min_keep]
        ev = fill_detection_holes(
            series_local, ev, tonality=tonality, mode=mode, hop_s=hop_s, min_gap_s=0.20
        )
        # Only enrich when a stack is already mostly complete (avoid inventing wrong notes).
        ev = enrich_missing_voices(
            series_local,
            ev,
            tonality=tonality,
            mode=mode,
            hop_s=hop_s,
            search_s=0.16,
        )
        ev = [e for e in ev if (e.t1 - e.t0) >= min_keep]
        rit0, rit_a = detect_ritardando_start(ev, bpm=bpm)
        # Collapse only absurd holes; keep musical spacing.
        ev = compress_event_gaps(
            ev, max_gap_s=0.40, rit_start_s=rit0, rit_max_gap_s=0.90
        )
        ev, align = align_to_first_measure(ev, bpm=bpm, numerator=numerator)
        rit1, rit_b = detect_ritardando_start(ev, bpm=bpm)
        ev = densify_events(ev, breath_s=BREATH_S, rit_start_s=rit1)
        ev = quantize_events_to_tempo(ev, bpm=bpm, rit_start_s=rit1)
        return ev, align, rit_b if rit_b.get("detected") else rit_a

    best: Optional[dict[str, Any]] = None
    stage_reports: list[dict[str, Any]] = []
    for stage_i in range(len(LOUDNESS_STAGES)):
        series, sources = _track_stage(stage_i)
        series, blown_info = strip_blown_pitch(series, tonality=tonality, hop_s=hop_s)
        series, gap_info = compress_gaps(series, hop_s=hop_s, protect_tail_s=RIT_PROTECT_S)
        tempo_info = detect_tempo_meter(series, folder=folder, meta=meta, hop_s=hop_s)
        bpm = float(tempo_info["bpm"])
        numerator = int(tempo_info["numerator"])
        # Prefer 3-voice stacks when the stage is dense enough; else 2.
        trio_frac_frames = float(
            np.mean([_active_count(series, i) >= 3 for i in range(_n_frames(series))])
        ) if _n_frames(series) else 0.0
        min_voices = 3 if trio_frac_frames >= 0.28 else 2
        min_hold = 0.16 if stage_i >= 2 else 0.18
        events, align_info, rit_info = _build_events(
            series,
            bpm=bpm,
            numerator=numerator,
            mv=min_voices,
            min_hold_s=min_hold,
        )
        density = score_density(events)
        report = {
            "stage": LOUDNESS_STAGES[stage_i]["name"],
            "stage_i": stage_i,
            "min_voices": min_voices,
            "density": density,
            "voiced": {p: round(sources[p]["voiced_frac"], 3) for p in ALIGN_PARTS},
            "bpm": bpm,
            "meter": numerator,
        }
        stage_reports.append(report)
        cand = {
            "series": series,
            "sources": sources,
            "blown_info": blown_info,
            "gap_info": gap_info,
            "tempo_info": tempo_info,
            "events": events,
            "align_info": align_info,
            "rit_info": rit_info,
            "density": density,
            "min_voices": min_voices,
            "stage_i": stage_i,
        }
        # Prefer non-sparse; among sparse/non-sparse pick higher trio_frac then coverage.
        score = (
            (0 if density["sparse"] else 1000)
            + 100 * float(density.get("trio_frac") or 0)
            + 40 * float(density.get("avg_voices") or 0)
            + 20 * float(density.get("coverage") or 0)
            - 5 * float(density.get("max_gap_s") or 0)
        )
        cand["score"] = score
        if best is None or score > best["score"]:
            best = cand
        # Stop early only when comfortably dense; otherwise keep compressing.
        comfortable = (
            not density["sparse"]
            and float(density.get("avg_voices") or 0) >= 3.4
            and float(density.get("trio_frac") or 0) >= 0.7
            and float(density.get("coverage") or 0) >= 0.8
        )
        if comfortable:
            break

    assert best is not None
    used_salvage = False
    # Salvage: if still sparse after all loudness stages, retry strongest stage
    # with shorter holds + 2-voice stacks (no invented pitches beyond in-window fill).
    if best["density"].get("sparse"):
        stage_i = len(LOUDNESS_STAGES) - 1
        series_s, sources_s = _track_stage(stage_i, rms_gate=0.0014)
        series_s, blown_s = strip_blown_pitch(series_s, tonality=tonality, hop_s=hop_s)
        series_s, gap_s = compress_gaps(series_s, hop_s=hop_s, protect_tail_s=RIT_PROTECT_S)
        tempo_s = detect_tempo_meter(series_s, folder=folder, meta=meta, hop_s=hop_s)
        bpm_s = float(tempo_s["bpm"])
        num_s = int(tempo_s["numerator"])
        ev_s, align_s, rit_s = _build_events(
            series_s, bpm=bpm_s, numerator=num_s, mv=2, min_hold_s=0.12
        )
        dens_s = score_density(ev_s)
        stage_reports.append(
            {
                "stage": "salvage_strong",
                "stage_i": stage_i,
                "min_voices": 2,
                "density": dens_s,
                "voiced": {p: round(sources_s[p]["voiced_frac"], 3) for p in ALIGN_PARTS},
                "bpm": bpm_s,
                "meter": num_s,
            }
        )
        score_s = (
            (0 if dens_s["sparse"] else 1000)
            + 100 * float(dens_s.get("trio_frac") or 0)
            + 40 * float(dens_s.get("avg_voices") or 0)
            + 20 * float(dens_s.get("coverage") or 0)
            - 5 * float(dens_s.get("max_gap_s") or 0)
        )
        if score_s > best["score"]:
            used_salvage = True
            best = {
                "series": series_s,
                "sources": sources_s,
                "blown_info": blown_s,
                "gap_info": gap_s,
                "tempo_info": tempo_s,
                "events": ev_s,
                "align_info": align_s,
                "rit_info": rit_s,
                "density": dens_s,
                "min_voices": 2,
                "stage_i": stage_i,
                "score": score_s,
            }

    series = best["series"]
    sources = best["sources"]
    blown_info = best["blown_info"]
    gap_info = best["gap_info"]
    tempo_info = best["tempo_info"]
    events = best["events"]
    align_info = best["align_info"]
    rit_info = best["rit_info"]
    density = best["density"]
    min_voices = best["min_voices"]
    loudness_stage = (
        "salvage_strong"
        if used_salvage
        else LOUDNESS_STAGES[int(best["stage_i"])]["name"]
    )

    extracted_at = datetime.now(timezone.utc).isoformat()

    payload = {
        "id": tag_id,
        "title": meta.get("title"),
        "arranger": meta.get("arranger"),
        "key": meta.get("key"),
        "tonality": tonality,
        "mode": mode,
        "folder": folder.name,
        "extracted_at": extracted_at,
        "method": METHOD,
        "hop_s": hop_s,
        "bpm": tempo_info["bpm"],
        "timeSignature": {
            "numerator": tempo_info["numerator"],
            "denominator": tempo_info["denominator"],
        },
        "snap": "eighth_offgrid",
        "snapTicks": 240,
        "preprocess": {
            "blown_pitch": blown_info,
            "gap_compress": gap_info,
            "tempo": tempo_info,
            "min_voices": min_voices,
            "ritardando": rit_info,
            "align": align_info,
            "density": density,
            "loudness_stage": loudness_stage,
            "loudness_passes": stage_reports,
        },
        "sources": sources,
        "stack_count": len(events),
        "stacks": [
            {
                "t0": e.t0,
                "t1": e.t1,
                "dur": round(e.t1 - e.t0, 3),
                "midi": e.midi,
                "midi_raw": e.midi_raw,
                "names": {p: note_name(m) for p, m in e.midi.items()},
                "natureId": e.natureId,
                "rootPc": e.rootPc,
                "confidence": e.confidence,
                "roman": e.roman,
                "pcs": e.pcs,
            }
            for e in events
        ],
    }
    (folder / STACKS_FILENAME).write_text(json.dumps(payload, indent=2) + "\n")

    studio = build_project(payload)
    (folder / STUDIO_FILENAME).write_text(json.dumps(studio, indent=2) + "\n")

    lines = [
        f"{tag_id}  {meta.get('title')}  ({meta.get('key')})",
        (
            f"stacks={len(events)}  method={METHOD}  tonality={tonality} {mode}  "
            f"bpm={tempo_info['bpm']}  "
            f"{tempo_info['numerator']}/{tempo_info['denominator']}  "
            f"blown={blown_info.get('stripped')}  "
            f"gap_rm={gap_info.get('seconds_removed', 0)}s  "
            f"cov={density.get('coverage')}  "
            f"voices={density.get('avg_voices')}  "
            f"sparse={density.get('sparse')}  "
            f"eighth  rit@{rit_info.get('start_s')}"
        ),
        "",
    ]
    abbr = {"lead": "Ld", "tenor": "Tn", "bari": "Br", "bass": "Bs"}
    for e in events:
        names = " ".join(
            f"{abbr[p]}={note_name(e.midi[p])}" for p in ALIGN_PARTS if p in e.midi
        )
        lines.append(
            f"{e.t0:6.2f}-{e.t1:6.2f}  {e.roman:<6}  {e.natureId:<8} @{e.rootPc}  {names}  conf={e.confidence:.2f}"
        )
    (folder / SUMMARY_FILENAME).write_text("\n".join(lines) + "\n")

    if write_frames:
        frame_payload = {
            "hop_s": hop_s,
            "midi": {p: series[p].tolist() for p in ALIGN_PARTS},
        }
        with gzip.open(folder / "pitch_frames.json.gz", "wt", encoding="utf-8") as f:
            json.dump(frame_payload, f)

    pitch_meta = {
        "method": METHOD,
        "stack_count": len(events),
        "extracted_at": extracted_at,
        "stacks_filename": STACKS_FILENAME,
        "studio_filename": STUDIO_FILENAME,
        "bpm": tempo_info["bpm"],
        "timeSignature": payload["timeSignature"],
        "blown_pitch_stripped": bool(blown_info.get("stripped")),
        "gap_seconds_removed": gap_info.get("seconds_removed", 0),
        "coverage": density.get("coverage"),
        "avg_voices": density.get("avg_voices"),
        "sparse": density.get("sparse"),
        "snap": "eighth",
        "ritardando_start_s": rit_info.get("start_s"),
        "voiced": {p: round(sources[p]["voiced_frac"], 3) for p in ALIGN_PARTS},
        "midi_mad": {p: sources[p]["midi_mad"] for p in ALIGN_PARTS},
    }
    if write_metadata:
        meta["pitch_extract"] = pitch_meta
        parts = meta.setdefault("parts", {})
        parts["pitch_stacks"] = {"filename": STACKS_FILENAME}
        parts["pitch_studio"] = {"filename": STUDIO_FILENAME}
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")

    return {
        "id": tag_id,
        "title": meta.get("title"),
        "stacks": len(events),
        "voiced": pitch_meta["voiced"],
        "midi_mad": pitch_meta["midi_mad"],
        "out": str(folder),
        "skipped": False,
    }
