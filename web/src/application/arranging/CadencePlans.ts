/**
 * Cadence plan façade — suggest + Sketch patch DTOs (Phase C2).
 */
import {
  suggestCadencesForPhrase,
  type CadenceSuggestion,
  type SuggestCadencesForPhraseOpts,
  type CadencePlanMoment,
  type CadencePlanSketchSpan,
} from '../../domain/arranging/cadences'

export type CadenceSketchPatch = {
  startTick: number
  endTick: number
  rootPc: number
  quality: string
  source: 'coach'
  locked: boolean
  pillar: boolean
  /** Plan step label for UI (V7, I, …). */
  label: string
  momentOffset: number
}

export type CadencePlanApplyResult = {
  patches: CadenceSketchPatch[]
  skipped: string[]
}

const QUALITIES = new Set([
  'major',
  'seventh',
  'minor',
  'm7',
  'half-dim',
  'dim7',
  'dim',
  'aug',
  'ninth',
  'sixth',
  'maj7',
  'add9',
  'madd6',
])

function natureToQuality(natureId: string): string {
  if (QUALITIES.has(natureId)) return natureId
  return 'major'
}

function spanCovers(span: CadencePlanSketchSpan, tick: number): boolean {
  return tick >= span.startTick && tick < span.endTick
}

export function listCadencePlans(opts: SuggestCadencesForPhraseOpts): CadenceSuggestion[] {
  return suggestCadencesForPhrase(opts)
}

/**
 * Map one plan onto moment tick windows as Sketch patches.
 * Locked conflicting spans are skipped (never overwritten here).
 */
export function planToSketchPatches(
  plan: CadenceSuggestion,
  moments: readonly CadencePlanMoment[],
  sketchSpans?: readonly CadencePlanSketchSpan[],
): CadencePlanApplyResult {
  const patches: CadenceSketchPatch[] = []
  const skipped: string[] = []

  for (const st of plan.steps) {
    const mi = plan.startMomentIndex + st.momentOffset
    const m = moments[mi]
    if (!m) {
      skipped.push(`Missing moment for ${st.label} (+${st.momentOffset})`)
      continue
    }
    const existing = sketchSpans?.find((s) => spanCovers(s, m.startTick))
    if (existing?.locked) {
      const sameRoot = ((existing.rootPc % 12) + 12) % 12 === ((st.rootPc % 12) + 12) % 12
      if (!sameRoot) {
        skipped.push(`Locked Sketch blocks ${st.label} at tick ${m.startTick}`)
        continue
      }
    }
    patches.push({
      startTick: m.startTick,
      endTick: Math.max(m.startTick + 1, m.endTick),
      rootPc: ((st.rootPc % 12) + 12) % 12,
      quality: natureToQuality(st.natureId),
      source: 'coach',
      locked: true,
      pillar: st.role === 'arrival',
      label: st.label,
      momentOffset: st.momentOffset,
    })
  }

  return { patches, skipped }
}

/** Patches for a single plan step (Apply next). */
export function planStepToSketchPatch(
  plan: CadenceSuggestion,
  stepIndex: number,
  moments: readonly CadencePlanMoment[],
  sketchSpans?: readonly CadencePlanSketchSpan[],
): CadencePlanApplyResult {
  const step = plan.steps[stepIndex]
  if (!step) return { patches: [], skipped: ['Unknown step index'] }
  const one: CadenceSuggestion = { ...plan, steps: [step] }
  return planToSketchPatches(one, moments, sketchSpans)
}
