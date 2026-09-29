/**
 * Voice a cadence plan for Hear — same path optimizer as Sketch / Key Change.
 */
import type { VoicingPitches } from '../../domain/arranging/chords/chords'
import type {
  CadencePlanMoment,
  CadenceSuggestion,
} from '../../domain/arranging/cadences'
import { natureToSketchQuality } from '../../lib/tagRoll/harmonySketch'
import {
  optimizeSketchHearPath,
  SKETCH_HEAR_BASS_MIN,
  SKETCH_HEAR_TENOR_MAX,
  type SketchHearChordRef,
} from '../../domain/arranging/sketchHearVoicing'
import { planToSketchPatches } from './CadencePlans'

export type CadencePlanRange = {
  startTick: number
  endTick: number
}

/** Tick window covered by the plan’s applyable steps. */
export function cadencePlanReplaceRange(
  plan: CadenceSuggestion,
  moments: readonly CadencePlanMoment[],
): CadencePlanRange | null {
  const { patches } = planToSketchPatches(plan, moments)
  if (!patches.length) return null
  let startTick = Infinity
  let endTick = -Infinity
  for (const p of patches) {
    startTick = Math.min(startTick, p.startTick)
    endTick = Math.max(endTick, p.endTick)
  }
  if (!Number.isFinite(startTick) || endTick <= startTick) return null
  return { startTick, endTick }
}

/**
 * TTBB midis for each plan step (Lead-locked when melody midi is available).
 */
export function voiceCadencePlanHearPath(
  plan: CadenceSuggestion,
  moments: readonly CadencePlanMoment[],
  opts?: { tonality?: number },
): VoicingPitches[] {
  const refs: SketchHearChordRef[] = []
  for (const st of plan.steps) {
    const mi = plan.startMomentIndex + st.momentOffset
    const m = moments[mi]
    if (!m) continue
    refs.push({
      rootPc: ((st.rootPc % 12) + 12) % 12,
      quality: natureToSketchQuality(st.natureId),
      leadMidi: m.melodyMidi,
    })
  }
  if (!refs.length) return []
  const path = optimizeSketchHearPath(refs, { tonality: opts?.tonality ?? 0 })
  return path.map((p) => {
    let { bass, bari, lead, tenor } = p
    while (bass < SKETCH_HEAR_BASS_MIN - 7 && tenor + 12 <= SKETCH_HEAR_TENOR_MAX + 7) {
      bass += 12
      bari += 12
      lead += 12
      tenor += 12
    }
    while (tenor > SKETCH_HEAR_TENOR_MAX + 7 && bass - 12 >= SKETCH_HEAR_BASS_MIN - 7) {
      bass -= 12
      bari -= 12
      lead -= 12
      tenor -= 12
    }
    if (tenor <= lead) tenor = lead + 1
    if (bass > bari) bass = Math.min(bass, bari)
    return { bass, bari, lead, tenor }
  })
}
