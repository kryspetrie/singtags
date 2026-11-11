/**
 * Live chord stack session — multi-F0 peaks from DSP worker → nature match → score.
 * Assisted mode: no Locked/Fix colors until nature+root are pinned.
 */
import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import type { TunerDspChord } from '../audio/tuner/tunerDspProtocol'
import { scoreChordStack, type ChordStackScore, type ChordStackToneOut } from '../domain/tuner/chordStack'
import {
  createChordPeakTrackState,
  pushChordPeaks,
  resetChordPeakTrackState,
} from '../domain/tuner/chordPeakTrack'
import {
  applyNatureHysteresis,
  createNatureHysteresis,
  matchNatureFromPcs,
} from '../domain/tuner/natureMatch'
import { noteFromHz } from '../domain/tuner/noteFromHz'
import { createToneTrace, pushToneTrace, type ToneTrace } from '../domain/tuner/toneTrace'
import type { DigitalTunerPrefs } from '../lib/preferences/digitalTuner'

export type ChordToneRow = {
  /** Stable slot index 0…3 (pitch order). */
  slot: number
  tone: ChordStackToneOut | null
  /** Live F0 label while stack is not yet scored (single note / WAIT). */
  hearing: { note: string; hz: number; midi: number } | null
  trace: ToneTrace
}

const UI_MS = 50
const SLOT_COUNT = 4

function assistedWaitScore(): ChordStackScore {
  return {
    natureId: '',
    rootPc: 0,
    selfLocked: false,
    keyCentered: false,
    commonShiftCents: 0,
    unstable: true,
    status: 'wait',
    tones: [],
    assistedPinRequired: true,
  }
}

export function useTunerChordSession(opts: {
  prefs: Ref<DigitalTunerPrefs>
  a4Hz: Ref<number>
  enabled: Ref<boolean>
}) {
  const score = shallowRef<ChordStackScore | null>(null)
  const rows = shallowRef<ChordToneRow[]>(makeEmptyRows())
  /** Latest multi-F0 peaks (Hz) for beat-scope teaching view. */
  const livePeaksHz = shallowRef<number[]>([])
  /** Conditional ADR: pin required before Locked/Fix coloring. */
  const assisted = ref(true)
  let hyst = createNatureHysteresis()
  let peakTracks = createChordPeakTrackState()
  let lastPublishMs = 0
  let stickyMidi: number[] = []

  function reset(): void {
    score.value = null
    rows.value = makeEmptyRows()
    livePeaksHz.value = []
    hyst = createNatureHysteresis()
    resetChordPeakTrackState(peakTracks)
    stickyMidi = []
    lastPublishMs = 0
  }

  function resolvePin(): { natureId: string; rootPc: number } | null {
    const p = opts.prefs.value
    // Analyze pin is independent of Tune "Chord lock" toggle.
    if (p.chordNatureId && p.pinnedRootPc != null) {
      return { natureId: p.chordNatureId, rootPc: p.pinnedRootPc }
    }
    if (p.chordNatureId) {
      return { natureId: p.chordNatureId, rootPc: p.keyPc }
    }
    return null
  }

  function applyDsp(chord: TunerDspChord): void {
    if (!opts.enabled.value) {
      score.value = null
      return
    }
    // Appear/hold + voice-band gate — ignore AC/fan drones and one-frame ghosts.
    const tracked = pushChordPeaks(
      peakTracks,
      chord.peaks.map((p) => ({
        hz: p.hz,
        salience: p.salience,
      })),
      {
        a4Hz: opts.a4Hz.value,
        fMinHz: opts.prefs.value.pitchFMinHz,
        fMaxHz: opts.prefs.value.pitchFMaxHz,
        appearHits: 4,
        holdMisses: 18,
        matchCents: 55,
      },
    )
    const peaks = tracked.peaks
    const pitchClasses = tracked.pitchClasses
    livePeaksHz.value = peaks.map((p) => p.hz).filter((hz) => hz > 0)
    const pinned = resolvePin()

    // Assisted: hear fundamentals, but do not color Locked/Fix until pinned.
    if (assisted.value && !pinned) {
      const rawTones = peaksToTones(peaks, opts.a4Hz.value)
      const tones = stabilizeTones(rawTones, stickyMidi)
      stickyMidi = tones.map((t) => t.midi)
      publish(assistedWaitScore(), tones, performance.now())
      return
    }

    const auto = matchNatureFromPcs(pitchClasses)
    const { state, match } = applyNatureHysteresis(hyst, auto, {
      holdFrames: 8,
      missHoldFrames: 16,
      pinned,
    })
    hyst = state

    const rawTones = peaksToTones(peaks, opts.a4Hz.value)
    const tones = stabilizeTones(rawTones, stickyMidi)
    stickyMidi = tones.map((t) => t.midi)

    if (!match) {
      publish(null, tones, performance.now())
      return
    }

    const nextScore = scoreChordStack(tones, {
      natureId: match.natureId,
      rootPc: match.rootPc,
      keyPc: opts.prefs.value.keyPc,
      temperament: opts.prefs.value.keyGridTemperament,
      customOffsetsCents: opts.prefs.value.customOffsetsCents,
      chordLockWindowCents: opts.prefs.value.chordLockWindowCents,
      assistedPinRequired: false,
    })
    publish(nextScore, tones, performance.now())
  }

  function publish(
    nextScore: ChordStackScore | null,
    liveTones: { hz: number; midi: number; etCents: number }[],
    now: number,
  ): void {
    const nextRows = rows.value.map((r) => ({ ...r, trace: r.trace }))
    const allowColors =
      nextScore && !nextScore.unstable && nextScore.tones.length && !nextScore.assistedPinRequired

    if (allowColors) {
      for (let i = 0; i < SLOT_COUNT; i++) {
        const tone = nextScore!.tones[i] ?? null
        const row = nextRows[i]!
        row.tone = tone
        row.hearing = tone
          ? { note: tone.note, hz: tone.hz, midi: tone.midi }
          : null
        if (tone) pushToneTrace(row.trace, tone.errorCentsVsJi, tone.midi)
      }
    } else {
      for (let i = 0; i < SLOT_COUNT; i++) {
        const live = liveTones[i]
        const row = nextRows[i]!
        row.tone = null
        if (live) {
          pushToneTrace(row.trace, live.etCents, live.midi)
          const n = noteFromHz(live.hz, opts.a4Hz.value)
          row.hearing = {
            note: n?.name ?? `${live.hz.toFixed(0)}`,
            hz: live.hz,
            midi: live.midi,
          }
        } else if (now - lastPublishMs > 650) {
          // Longer clear delay for slow held-chord dropouts.
          row.hearing = null
        }
      }
    }

    if (now - lastPublishMs < UI_MS && score.value) {
      rows.value = nextRows
      return
    }
    lastPublishMs = now
    score.value = nextScore
    rows.value = nextRows
  }

  watch(
    () => opts.enabled.value,
    (on) => {
      if (!on) reset()
    },
  )

  const glanceStatus = computed(() => score.value?.status ?? 'wait')

  return { score, rows, livePeaksHz, assisted, applyDsp, reset, glanceStatus }
}

function peaksToTones(
  peaks: { hz: number }[],
  a4Hz: number,
): { hz: number; midi: number; etCents: number }[] {
  return peaks
    .map((p) => {
      const n = noteFromHz(p.hz, a4Hz)
      if (!n) return null
      return { hz: p.hz, midi: n.midi, etCents: n.cents }
    })
    .filter((t): t is NonNullable<typeof t> => t != null)
    .sort((a, b) => a.hz - b.hz)
}

function makeEmptyRows(): ChordToneRow[] {
  return Array.from({ length: SLOT_COUNT }, (_, slot) => ({
    slot,
    tone: null,
    hearing: null,
    trace: createToneTrace(56),
  }))
}

/**
 * Stick each slot to the nearest continuing MIDI so rows don't swap every frame.
 */
function stabilizeTones(
  incoming: { hz: number; midi: number; etCents: number }[],
  sticky: number[],
): { hz: number; midi: number; etCents: number }[] {
  if (!sticky.length || !incoming.length) return incoming
  const used = new Set<number>()
  const out: { hz: number; midi: number; etCents: number }[] = []
  for (let i = 0; i < sticky.length; i++) {
    const target = sticky[i]!
    let bestJ = -1
    let best = 99
    for (let j = 0; j < incoming.length; j++) {
      if (used.has(j)) continue
      const d = Math.abs(incoming[j]!.midi - target)
      if (d < best) {
        best = d
        bestJ = j
      }
    }
    if (bestJ >= 0 && best <= 1.1) {
      used.add(bestJ)
      out.push(incoming[bestJ]!)
    }
  }
  for (let j = 0; j < incoming.length; j++) {
    if (!used.has(j)) out.push(incoming[j]!)
  }
  return out.sort((a, b) => a.hz - b.hz).slice(0, 4)
}
