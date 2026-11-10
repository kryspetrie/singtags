import { describe, expect, it } from 'vitest'
import { BARBERSHOP_CHORDS } from '../arranging/chords'
import {
  centsVsChordLockRole,
  harm7CentsVsEt,
  isInTuneChordLock,
  roleCents,
} from './chordLock'

describe('chordLock', () => {
  it('exposes barbershop harm7 ≈ −31¢ vs ET', () => {
    expect(harm7CentsVsEt()).toBeCloseTo(-31.17, 0)
  })

  it('seventh nature uses harm7 for role 7', () => {
    const seventh = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')
    expect(seventh).toBeTruthy()
    expect(roleCents(seventh!, 7)).toBeCloseTo(harm7CentsVsEt(), 5)
  })

  it('computes error vs JI role target', () => {
    const major = BARBERSHOP_CHORDS.find((c) => c.id === 'major')!
    // Singer at ET M3 (0¢) vs JI M3 (~−14¢) → ~+14¢ sharp of lock
    const err = centsVsChordLockRole(0, major, 3)
    expect(err).toBeCloseTo(-roleCents(major, 3), 5)
    expect(err).toBeCloseTo(13.7, 0)
  })

  it('gates chord-lock green window', () => {
    expect(isInTuneChordLock(4, 5)).toBe(true)
    expect(isInTuneChordLock(-6, 5)).toBe(false)
  })
})
