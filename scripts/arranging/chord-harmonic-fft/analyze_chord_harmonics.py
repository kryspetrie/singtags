#!/usr/bin/env python3
"""
FFT harmonic-strength ranking of the 13 barbershop natures × closed voicings.

Sources:
  1) Voice-like sample @ E3 (glottal pulse + formants) — mid/side stereo
  2) Synthetic additive tone @ E3 (1/n partials, app-like)

Pitch shifts use constant-length mid/side (`ms_pitch_shift.py`) so four parts
stack sample-accurately. **Just intonation only** — Rylander role ratios.

Ranks every catalog stack (`nature:voicing`), compared to RING_TIER + scoreHarmonicity.
"""
from __future__ import annotations

import json
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from scipy.io import wavfile
from scipy.signal import get_window

from ms_pitch_shift import pitch_shift_audio, to_mid_side

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
SR = 44100
E3_MIDI = 52
E3_HZ = 440.0 * (2.0 ** ((E3_MIDI - 69) / 12.0))
DURATION_S = 1.25

# Mirrors web/src/domain/arranging/contestProfile.ts RING_TIER (lower = more ring).
RING_TIER: dict[str, int] = {
    "major": 1,
    "seventh": 1,
    "minor": 2,
    "madd6": 2,
    "sixth": 3,
    "add9": 3,
    "ninth": 3,
    "m7": 4,
    "maj7": 4,
    "half-dim": 5,
    "dim7": 5,
    "dim": 5,
    "aug": 6,
}

JUST_RATIOS = {
    "root": 1.0,
    "M3": 5 / 4,
    "m3_65": 6 / 5,
    "m3_76": 7 / 6,
    "P5": 3 / 2,
    "harm7": 7 / 4,
    "M6": 5 / 3,
    "M7": 15 / 8,
    "M9": 9 / 8,
    "A5": 25 / 16,
    "d5": 7 / 5,
}

CHORDS: dict[str, dict[int, int]] = {
    "major": {1: 0, 3: 4, 5: 7},
    "seventh": {1: 0, 3: 4, 5: 7, 7: 10},
    "half-dim": {1: 0, 3: 3, 5: 6, 7: 10},
    "aug": {1: 0, 3: 4, 5: 8},
    "ninth": {1: 0, 3: 4, 5: 7, 7: 10, 9: 2},
    "sixth": {1: 0, 3: 4, 5: 7, 6: 9},
    "maj7": {1: 0, 3: 4, 5: 7, 7: 11},
    "minor": {1: 0, 3: 3, 5: 7},
    "m7": {1: 0, 3: 3, 5: 7, 7: 10},
    "dim7": {1: 0, 3: 3, 5: 6, 7: 9},
    "dim": {1: 0, 3: 3, 5: 6},
    "add9": {1: 0, 3: 4, 5: 7, 9: 2},
    "madd6": {1: 0, 3: 3, 5: 7, 6: 9},
}

# Full catalog shells (mirrors domain/arranging/chords/chords.ts VOICINGS_BY_CHORD).
VOICINGS_BY_CHORD: dict[str, list[str]] = {
    "major": ["1513", "1531", "1153", "1351", "1355", "3515", "3151", "3155", "5135", "5153", "5351"],
    "seventh": [
        "5317",
        "5713",
        "1537",
        "1735",
        "5137",
        "5731",
        "1357",
        "1753",
        "1375",
        "1573",
        "5173",
        "5371",
    ],
    "half-dim": ["5317", "5713", "1537", "1735", "1357", "1753"],
    "aug": ["1153", "1351"],
    "ninth": ["5793", "5397", "1793", "1379", "1759", "5973", "1973", "3759"],
    "sixth": ["1361", "1163", "1365"],
    "maj7": ["1573", "1375"],
    "minor": ["1513", "1531", "1153", "1351", "1355", "3515", "3151", "3155", "5135", "5153", "5351"],
    "m7": ["5317", "5713", "1537", "1735", "1357", "1753"],
    "dim7": ["1375", "1735", "3715", "5713"],
    "dim": ["1351"],
    "add9": ["1593", "1395"],
    "madd6": ["1563", "1356", "1653", "1635"],
}


def midi_hz(midi: float) -> float:
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def role_ratio(nature_id: str, role: int) -> float:
    off = CHORDS[nature_id].get(role)
    if off is None:
        return 1.0
    if role == 1:
        return JUST_RATIOS["root"]
    if role == 3:
        if off == 4:
            return JUST_RATIOS["M3"]
        if nature_id in ("madd6", "m7", "half-dim"):
            return JUST_RATIOS["m3_76"]
        return JUST_RATIOS["m3_65"]
    if role == 5:
        if off == 8:
            return JUST_RATIOS["A5"]
        if off == 6:
            return JUST_RATIOS["d5"]
        return JUST_RATIOS["P5"]
    if role == 6:
        return JUST_RATIOS["M6"]
    if role == 7:
        if off == 11:
            return JUST_RATIOS["M7"]
        if off == 9:
            return JUST_RATIOS["M6"]
        return JUST_RATIOS["harm7"]
    if role == 9:
        return JUST_RATIOS["M9"]
    return 2.0 ** (off / 12.0)


def nearest_octave(target: float, ref: float) -> float:
    if target <= 0 or ref <= 0:
        return target
    f = target
    while f < ref / math.sqrt(2):
        f *= 2
    while f >= ref * math.sqrt(2):
        f /= 2
    return f


def place_closed_ttbb(nature_id: str, voicing: str, lead_midi: int) -> dict[str, int]:
    """Simple closed placeVoicing (lead fixed); returns MIDI ints."""
    offsets = CHORDS[nature_id]
    roles = [int(c) for c in voicing]
    if len(roles) < 4 or any(r not in offsets for r in roles):
        raise ValueError(f"bad voicing {voicing} for {nature_id}")
    # Infer root PC so lead role matches lead_midi pitch class.
    lead_role = roles[2]
    lead_off = offsets[lead_role]
    root_pc = (lead_midi - lead_off) % 12

    def tone_midi(role: int, prefer_below: int | None, prefer_above: int | None) -> int:
        pc = (root_pc + offsets[role]) % 12
        # Start near lead
        m = lead_midi - ((lead_midi - pc) % 12)
        if prefer_below is not None:
            while m >= prefer_below:
                m -= 12
            while m < prefer_below - 12:
                m += 12
        if prefer_above is not None:
            while m <= prefer_above:
                m += 12
            while m > prefer_above + 12:
                m -= 12
        return m

    lead = lead_midi
    tenor = tone_midi(roles[3], None, lead)
    while tenor <= lead:
        tenor += 12
    while tenor > lead + 12:
        tenor -= 12
    bari = tone_midi(roles[1], lead, None)
    while bari > lead:
        bari -= 12
    while bari < lead - 12:
        bari += 12
    if bari == lead:
        bari -= 12
    if bari >= tenor:
        bari -= 12
    bass = tone_midi(roles[0], bari, None)
    while bass >= bari or bass >= lead:
        bass -= 12
    while bass < bari - 24:
        bass += 12
    return {"bass": bass, "bari": bari, "lead": lead, "tenor": tenor, "root_pc": root_pc}


# ---------- sample generators ----------


def synth_additive_e3(n: int, sr: int = SR) -> NDArray[np.float64]:
    """App-like synthetic tone: harmonic series 1/n roll-off at E3."""
    t = np.arange(n) / sr
    y = np.zeros(n, dtype=np.float64)
    for k in range(1, 17):
        y += (1.0 / k) * np.sin(2 * np.pi * E3_HZ * k * t)
    # Light stereo: slight side from delayed copy (width without changing mid pitch).
    delay = int(0.0007 * sr)
    left = y.copy()
    right = np.zeros_like(y)
    right[delay:] = y[:-delay] * 0.85
    right[:delay] = y[:delay] * 0.85
    # Encode as mid-heavy stereo
    mid = 0.7 * y
    side = 0.15 * (left - right)
    l = mid + side
    r = mid - side
    peak = max(np.max(np.abs(l)), np.max(np.abs(r)), 1e-12)
    return np.column_stack([l / peak * 0.85, r / peak * 0.85])


def synth_voice_e3(n: int, sr: int = SR) -> NDArray[np.float64]:
    """
    Voice-like @ E3: filtered glottal pulse train + F1/F2/F3 formants ('ah').
    Stereo with measured mid/side energy (not identical L/R).
    """
    t = np.arange(n) / sr
    # Liljencrants–Fant-ish glottal: asymmetric pulse every period
    period = 1.0 / E3_HZ
    phase = (t % period) / period
    # Open quotient ~0.6
    og = phase < 0.6
    glottal = np.zeros(n)
    glottal[og] = np.sin(np.pi * phase[og] / 0.6) ** 2
    # Formant resonances via multi-pole IIR (biquad cascade approx)
    y = glottal.astype(np.float64)
    for fc, bw, g in ((700.0, 90.0, 1.0), (1200.0, 110.0, 0.7), (2600.0, 160.0, 0.35)):
        # Simple resonated bandpass: y += g * bandpass(y_raw) via spectral domain chunk
        # Time-domain: complex resonator
        r = math.exp(-math.pi * bw / sr)
        omega = 2 * math.pi * fc / sr
        a1 = -2 * r * math.cos(omega)
        a2 = r * r
        x = glottal
        z1 = z2 = 0.0
        out = np.zeros(n)
        for i in range(n):
            w = x[i] - a1 * z1 - a2 * z2
            out[i] = w - z2  # bandpass-ish
            z2 = z1
            z1 = w
        y = y + g * out
    # Soft clip + fade
    y = np.tanh(y * 2.2)
    fade = min(int(0.02 * sr), n // 8)
    y[:fade] *= np.linspace(0, 1, fade)
    y[-fade:] *= np.linspace(1, 0, fade)
    # Stereo: mid = voice, side = lightly decorrelated (allpass-ish delay)
    delay = int(0.0012 * sr)
    side_src = np.zeros_like(y)
    side_src[delay:] = y[:-delay]
    side = 0.18 * (y - side_src)
    mid = y
    l = mid + side
    r = mid - side
    peak = max(np.max(np.abs(l)), np.max(np.abs(r)), 1e-12)
    return np.column_stack([l / peak * 0.9, r / peak * 0.9])


def write_wav_stereo(path: Path, stereo: NDArray[np.float64], sr: int = SR) -> None:
    pcm = np.clip(stereo, -1, 1)
    wavfile.write(path, sr, (pcm * 32767.0).astype(np.int16))


# ---------- stack + FFT score ----------


def just_fundamentals_hz(
    midis: dict[str, int],
    nature_id: str,
    voicing: str,
) -> list[float]:
    """
    Exact Rylander JI fundamentals (mirrors justFundamentals in harmonicityScore.ts).

    Root inferred from the voice on role 1 (else bass); each part = rootHz × roleRatio,
    octave-matched to the ET placement skeleton so register stays TTBB-legal.
    """
    roles = [int(c) for c in voicing]
    part_order = ("bass", "bari", "lead", "tenor")
    et_hz = [midi_hz(midis[p]) for p in part_order]
    root_i = next((i for i, r in enumerate(roles) if r == 1), 0)
    root_hz = et_hz[root_i] / role_ratio(nature_id, roles[root_i])
    return [
        nearest_octave(root_hz * role_ratio(nature_id, roles[i]), et_hz[i]) for i in range(4)
    ]


def verify_just_ratios(
    fundamentals: list[float],
    nature_id: str,
    voicing: str,
    *,
    max_cents: float = 0.5,
) -> tuple[bool, float]:
    """Confirm pairwise intervals match JI role ratios (octave-reduced) within max_cents."""
    roles = [int(c) for c in voicing]
    worst = 0.0
    for i in range(4):
        for j in range(i + 1, 4):
            ri = role_ratio(nature_id, roles[i])
            rj = role_ratio(nature_id, roles[j])
            expect = rj / ri
            # Reduce expected ratio into (0.5, 2]
            while expect > 2.0:
                expect /= 2.0
            while expect <= 0.5:
                expect *= 2.0
            got = fundamentals[j] / fundamentals[i]
            while got > 2.0:
                got /= 2.0
            while got <= 0.5:
                got *= 2.0
            # Also try expect*2 / expect/2 if octave placement swapped
            cents = min(
                abs(1200 * math.log2(got / expect)),
                abs(1200 * math.log2(got / (expect * 2))),
                abs(1200 * math.log2(got / (expect / 2))),
            )
            worst = max(worst, cents)
    return worst <= max_cents, worst


def stack_chord_just(
    source_stereo: NDArray[np.float64],
    midis: dict[str, int],
    *,
    nature_id: str,
    voicing: str,
    sr: int = SR,
) -> tuple[NDArray[np.float64], list[float]]:
    """
    Pitch-shift source (E3) to **just** part frequencies; mid/side constant-length mix.
    """
    part_order = ("bass", "bari", "lead", "tenor")
    part_hz_list = just_fundamentals_hz(midis, nature_id, voicing)
    part_hz = {p: part_hz_list[i] for i, p in enumerate(part_order)}

    n = source_stereo.shape[0]
    mix_l = np.zeros(n, dtype=np.float64)
    mix_r = np.zeros(n, dtype=np.float64)
    for p in part_order:
        semitones = 12.0 * math.log2(part_hz[p] / E3_HZ)
        shifted = pitch_shift_audio(source_stereo, semitones, sample_rate=sr)
        assert shifted.shape[0] == n, f"length drift on {p}: {shifted.shape[0]} vs {n}"
        mix_l += shifted[:, 0]
        mix_r += shifted[:, 1]
    peak = max(np.max(np.abs(mix_l)), np.max(np.abs(mix_r)), 1e-12)
    stereo = np.column_stack([mix_l / peak * 0.9, mix_r / peak * 0.9])
    return stereo, part_hz_list


def _band_power(mag: NDArray[np.float64], freqs: NDArray[np.float64], hz: float, cents: float = 25.0) -> float:
    if hz <= 0 or hz >= float(freqs[-1]):
        return 0.0
    lo = hz * (2 ** (-cents / 1200))
    hi = hz * (2 ** (cents / 1200))
    mask = (freqs >= lo) & (freqs <= hi)
    return float(np.sum(mag[mask])) if np.any(mask) else 0.0


def fft_harmonic_strength(
    stereo: NDArray[np.float64],
    fundamentals_hz: list[float],
    sr: int = SR,
) -> float:
    """
    Mid-channel FFT lock score for a known TTBB stack.

    Builds the predicted partial grid from the four fundamentals (JI or ET),
    measures on-grid power vs near-miss roughness, normalized by band power.
    Mid only — Side is for imaging, not lock.
    """
    mid, _side = to_mid_side(stereo[:, 0], stereo[:, 1])
    start = int(0.25 * sr)
    seg = mid[start : start + int(0.6 * sr)]
    if seg.size < 1024:
        seg = mid
    win = get_window("hann", seg.size, fftbins=True)
    spec = np.fft.rfft(seg * win)
    mag = np.abs(spec) ** 2
    freqs = np.fft.rfftfreq(seg.size, 1.0 / sr)
    band = (freqs >= 70.0) & (freqs <= 4500.0)
    band_e = float(np.sum(mag[band])) + 1e-12

    # Predicted partials (12 per voice), weight 1/k like the app model
    grid: list[tuple[float, float]] = []
    for f0 in fundamentals_hz:
        if f0 <= 0:
            continue
        for k in range(1, 13):
            fk = f0 * k
            if fk > 4500:
                break
            grid.append((fk, 1.0 / k))

    coincidence = 0.0
    for fk, w in grid:
        coincidence += w * _band_power(mag, freqs, fk, cents=22.0)

    # Roughness: energy in the 40–100¢ skirts of each predicted partial
    roughness = 0.0
    for fk, w in grid:
        inner = _band_power(mag, freqs, fk, cents=22.0)
        wide = _band_power(mag, freqs, fk, cents=100.0)
        roughness += w * max(0.0, wide - inner)

    # Cross-voice shared-partial bonus: pairs of fundamentals with near-integer ratio
    shared = 0.0
    for i in range(len(fundamentals_hz)):
        for j in range(i + 1, len(fundamentals_hz)):
            a = fundamentals_hz[i]
            b = fundamentals_hz[j]
            if a < 1 or b < 1:
                continue
            ratio = max(a, b) / min(a, b)
            nearest = round(ratio)
            if nearest < 1:
                continue
            rel = abs(ratio - nearest) / nearest
            if rel < 0.01:
                # Energy at the lcm-ish shared frequency (higher of the two * nearest)
                shared_f = min(a, b) * nearest
                shared += _band_power(mag, freqs, shared_f, cents=20.0) / band_e

    return float((coincidence - 0.85 * roughness) / band_e + 0.35 * shared)


def app_harmonicity_just(fundamentals: list[float]) -> float:
    """Port of scoreHarmonicity on the same JI fundamentals used for stacking."""
    partials: list[tuple[float, float, int]] = []
    for v, f0 in enumerate(fundamentals):
        for n in range(1, 13):
            partials.append((f0 * n, 1.0 / n, v))

    coincidence = 0.0
    roughness = 0.0
    coinc_rel = 0.0035
    rough_rel = 0.04
    for i in range(len(partials)):
        for j in range(i + 1, len(partials)):
            fa, aa, va = partials[i]
            fb, ab, vb = partials[j]
            if va == vb:
                continue
            mean = 0.5 * (fa + fb)
            if mean < 1:
                continue
            rel = abs(fa - fb) / mean
            w = aa * ab
            if rel <= coinc_rel:
                coincidence += w * (1 - rel / coinc_rel)
            elif rel < rough_rel:
                t = 1 - (rel - coinc_rel) / (rough_rel - coinc_rel)
                roughness += w * t * t
    return coincidence - 0.9 * roughness


@dataclass
class Row:
    nature: str
    voicing: str
    source: str  # voice | synth
    fft_score: float
    app_harmonicity: float
    ring_tier: int
    midis: dict[str, int]
    fundamentals_hz: list[float]
    ji_max_cents_err: float
    stack_id: str  # nature:voicing


def spearman(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0
    rx = np.argsort(np.argsort(xs)).astype(float)
    ry = np.argsort(np.argsort(ys)).astype(float)
    rx -= rx.mean()
    ry -= ry.mean()
    den = float(np.sqrt(np.sum(rx * rx) * np.sum(ry * ry)))
    return float(np.sum(rx * ry) / den) if den > 1e-12 else 0.0


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    n = int(SR * DURATION_S)
    voice = synth_voice_e3(n)
    synth = synth_additive_e3(n)
    write_wav_stereo(OUT / "e3_voice_ms.wav", voice)
    write_wav_stereo(OUT / "e3_synth_ms.wav", synth)

    shifted = pitch_shift_audio(voice, 7.0, sample_rate=SR)
    assert shifted.shape == voice.shape
    mid, side = to_mid_side(voice[:, 0], voice[:, 1])
    print(f"E3={E3_HZ:.2f} Hz  voice mid/side RMS={np.sqrt(np.mean(mid**2)):.4f}/{np.sqrt(np.mean(side**2)):.4f}")
    print(f"pitch +7st length ok: {shifted.shape[0]} frames")
    print("Tuning: JUST INTONATION only (Rylander ratios → pitch-shift targets)")

    lead_midi = 67
    rows: list[Row] = []
    sources = (("voice", voice), ("synth", synth))
    ji_fail = 0

    for nature, voicings in VOICINGS_BY_CHORD.items():
        for voicing in voicings:
            try:
                placed = place_closed_ttbb(nature, voicing, lead_midi)
            except ValueError as e:
                print("skip", nature, voicing, e)
                continue
            midis = {k: placed[k] for k in ("bass", "bari", "lead", "tenor")}
            f0s = just_fundamentals_hz(midis, nature, voicing)
            ok, err_c = verify_just_ratios(f0s, nature, voicing)
            if not ok:
                ji_fail += 1
                print(f"JI warn {nature}/{voicing}: max err {err_c:.2f}¢")
            for src_name, src in sources:
                stacked, f0_used = stack_chord_just(
                    src, midis, nature_id=nature, voicing=voicing
                )
                # Stack must use the same JI targets we verified
                assert all(
                    abs(a - b) / max(a, 1e-9) < 1e-9 for a, b in zip(f0s, f0_used)
                )
                fft_s = fft_harmonic_strength(stacked, f0_used)
                app_s = app_harmonicity_just(f0_used)
                rows.append(
                    Row(
                        nature=nature,
                        voicing=voicing,
                        source=src_name,
                        fft_score=fft_s,
                        app_harmonicity=app_s,
                        ring_tier=RING_TIER[nature],
                        midis=midis,
                        fundamentals_hz=[round(f, 4) for f in f0_used],
                        ji_max_cents_err=round(err_c, 4),
                        stack_id=f"{nature}:{voicing}",
                    )
                )

    print(f"Stacks scored: {len(rows)}  JI interval warnings: {ji_fail}")

    report_lines: list[str] = []
    report_lines.append("# Chord harmonic strength — just intonation, stack-by-stack\n")
    report_lines.append(
        "All stacks use **just intonation** (Rylander role ratios → mid/side "
        "constant-length pitch targets from E3). Ranking is **per stack** "
        "(`nature:voicing`), not one row per chord nature.\n"
    )

    for source in ("voice", "synth"):
        subset = [r for r in rows if r.source == source]
        subset.sort(key=lambda r: -r.fft_score)
        report_lines.append(f"## Rank by FFT — {source} / just (all stacks)\n")
        report_lines.append(
            "| rank | stack | FFT | app harm | RING_TIER | bass..tenor MIDI |"
        )
        report_lines.append("| ---: | --- | ---: | ---: | ---: | --- |")
        for i, r in enumerate(subset, 1):
            midi_s = f"{r.midis['bass']}/{r.midis['bari']}/{r.midis['lead']}/{r.midis['tenor']}"
            report_lines.append(
                f"| {i} | `{r.stack_id}` | {r.fft_score:.4f} | {r.app_harmonicity:.3f} | "
                f"{r.ring_tier} | {midi_s} |"
            )
        fft_vals = [r.fft_score for r in subset]
        ring_strength = [7 - r.ring_tier for r in subset]
        app_vals = [r.app_harmonicity for r in subset]
        report_lines.append("")
        report_lines.append(
            f"- N = {len(subset)} stacks · Spearman FFT vs RING_TIER (7−tier): "
            f"**{spearman(fft_vals, ring_strength):.3f}**"
        )
        report_lines.append(
            f"- Spearman FFT vs app JI `scoreHarmonicity`: **{spearman(fft_vals, app_vals):.3f}**"
        )
        report_lines.append("")

        # Best / worst stack within each nature
        report_lines.append(f"### Best vs worst stack within each nature — {source}\n")
        report_lines.append("| nature | best stack | FFT | worst stack | FFT | Δ |")
        report_lines.append("| --- | --- | ---: | --- | ---: | ---: |")
        for nature in VOICINGS_BY_CHORD:
            group = [r for r in subset if r.nature == nature]
            if not group:
                continue
            best = max(group, key=lambda r: r.fft_score)
            worst = min(group, key=lambda r: r.fft_score)
            report_lines.append(
                f"| `{nature}` | `{best.voicing}` | {best.fft_score:.4f} | "
                f"`{worst.voicing}` | {worst.fft_score:.4f} | "
                f"{best.fft_score - worst.fft_score:.4f} |"
            )
        report_lines.append("")

    # Discrepancies on voice / just full ranking
    voice_rows = sorted(
        [r for r in rows if r.source == "voice"], key=lambda r: -r.fft_score
    )
    n_stacks = len(voice_rows)
    top_n = max(5, n_stacks // 10)
    bottom_n = top_n
    top = voice_rows[:top_n]
    bottom = voice_rows[-bottom_n:]
    report_lines.append("## Discrepancies (voice / just, stack ranks)\n")
    report_lines.append(
        f"Top {top_n} / bottom {bottom_n} of {n_stacks} stacks vs RING_TIER + app harmonicity.\n"
    )
    report_lines.append("### Strong measured lock but weak RING_TIER (≥5)\n")
    flags = [r for r in top if r.ring_tier >= 5]
    if flags:
        for r in flags:
            report_lines.append(
                f"- `{r.stack_id}` FFT={r.fft_score:.4f} RING={r.ring_tier} app={r.app_harmonicity:.3f}"
            )
    else:
        report_lines.append("- (none in top decile)")
    report_lines.append("\n### Weak measured lock but strong RING_TIER (≤2)\n")
    flags2 = [r for r in bottom if r.ring_tier <= 2]
    if flags2:
        for r in flags2:
            report_lines.append(
                f"- `{r.stack_id}` FFT={r.fft_score:.4f} RING={r.ring_tier} app={r.app_harmonicity:.3f}"
            )
    else:
        report_lines.append("- (none in bottom decile)")

    # Dom9 omit family
    n9 = [r for r in voice_rows if r.nature == "ninth"]
    if n9:
        report_lines.append("\n### Dom9 stacks (omit-root vs omit-5)\n")
        for r in sorted(n9, key=lambda x: -x.fft_score):
            bass_role = r.voicing[0]
            omit = "omit-root" if bass_role in "357" else ("omit-5" if bass_role == "1" else "?")
            report_lines.append(
                f"- `{r.voicing}` ({omit}) FFT={r.fft_score:.4f} app={r.app_harmonicity:.3f}"
            )

    report_lines.append("\n## Method notes\n")
    report_lines.append(
        "- **Just intonation only:** pitch-shift targets = `justFundamentals` "
        "(role ratios × root Hz, octave-matched to TTBB placement).\n"
        "- JI intervals verified pairwise (octave-reduced) before scoring.\n"
        "- Mid/side constant-length pitch shift for dry stacking.\n"
        "- FFT score on Mid against the JI partial grid of that stack.\n"
        "- App column = same JI fundamentals through `scoreHarmonicity` port.\n"
        f"- Lead skeleton @ MIDI {lead_midi}; every catalog voicing scored.\n"
    )

    report_path = OUT / "RESULTS.md"
    report_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    json_path = OUT / "results.json"
    json_path.write_text(json.dumps([asdict(r) for r in rows], indent=2), encoding="utf-8")
    print(f"Wrote {report_path}")
    print(f"Wrote {json_path}")
    # Preview top 15 voice stacks
    preview = sorted([r for r in rows if r.source == "voice"], key=lambda r: -r.fft_score)[:15]
    print("Top 15 voice/just stacks:")
    for i, r in enumerate(preview, 1):
        print(f"  {i:2d}. {r.stack_id:20s} FFT={r.fft_score:.4f} app={r.app_harmonicity:.3f} RING={r.ring_tier}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
