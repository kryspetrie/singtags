import type { VoicingPitches } from '../chords'
import type { RuleTag } from '../types'

export type HarmonizeCandidate = {
  rootPc: number
  natureId: string
  voicing: string
  spread: boolean
  layer: 'primary' | 'passing'
  scfGroup: number | null
  midi: VoicingPitches
  score: number
  ruleTags: RuleTag[]
  label: string
  /** Raw harmonicity contribution (0..1-ish) before weight; optional until scored. */
  harmonicity?: number
}

export type UnscoredCandidate = Omit<HarmonizeCandidate, 'score' | 'harmonicity'> & {
  /** Motion score component before other weights. */
  motionScore: number
  towardPillar: boolean
  nextPillarRoot: number | null
  /** Previous stack MIDI for voice-leading distance (optional). */
  prevMidi?: VoicingPitches | null
  /** Previous root for motion / Szabo dim5-down soft bonus. */
  prevRootPc?: number | null
  /** Previous dominant stack for resolution scoring (optional). */
  prevDominant?: { rootPc: number; natureId: string; midi: VoicingPitches } | null
}
