import { describe, expect, it } from 'vitest'
import {
  isKeyOnStaff,
  pickRestKey,
  pickRestPlacement,
  REST_X_NUDGE_PX,
  restKeyCandidates,
  vexKeyToDegree,
} from './restPlacement'

describe('restPlacement', () => {
  it('parses vex keys to diatonic degrees', () => {
    expect(vexKeyToDegree('c/4')).toBe(vexKeyToDegree('C/4'))
    expect(vexKeyToDegree('e/5')).toBeGreaterThan(vexKeyToDegree('g/4'))
  })

  it('prefers high vs low defaults by voice', () => {
    expect(restKeyCandidates('treble', true)[0]).toBe('e/5')
    expect(restKeyCandidates('treble', false)[0]).toBe('g/4')
    expect(restKeyCandidates('treble', true, 'whole')[0]).toBe('d/5')
    expect(restKeyCandidates('treble', true, 'half')[0]).toBe('b/4')
  })

  it('shifts a voice-1 rest when default collides', () => {
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
    expect(vexKeyToDegree(key)).toBeGreaterThan(defaultDeg)
  })

  it('keeps tenor rests above lead notes (Mill Stream style)', () => {
    // Lead concert 60/64/67 → written C5/E5/G5 on TTBB upper.
    const occupied = ['c/5', 'e/5', 'g/5'].map((k) => ({
      startTick: 0,
      durationTicks: 1440,
      degree: vexKeyToDegree(k),
    }))
    // Nearby tenor at C6 (concert 72 written).
    const preferDegree = vexKeyToDegree('c/6')
    for (const kind of ['whole', 'half', 'other'] as const) {
      const place = pickRestPlacement({
        clef: 'treble',
        stemUp: true,
        startTick: 0,
        durationTicks: 1440,
        occupants: occupied,
        durationKind: kind,
        preferDegree,
      })
      expect(vexKeyToDegree(place.key), kind).toBeGreaterThan(vexKeyToDegree('g/5'))
      expect(vexKeyToDegree(place.key), kind).toBeGreaterThanOrEqual(preferDegree - 1)
    }
  })

  it('does not drop stem-up rests below a mid-staff other voice', () => {
    const occupied = [
      { startTick: 0, durationTicks: 480, degree: vexKeyToDegree('c/5') },
      { startTick: 0, durationTicks: 480, degree: vexKeyToDegree('e/5') },
    ]
    const key = pickRestKey({
      clef: 'treble',
      stemUp: true,
      startTick: 0,
      durationTicks: 480,
      occupants: occupied,
      durationKind: 'other',
    })
    expect(vexKeyToDegree(key)).toBeGreaterThan(vexKeyToDegree('e/5'))
  })

  it('allows short rests to drop below the staff when lower lines are full', () => {
    const occupied = restKeyCandidates('treble', false, 'other')
      .filter((k) => isKeyOnStaff('treble', k))
      .map((k) => ({
        startTick: 0,
        durationTicks: 480,
        degree: vexKeyToDegree(k),
      }))
    const key = pickRestKey({
      clef: 'treble',
      stemUp: false,
      startTick: 0,
      durationTicks: 480,
      occupants: occupied,
      durationKind: 'other',
    })
    expect(isKeyOnStaff('treble', key)).toBe(false)
    expect(vexKeyToDegree(key)).toBeLessThan(vexKeyToDegree('e/4'))
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

  it('nudges stem-up rests left when a note shares the column', () => {
    const place = pickRestPlacement({
      clef: 'treble',
      stemUp: true,
      startTick: 0,
      durationTicks: 480,
      occupants: [{ startTick: 0, durationTicks: 480, degree: vexKeyToDegree('e/5') }],
      durationKind: 'other',
    })
    expect(place.xShift).toBe(-REST_X_NUDGE_PX)
  })

  it('does not nudge when the staff column is clear', () => {
    const place = pickRestPlacement({
      clef: 'treble',
      stemUp: true,
      startTick: 0,
      durationTicks: 480,
      occupants: [],
      durationKind: 'whole',
    })
    expect(place.xShift).toBe(0)
  })
})
