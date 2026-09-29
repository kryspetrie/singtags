/**
 * Multi-moment cadence plan DTOs (Coach Cadence plans / Phase C1).
 */
import type { CadenceBias, CadenceId, CadencePriority, PhraseRole } from './types'
import type { TonalityMode } from '../types'

export type CadencePlanMoment = {
  startTick: number
  endTick: number
  melodyMidi: number
}

export type CadencePlanSketchSpan = {
  startTick: number
  endTick: number
  rootPc: number
  /** Sketch quality or stack natureId. */
  natureId: string
  locked?: boolean
}

export type CadencePlanPillar = {
  startTick: number
  rootPc: number
}

export type CadencePlanStep = {
  /** 0 = plan start moment; +n = later moments in the phrase window. */
  momentOffset: number
  rootPc: number
  natureId: string
  /** Display roman / label (arrival-key relative), e.g. V7, I, II7. */
  label: string
  role: 'approach' | 'arrival' | 'pivot' | 'color'
}

export type CadenceSuggestion = {
  id: string
  cadenceId: CadenceId
  label: string
  teach: string
  glossaryIds: readonly string[]
  strength: number
  priority: CadencePriority
  startMomentIndex: number
  steps: CadencePlanStep[]
  /** Locked Sketch mismatches or missing next moments. */
  conflicts: string[]
  evidence: string
}

export type SuggestCadencesForPhraseOpts = {
  moments: readonly CadencePlanMoment[]
  tonality: number
  mode?: TonalityMode
  sketchSpans?: readonly CadencePlanSketchSpan[]
  pillars?: readonly CadencePlanPillar[]
  bias?: CadenceBias
  phraseRoles?: readonly (PhraseRole | undefined)[]
  fromIndex?: number
  limit?: number
}
