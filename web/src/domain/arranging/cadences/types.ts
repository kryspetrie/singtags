/**
 * Shared cadence context for Detected suggestions and Coach ranking/teaching.
 */
import type { TonalityMode } from '../types'

export type PhraseRole = 'open' | 'mid' | 'cadence' | 'tag'

export type CadenceBias = 'strong' | 'moderate' | 'off'

export type CadenceId =
  | 'auth_v7_i'
  | 'lead_tone_v7'
  | 'circle_ii_v_i'
  | 'primary_dom7'
  | 'circle_frag'
  | 'plagal_iv_i'
  | 'tag_penult'
  | 'half_cad'
  | 'light_bII'
  | 'backdoor'

/** 1 = core textbook, 2 = common, 3 = optional color (never Detected default). */
export type CadencePriority = 1 | 2 | 3

export type LockedNeighbor = { rootPc: number; natureId: string }

export type CadenceContext = {
  tonality: number
  mode: TonalityMode
  melodyMidi: number
  nextMelodyMidi?: number | null
  prevMelodyMidi?: number | null
  prevRootPc?: number | null
  prevNatureId?: string | null
  nextPillarRoot?: number | null
  pillarRoot?: number | null
  phraseRole?: PhraseRole
  lockedNeighbors?: {
    before?: LockedNeighbor | null
    after?: LockedNeighbor | null
  }
}

export type CadenceCandidate = {
  rootPc: number
  natureId: string
  layer?: 'primary' | 'passing'
}

export type CadenceMatch = {
  hit: boolean
  /** 0..1 how strongly the context matches this pattern. */
  strength: number
}

export type CadenceHint = {
  id: CadenceId
  label: string
  teach: string
  glossaryIds: readonly string[]
  priority: CadencePriority
}

export type CadenceDef = {
  id: CadenceId
  label: string
  shortTeach: string
  glossaryIds: readonly string[]
  priority: CadencePriority
  matchContext(ctx: CadenceContext): CadenceMatch
  boostCandidate(cand: CadenceCandidate, ctx: CadenceContext): number
  teachWhy(ctx: CadenceContext): string
}
