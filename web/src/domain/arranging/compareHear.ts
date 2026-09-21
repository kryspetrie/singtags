/**
 * Compare-hear helpers: build ET vs JI audition payloads for top candidates.
 */
import { justCentsForVoicing, type VoiceCents } from './justIntonation'
import type { HarmonizeCandidate } from './harmonize/types'

export type CompareHearVoice = {
  midi: HarmonizeCandidate['midi']
  cents: VoiceCents
  label: string
}

export type CompareHearPair = {
  a: CompareHearVoice
  b: CompareHearVoice
}

const ZERO: VoiceCents = { bass: 0, bari: 0, lead: 0, tenor: 0 }

export function auditionPayload(
  c: HarmonizeCandidate,
  mode: 'equal' | 'just',
): CompareHearVoice {
  const cents =
    mode === 'just'
      ? (justCentsForVoicing({
          natureId: c.natureId,
          rootPc: c.rootPc,
          voicing: c.voicing,
          leadMidi: c.midi.lead,
        }) ?? ZERO)
      : ZERO
  return {
    midi: c.midi,
    cents,
    label: `${c.label} (${mode})`,
  }
}

/** Top two ranked candidates in equal then just (for A/B teaching). */
export function compareHearTopTwo(
  candidates: readonly HarmonizeCandidate[],
  mode: 'equal' | 'just' = 'just',
): CompareHearPair | null {
  if (candidates.length < 2) return null
  const a = candidates[0]!
  const b = candidates[1]!
  return {
    a: auditionPayload(a, mode),
    b: auditionPayload(b, mode),
  }
}

export function compareEqualVsJust(c: HarmonizeCandidate): CompareHearPair {
  return {
    a: auditionPayload(c, 'equal'),
    b: auditionPayload(c, 'just'),
  }
}
