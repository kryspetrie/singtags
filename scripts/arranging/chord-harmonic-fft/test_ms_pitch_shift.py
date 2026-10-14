#!/usr/bin/env python3
"""Sanity checks for mid/side constant-length pitch shift."""
from __future__ import annotations

import numpy as np

from ms_pitch_shift import pitch_shift_audio, to_mid_side


def test_length_and_finite():
    sr = 44100
    n = sr
    t = np.arange(n) / sr
    f0 = 164.81
    mid = np.sin(2 * np.pi * f0 * t)
    side = 0.25 * np.sin(2 * np.pi * f0 * 2 * t + 0.3)
    stereo = np.column_stack([mid + side, mid - side])
    for st in (-12.0, -5.0, 0.0, 3.0, 7.0, 12.0):
        out = pitch_shift_audio(stereo, st, sample_rate=sr)
        assert out.shape == stereo.shape, (st, out.shape)
        assert np.isfinite(out).all()
        assert float(np.max(np.abs(out))) < 20.0
    m0, s0 = to_mid_side(stereo[:, 0], stereo[:, 1])
    out7 = pitch_shift_audio(stereo, 7.0, sample_rate=sr)
    m1, s1 = to_mid_side(out7[:, 0], out7[:, 1])
    # Side energy should remain a meaningful fraction of mid (imaging preserved).
    r0 = float(np.sqrt(np.mean(s0**2)) / (np.sqrt(np.mean(m0**2)) + 1e-12))
    r1 = float(np.sqrt(np.mean(s1**2)) / (np.sqrt(np.mean(m1**2)) + 1e-12))
    assert r1 > 0.05, (r0, r1)
    print("test_ms_pitch_shift: ok", f"side/mid before={r0:.3f} after+7={r1:.3f}")


if __name__ == "__main__":
    test_length_and_finite()
