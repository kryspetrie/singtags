import { describe, expect, it } from 'vitest'
import {
  isKeyOnStaff,
  pickRestKey,
  restKeyCandidates,
  vexKeyToDegree,
} from './restPlacement'

describe('restPlacement', () => {
  it('parses vex keys to diatonic degrees', () => {
    expect(vexKeyToDegree('c/4')).toBe(vexKeyToDegree('C/4'))
    expect(vexKeyToDegree('e/5')).toBeGreaterThan(vexKeyToDegree('g/4'))
  })

  it('keeps all candidates on the staff', () => {
    for (const clef of ['treble', 'bass'] as const) {
      for (const up of [true, false]) {
        for (const kind of ['whole', 'half', 'other'] as const) {
          for (const key of restKeyCandidates(clef, up, kind)) {
            expect(isKeyOnStaff(clef, key), `${clef} ${kind} ${key}`).toBe(true)
          }
        }
      }
    }
  })

  it('prefers high vs low defaults by voice', () => {
    expect(restKeyCandidates('treble', true)[0]).toBe('e/5')
    expect(restKeyCandidates('treble', false)[0]).toBe('g/4')
    expect(restKeyCandidates('treble', true, 'whole')[0]).toBe('d/5')
    expect(restKeyCandidates('treble', true, 'half')[0]).toBe('b/4')
  })

  it('shifts a voice-1 rest within the staff when default collides', () => {
    const defaultKey = restKeyCandidates('treble', true)[0]!
    const defaultDeg = vexKeyToDegree(defaultKey)
    const key = pickRestKey({
      clef: 'treble',
      stemUp: true,
      startTick: 0,
      durationTicks: 480,
      occupants: [{ startTick: 0, durationTicks: 480, degree: defaultDeg }],
    })
    expect(key).not.toBe(defaultKey)
    expect(isKeyOnStaff('treble', key)).toBe(true)
  })

  it('never places whole rests above the staff to dodge collisions', () => {
    // Occupy every in-staff degree so we still pick an on-staff fallback.
    const occupied = restKeyCandidates('treble', true, 'whole').map((k) => ({
      startTick: 0,
      durationTicks: 480,
      degree: vexKeyToDegree(k),
    }))
    const key = pickRestKey({
      clef: 'treble',
      stemUp: true,
      startTick: 0,
      durationTicks: 1920,
      occupants: occupied,
      durationKind: 'whole',
    })
    expect(isKeyOnStaff('treble', key)).toBe(true)
    expect(vexKeyToDegree(key)).toBeLessThanOrEqual(vexKeyToDegree('f/5'))
  })

  it('keeps default when nothing overlaps in time', () => {
    const key = pickRestKey({
      clef: 'treble',
      stemUp: true,
      startTick: 0,
      durationTicks: 480,
      occupants: [{ startTick: 1000, durationTicks: 480, degree: vexKeyToDegree('e/5') }],
    })
    expect(key).toBe('e/5')
  })
})
