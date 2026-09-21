/**
 * Chord suggestion DTO shared by autocomplete + completion.
 */
import type { VoicingPitches } from './chords'
import type { FunctionTag } from './tensionRelease'

export type TheoryFactor = {
  id: string
  label: string
  value: number
  teachingId?: string
}

export type ChordSuggestion = {
  rootPc: number
  natureId: string
  voicing: string
  spread: boolean
  midi: VoicingPitches
  score: number
  roman?: string
  functionTag?: FunctionTag
  factors: TheoryFactor[]
  why: string
  /** Optional chips: secondary_dom | counterpart | relative | scf */
  chip?: string
}
