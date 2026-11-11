import { describe, expect, it } from 'vitest'
import { roleCents } from './chordLock'
import { BARBERSHOP_CHORDS } from '../arranging/chords'
import { scoreChordStack } from './chordStack'

describe('chordStack scoring', () => {
  const seventh = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!

  it('marks Locked when tones sit on JI roles (no key shift)', () => {
    const tones = [1, 3, 5, 7].map((role, i) => ({
      hz: 100 + i,
      midi: 48 + (seventh.offsets[role as 1 | 3 | 5 | 7] ?? 0),
      etCents: roleCents(seventh, role as 1 | 3 | 5 | 7),
    }))
    const score = scoreChordStack(tones, {
      natureId: 'seventh',
      rootPc: 0,
      keyPc: 0,
    })
    expect(score.status).toBe('locked')
    expect(score.selfLocked).toBe(true)
    expect(score.keyCentered).toBe(true)
    expect(score.tones).toHaveLength(4)
  })

  it('marks Shifted when the whole chord is displaced vs key', () => {
    const shift = 18
    const tones = [1, 3, 5, 7].map((role, i) => ({
      hz: 100 + i,
      midi: 48 + (seventh.offsets[role as 1 | 3 | 5 | 7] ?? 0),
      etCents: roleCents(seventh, role as 1 | 3 | 5 | 7) + shift,
    }))
    const score = scoreChordStack(tones, {
      natureId: 'seventh',
      rootPc: 0,
      keyPc: 0,
    })
    expect(score.status).toBe('shifted')
    expect(score.selfLocked).toBe(true)
    expect(score.keyCentered).toBe(false)
    expect(score.commonShiftCents).toBeCloseTo(shift, 5)
  })

  it('marks Fix when one voice is off the JI lock', () => {
    const tones = [1, 3, 5, 7].map((role, i) => ({
      hz: 100 + i,
      midi: 48 + (seventh.offsets[role as 1 | 3 | 5 | 7] ?? 0),
      etCents:
        roleCents(seventh, role as 1 | 3 | 5 | 7) + (role === 7 ? 20 : 0),
    }))
    const score = scoreChordStack(tones, {
      natureId: 'seventh',
      rootPc: 0,
      keyPc: 0,
    })
    expect(score.status).toBe('fix')
    expect(score.selfLocked).toBe(false)
  })
})
