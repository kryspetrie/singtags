/**
 * Live chord stack session — multi-F0 peaks → nature match → scoreChordStack.
 * Assisted mode (Phase 4 Conditional): prefer pinned nature/root from prefs.
 */
import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import { multiF0 } from '../audio/tuner/multiF0'
import { scoreChordStack, type ChordStackScore } from '../domain/tuner/chordStack'
import {
  applyNatureHysteresis,
  createNatureHysteresis,
  matchNatureFromPcs,
} from '../domain/tuner/natureMatch'
import { noteFromHz } from '../domain/tuner/noteFromHz'
import type { DigitalTunerPrefs } from '../lib/preferences/digitalTuner'

export type ChordFrameIn = {
  samples: Float32Array
  sampleRate: number
}

export function useTunerChordSession(opts: {
  prefs: Ref<DigitalTunerPrefs>
  a4Hz: Ref<number>
  enabled: Ref<boolean>
}) {
  const score = shallowRef<ChordStackScore | null>(null)
  const assisted = ref(true) // Phase 4 Conditional
  let hyst = createNatureHysteresis()

  function reset(): void {
    score.value = null
    hyst = createNatureHysteresis()
  }

  function ingest(frame: ChordFrameIn): void {
    if (!opts.enabled.value) {
      score.value = null
      return
    }
    const { peaks, pitchClasses } = multiF0(frame.samples, frame.sampleRate, {
      a4Hz: opts.a4Hz.value,
      maxPeaks: 4,
      salienceFloor: 0.12,
    })
    const auto = matchNatureFromPcs(pitchClasses)
    const pinned =
      opts.prefs.value.chordNatureId && opts.prefs.value.pinnedRootPc != null
        ? {
            natureId: opts.prefs.value.chordNatureId,
            rootPc: opts.prefs.value.pinnedRootPc,
          }
        : opts.prefs.value.chordNatureId
          ? {
              natureId: opts.prefs.value.chordNatureId,
              rootPc: opts.prefs.value.keyPc,
            }
          : null

    const { state, match } = applyNatureHysteresis(hyst, auto, {
      holdFrames: 4,
      pinned,
    })
    hyst = state
    if (!match) {
      score.value = null
      return
    }

    const tones = peaks
      .map((p) => {
        const n = noteFromHz(p.hz, opts.a4Hz.value)
        if (!n) return null
        return { hz: p.hz, midi: n.midi, etCents: n.cents }
      })
      .filter((t): t is NonNullable<typeof t> => t != null)
      .sort((a, b) => a.hz - b.hz)

    score.value = scoreChordStack(tones, {
      natureId: match.natureId,
      rootPc: match.rootPc,
      keyPc: opts.prefs.value.keyPc,
      temperament: opts.prefs.value.keyGridTemperament,
      customOffsetsCents: opts.prefs.value.customOffsetsCents,
      chordLockWindowCents: opts.prefs.value.chordLockWindowCents,
      assistedPinRequired: assisted.value && !pinned,
    })
  }

  watch(
    () => opts.enabled.value,
    (on) => {
      if (!on) reset()
    },
  )

  const glanceStatus = computed(() => score.value?.status ?? 'wait')

  return { score, assisted, ingest, reset, glanceStatus }
}
