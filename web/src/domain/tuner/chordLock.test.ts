import { describe, expect, it } from 'vitest'
import { BARBERSHOP_CHORDS } from '../arranging/chords'
import {
  centsVsChordLockRole,
  chordRoleForPc,
  harm7CentsVsEt,
  roleCents,
} from './chordLock'

describe('chordLock', () => {
  const major = BARBERSHOP_CHORDS.find((c) => c.id === 'major')!
  const seventh = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!

  it('seventh nature uses harm7 for role 7', () => {
    expect(seventh).toBeTruthy()
    expect(roleCents(seventh!, 7)).toBeCloseTo(harm7CentsVsEt(), 5)
  })

  it('computes error vs JI role target', () => {
    const err = centsVsChordLockRole(0, major, 3)
    expect(err).toBeCloseTo(-roleCents(major, 3), 5)
  })

  it('maps sung PC to nearest nature role', () => {
    expect(chordRoleForPc(0, 0, seventh)).toBe(1) // C
    expect(chordRoleForPc(4, 0, seventh)).toBe(3) // E
    expect(chordRoleForPc(7, 0, seventh)).toBe(5) // G
    expect(chordRoleForPc(10, 0, seventh)).toBe(7) // Bb
  })

  it('returns null when PC is far from nature tones', () => {
    expect(chordRoleForPc(2, 0, seventh)).toBeNull() // D
  })
})
