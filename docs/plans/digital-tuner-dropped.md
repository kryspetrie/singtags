# Digital Tuner — dropped / deferred ideas

> **Status:** Cut from the live Labs tuner (2026-11-12) so the product spine stays **Tune · FFT · Spec · Glance**.  
> **Still shipped:** spectrum chord scoring on FFT/Spec (`useSpectrumChordScore`, `fundamentalsFromPeaks`, `chordStack`), Tune chord-lock, session strip under Tune.  
> **Related plan:** [digital-tuner.md](digital-tuner.md)

This file is a parking lot — not a commitment to rebuild. Prefer re-reading kill-gate evidence before restoring anything.

---

## Cut from UI / prefs (2026-11-12)

### Dedicated Chord Analyze page
- **Was:** Multi-F0 “Chord” Analyze tab + `ChordStackView` / canvas / beat-scope, `useTunerChordSession`, worker `analyze: 'chord'`.
- **Why cut:** Harmonics often mislabeled as extra notes; FFT/Spec already show partials. Intonation moved to spectrum fundamentals + JI score strip.
- **Migrate:** Saved `analyzeSurface: 'chord'` → `fft`.
- **Keep:** `chordStack.ts`, nature match, Tune chord-lock, FFT/Spec status strip / Glance LOCKED·FIX overlay.

### Analyze · Harmonics
- **Was:** Detail tab reusing FFT DSP to teach partials of the strongest peak; Glance remapped → FFT.
- **Why cut:** Same pipeline as FFT with a weaker product story; easy to confuse with FFT.

### Analyze · Staff
- **Was:** Staff intonation plot of the same session history as the Tune phrase strip; Glance remapped → Tune.
- **Why cut:** Duplicate history surface; strip is enough for phrase review.

### Ghost prefs (never or barely wired)
| Pref | Issue |
| --- | --- |
| `density` | Persisted; layout ignored it (viewport MQ only). |
| `historyCapSec` | Persisted; session history used a hardcoded window. |
| `chordRootPolicy` | Persisted; spectrum / stack score never read it. |
| `staffClef` | Only served the Staff tab. |

`scaleMode` remains in the blob (FFT/Spec guide lines) with chromatic default; a settings picker is still deferred.

---

## Deferred (not deleted from product intent)

- **Harmonics teaching overlay** on FFT (partial markers as an option, not a tab).
- **Staff / pitch-map review** as a single history mode (strip ↔ staff), not a parallel Analyze tab.
- **Configurable history length** if phrase review becomes a first-class feature.
- **Root policy** (lowest / pinned / common-shift) if Assisted scoring needs more than pin + nature.
- **Layout density** if we ever ship comfortable/compact chrome beyond breakpoints.
- Domain removed with the cut (restore from git if needed): `ChordStack*` UI, `useTunerChordSession`, `chordPeakTrack`, `chordBeatScope`, `toneTrace`, `TunerHarmonicsView`, `harmonicSeries` (tuner), `TunerStaffPlotView`, `staffIntonation`, worker `analyze: 'chord'`.

---

## Live product spine

1. **Tune** — needle / strobe / scope + optional session strip + chord-lock JI targets.  
2. **FFT** — spectrum + fundamentals + chord status strip.  
3. **Spec** — scrolling spectrogram + held tracks + chord status strip.  
4. **Glance** — Tune · FFT · Spec only (10-ft wash + words).
