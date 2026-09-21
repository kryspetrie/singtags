/**
 * Shared types and helpers for key-change / modulation suggestions.
 */
import { pcOf } from './secondaryDominant'
import type { TonalityMode } from './types'

export type TonalityModeLike = TonalityMode

export type ModulationCharacter =
  | 'abrupt'
  | 'direct'
  | 'smooth'
  | 'extended'
  /** Two styles joined mid-path (see `styleShift`). */
  | 'hybrid'

export type ModulationChord = {
  rootPc: number
  natureId: string
  /** Roman in the departure key (when meaningful). */
  romanFrom?: string
  /** Roman in the arrival key (when meaningful). */
  romanTo?: string
  role: string
}

/** Describes a mid-path change of modulation style. */
export type StyleShift = {
  from: Exclude<ModulationCharacter, 'hybrid'>
  to: Exclude<ModulationCharacter, 'hybrid'>
  /** Index into `steps` where the second style begins. */
  atStep: number
}

export type ModulationPath = {
  id: string
  fromTonality: number
  toTonality: number
  fromMode: TonalityMode
  toMode: TonalityMode
  /** Shortest signed lift in semitones (−6..+6 preferential framing). */
  intervalSemis: number
  character: ModulationCharacter
  /** Number of chords in the path (includes arrival tonic). */
  length: number
  steps: ModulationChord[]
  label: string
  reason: string
  teachingId: string
  /** Lower = try first within a character band. */
  rank: number
  /** Present when `character === 'hybrid'`. */
  styleShift?: StyleShift
  /** Stable relative recipe id (key-agnostic), e.g. `V7-I`, `I7-as-V`, `lift-up`. */
  templateId?: string
}

export type SuggestKeyChangesOpts = {
  fromTonality: number
  toTonality: number
  fromMode?: TonalityMode
  toMode?: TonalityMode
  /** Prefer upward lifts when interval could be ±equal (default true). */
  preferUp?: boolean
  /** Filter characters (default: all, including hybrid). */
  characters?: ModulationCharacter[]
  /** Inclusive length bounds (chord count). */
  minLength?: number
  maxLength?: number
  /** Include mid-style hybrid combinations (default true). */
  includeHybrids?: boolean
  limit?: number
}

export type CombineKeyChangeOpts = {
  /**
   * Drop the first path's final chord when it is the shared arrival tonic
   * (or the second path's departure tonic for multi-hop). Default true.
   */
  dropFirstArrival?: boolean
  /** Override hinge: keep first path steps `[0 .. hingeExclusive)`. */
  hingeExclusive?: number
}

const MAJOR_DIATONIC: { deg: number; nature: string; roman: string }[] = [
  { deg: 0, nature: 'major', roman: 'I' },
  { deg: 2, nature: 'minor', roman: 'ii' },
  { deg: 4, nature: 'minor', roman: 'iii' },
  { deg: 5, nature: 'major', roman: 'IV' },
  { deg: 7, nature: 'major', roman: 'V' },
  { deg: 9, nature: 'minor', roman: 'vi' },
  { deg: 11, nature: 'dim', roman: 'vii°' },
]

const MINOR_DIATONIC: { deg: number; nature: string; roman: string }[] = [
  { deg: 0, nature: 'minor', roman: 'i' },
  { deg: 2, nature: 'dim', roman: 'ii°' },
  { deg: 3, nature: 'major', roman: 'III' },
  { deg: 5, nature: 'minor', roman: 'iv' },
  { deg: 7, nature: 'major', roman: 'V' },
  { deg: 8, nature: 'major', roman: 'VI' },
  { deg: 10, nature: 'major', roman: 'VII' },
]

export function signedKeyInterval(
  from: number,
  to: number,
  preferUp = true,
): number {
  const up = pcOf(to - from)
  const down = up === 0 ? 0 : up - 12
  if (up === 0) return 0
  if (up === 6) return preferUp ? 6 : -6
  return preferUp ? (up <= 6 ? up : down) : down >= -6 ? down : up
}

export function keyLabel(tonality: number, mode: TonalityMode): string {
  const names = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']
  return `${names[pcOf(tonality)]!}${mode === 'minor' ? 'm' : ''}`
}

export function diatonicChords(tonality: number, mode: TonalityMode) {
  const table = mode === 'minor' ? MINOR_DIATONIC : MAJOR_DIATONIC
  return table.map((t) => ({
    rootPc: pcOf(tonality + t.deg),
    natureId: t.nature,
    roman: t.roman,
    deg: t.deg,
  }))
}

/** PCs that are diatonic triad roots in both keys (pivot candidates). */
export function findPivotChords(
  fromTonality: number,
  toTonality: number,
  fromMode: TonalityMode = 'major',
  toMode: TonalityMode = 'major',
): { rootPc: number; fromRoman: string; toRoman: string; natureId: string }[] {
  const a = diatonicChords(fromTonality, fromMode)
  const b = diatonicChords(toTonality, toMode)
  const out: { rootPc: number; fromRoman: string; toRoman: string; natureId: string }[] = []
  for (const x of a) {
    const y = b.find((z) => z.rootPc === x.rootPc)
    if (!y) continue
    const natureId = x.natureId === y.natureId ? x.natureId : x.natureId
    out.push({
      rootPc: x.rootPc,
      fromRoman: x.roman,
      toRoman: y.roman,
      natureId: natureId === 'dim' ? 'dim' : natureId,
    })
  }
  return out
}

export function modulationChord(
  rootPc: number,
  natureId: string,
  role: string,
  romanFrom?: string,
  romanTo?: string,
): ModulationChord {
  return { rootPc: pcOf(rootPc), natureId, role, romanFrom, romanTo }
}

export function modulationPathId(
  character: ModulationCharacter,
  kind: string,
  from: number,
  to: number,
  steps: ModulationChord[],
): string {
  const seq = steps.map((s) => `${s.natureId[0]}${s.rootPc}`).join('-')
  return `${character}:${kind}:${from}->${to}:${seq}`
}
