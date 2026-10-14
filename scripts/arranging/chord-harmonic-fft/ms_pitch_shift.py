#!/usr/bin/env python3
"""
Constant-length pitch shift in mid/side space (for stacking voice samples).

- Stereo: M = (L+R)/2, S = (L−R)/2; shift M and S with the same ratio; L/R = M±S.
- Mono: treated as Mid (Side = 0).
- Length preserved: resample for pitch, then WSOLA-style OLA stretch back to
  the original frame count (sample-accurate stacks).

Analysis / stacking only — not a port of web `@audio/shift-formant`.
"""
from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from scipy.signal import resample

FloatArr = NDArray[np.floating]


def to_mid_side(left: FloatArr, right: FloatArr | None = None) -> tuple[FloatArr, FloatArr]:
    left = np.asarray(left, dtype=np.float64)
    if right is None:
        return left.copy(), np.zeros_like(left)
    right = np.asarray(right, dtype=np.float64)
    n = min(int(left.shape[0]), int(right.shape[0]))
    l = left[:n]
    r = right[:n]
    return 0.5 * (l + r), 0.5 * (l - r)


def from_mid_side(mid: FloatArr, side: FloatArr) -> tuple[FloatArr, FloatArr]:
    mid = np.asarray(mid, dtype=np.float64)
    side = np.asarray(side, dtype=np.float64)
    n = min(int(mid.shape[0]), int(side.shape[0]))
    m = mid[:n]
    s = side[:n]
    return m + s, m - s


def _resample_linear(x: FloatArr, ratio: float) -> FloatArr:
    """Change duration by 1/ratio (higher pitch → shorter)."""
    x = np.asarray(x, dtype=np.float64)
    n = int(x.shape[0])
    if n == 0 or abs(ratio - 1.0) < 1e-9:
        return x.copy()
    new_n = max(1, int(round(n / ratio)))
    # Map new sample i → source position i * (n-1)/(new_n-1) * ... actually
    # playbackRate = ratio means read faster: out[i] = in[i * ratio]
    src_idx = np.linspace(0, n - 1, new_n)
    return np.interp(src_idx, np.arange(n), x).astype(np.float64, copy=False)


def _stretch_to_length(x: FloatArr, target_n: int) -> FloatArr:
    """Exact frame-count restore after pitch resample (FFT resample — phase-stable)."""
    x = np.asarray(x, dtype=np.float64)
    n = int(x.shape[0])
    if n == 0:
        return np.zeros(target_n, dtype=np.float64)
    if n == target_n:
        return x.copy()
    y = resample(x, target_n)
    return np.asarray(y, dtype=np.float64)


def _pitch_shift_mono_constant_length(x: FloatArr, ratio: float) -> FloatArr:
    x = np.asarray(x, dtype=np.float64)
    n = int(x.shape[0])
    if n == 0 or abs(ratio - 1.0) < 1e-9:
        return x.copy()
    # Higher pitch → shorter via rate change, then stretch back to n (length locked).
    pitched = _resample_linear(x, ratio)
    return _stretch_to_length(pitched, n)


def pitch_shift_mid_side(
    left: FloatArr,
    right: FloatArr | None,
    semitones: float,
    *,
    sample_rate: int,
) -> tuple[FloatArr, FloatArr]:
    """
    Pitch-shift stereo (or mono-as-left) by `semitones`, preserving frame count.

    Mid and side share the same ratio so stereo width tracks pitch; length
    matches the source for dry stacking of chord tones.
    """
    del sample_rate  # rate-independent (resample + OLA); kept for API clarity
    ratio = float(2.0 ** (semitones / 12.0))
    mid, side = to_mid_side(left, right)
    n = int(mid.shape[0])
    mid_s = _pitch_shift_mono_constant_length(mid, ratio)
    if float(np.max(np.abs(side))) < 1e-8:
        side_s = np.zeros(n, dtype=np.float64)
    else:
        side_s = _pitch_shift_mono_constant_length(side, ratio)
    if mid_s.shape[0] != n:
        mid_s = mid_s[:n] if mid_s.shape[0] > n else np.pad(mid_s, (0, n - mid_s.shape[0]))
    if side_s.shape[0] != n:
        side_s = side_s[:n] if side_s.shape[0] > n else np.pad(side_s, (0, n - side_s.shape[0]))
    # Peak guard — OLA can overshoot
    peak = max(float(np.max(np.abs(mid_s))), float(np.max(np.abs(side_s))), 1e-12)
    if peak > 4.0:
        scale = 4.0 / peak
        mid_s *= scale
        side_s *= scale
    return from_mid_side(mid_s, side_s)


def pitch_shift_audio(
    audio: FloatArr,
    semitones: float,
    *,
    sample_rate: int,
) -> FloatArr:
    """Pitch-shift mono (N,) or stereo (N,2) / (2,N) without length change."""
    x = np.asarray(audio, dtype=np.float64)
    if x.ndim == 1:
        l, r = pitch_shift_mid_side(x, None, semitones, sample_rate=sample_rate)
        return 0.5 * (l + r)
    if x.ndim == 2:
        if x.shape[0] == 2 and x.shape[1] != 2:
            l, r = pitch_shift_mid_side(x[0], x[1], semitones, sample_rate=sample_rate)
            return np.vstack([l, r])
        l, r = pitch_shift_mid_side(x[:, 0], x[:, 1], semitones, sample_rate=sample_rate)
        return np.column_stack([l, r])
    raise ValueError(f"unsupported audio shape {x.shape}")
