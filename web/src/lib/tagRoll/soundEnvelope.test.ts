import { describe, expect, it } from 'vitest'
import {
  normalizeSoundEnvelope,
  releaseSecForNoteEnd,
  TAG_ROLL_ATTACK_SEC_MAX,
  TAG_ROLL_DECAY_SEC_MAX,
  TAG_ROLL_DEFAULT_SOUND_ENVELOPE,
  TAG_ROLL_PHRASE_DECAY_SEC_MAX,
} from './soundEnvelope'

describe('soundEnvelope', () => {
  it('defaults and clamps', () => {
    expect(normalizeSoundEnvelope(undefined)).toEqual(TAG_ROLL_DEFAULT_SOUND_ENVELOPE)
    expect(normalizeSoundEnvelope({ attackSec: 99, decaySec: 0 }).attackSec).toBe(
      TAG_ROLL_ATTACK_SEC_MAX,
    )
    expect(
      normalizeSoundEnvelope({ attackSec: 0.05, decaySec: 0.5, phraseDecaySec: 0.5 }).decaySec,
    ).toBe(TAG_ROLL_DECAY_SEC_MAX)
    expect(
      normalizeSoundEnvelope({ attackSec: 0.05, decaySec: 0.05, phraseDecaySec: 9 }).phraseDecaySec,
    ).toBe(TAG_ROLL_PHRASE_DECAY_SEC_MAX)
  })

  it('migrates legacy single decay into phrase decay', () => {
    const env = normalizeSoundEnvelope({ attackSec: 0.05, decaySec: 0.4 })
    expect(env.decaySec).toBe(TAG_ROLL_DEFAULT_SOUND_ENVELOPE.decaySec)
    expect(env.phraseDecaySec).toBe(0.4)
  })

  it('picks release by phrase-end flag', () => {
    const env = { attackSec: 0.05, decaySec: 0.08, phraseDecaySec: 0.6 }
    expect(releaseSecForNoteEnd(env, false)).toBe(0.08)
    expect(releaseSecForNoteEnd(env, true)).toBe(0.6)
  })
})
