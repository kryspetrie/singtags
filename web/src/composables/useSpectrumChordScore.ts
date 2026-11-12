/**
 * Chord intonation from FFT / Spec peaks — fundamentals only, then nature + JI score.
 * Replaces the dedicated Chord Analyze multi-F0 page for “is this chord in tune?”
 */
import { computed, shallowRef, watch, type Ref } from 'vue'
import { noteFromHz } from '../domain/tuner/noteFromHz'
import { fundamentalsFromPeaks } from '../domain/tuner/fundamentalsFromPeaks'
import {
  applyNatureHysteresis,
  createNatureHysteresis,
  matchNatureFromPcs,
} from '../domain/tuner/natureMatch'
import { scoreChordStack, type ChordStackScore } from '../domain/tuner/chordStack'
import type { DigitalTunerPrefs } from '../lib/preferences/digitalTuner'

export type SpectrumPeakIn = {
  hz: number
  salience: number
}

export function useSpectrumChordScore(opts: {
  prefs: Ref<DigitalTunerPrefs>
  a4Hz: Ref<number>
  /** Live spectral peaks (FFT labels or Spec held tracks). */
  peaks: Ref<SpectrumPeakIn[]>
  enabled: Ref<boolean>
}) {
  const score = shallowRef<ChordStackScore | null>(null)
  let hyst = createNatureHysteresis()

  function reset(): void {
    score.value = null
    hyst = createNatureHysteresis()
  }

  function resolvePin(): { natureId: string; rootPc: number } | null {
    const p = opts.prefs.value
    if (p.chordNatureId && p.pinnedRootPc != null) {
      return { natureId: p.chordNatureId, rootPc: p.pinnedRootPc }
    }
    if (p.chordNatureId) {
      return { natureId: p.chordNatureId, rootPc: p.keyPc }
    }
    return null
  }

  function recompute(): void {
    if (!opts.enabled.value) {
      score.value = null
      return
    }
    const fundamentals = fundamentalsFromPeaks(opts.peaks.value, { maxFundamentals: 4 })
    if (fundamentals.length < 2) {
      score.value = null
      return
    }

    const a4 = opts.a4Hz.value
    const tones = fundamentals
      .map((p) => {
        const n = noteFromHz(p.hz, a4)
        if (!n) return null
        return { hz: p.hz, etCents: n.cents, midi: n.midi, salience: p.salience }
      })
      .filter((t): t is NonNullable<typeof t> => t != null)

    if (tones.length < 2) {
      score.value = null
      return
    }

    const pcs = [...new Set(tones.map((t) => ((t.midi % 12) + 12) % 12))]
    const pinned = resolvePin()
    const raw = matchNatureFromPcs(pcs)
    const hystOut = applyNatureHysteresis(hyst, raw, {
      holdFrames: 4,
      missHoldFrames: 10,
      pinned,
    })
    hyst = hystOut.state
    const match = hystOut.match

    if (!match) {
      score.value = {
        natureId: '',
        rootPc: 0,
        selfLocked: false,
        keyCentered: false,
        commonShiftCents: 0,
        unstable: true,
        status: 'wait',
        tones: [],
        assistedPinRequired: !pinned,
      }
      return
    }

    const p = opts.prefs.value
    score.value = scoreChordStack(
      tones.map((t) => ({ hz: t.hz, etCents: t.etCents, midi: t.midi })),
      {
        natureId: match.natureId,
        rootPc: match.rootPc,
        keyPc: p.keyPc,
        temperament: p.keyGridTemperament,
        customOffsetsCents: p.customOffsetsCents,
        chordLockWindowCents: p.chordLockWindowCents,
        assistedPinRequired: !pinned,
      },
    )
  }

  watch(
    () => [opts.peaks.value, opts.enabled.value, opts.a4Hz.value, opts.prefs.value] as const,
    () => recompute(),
    { deep: true },
  )

  watch(
    () => opts.enabled.value,
    (on) => {
      if (!on) reset()
    },
  )

  const statusLabel = computed(() => {
    const s = score.value
    if (!s) return null
    if (s.assistedPinRequired) return 'Chord — pin nature/root in Settings'
    if (s.status === 'wait') return 'Chord — hearing…'
    if (s.status === 'locked') return 'Chord locked'
    if (s.status === 'shifted') return `Chord shifted ${Math.round(s.commonShiftCents)}¢`
    return 'Chord — fix tones'
  })

  return { score, statusLabel, reset, recompute }
}
