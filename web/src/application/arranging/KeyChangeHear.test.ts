/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { voiceModulationHearPath } from './KeyChangeHear'
import type { PackedModulationStep } from '../../domain/arranging/keyChangePack'
import { placeVoicing, BARBERSHOP_CHORDS } from '../../domain/arranging/chords/chords'
import {
  SKETCH_HEAR_BASS_MIN,
  SKETCH_HEAR_TENOR_MAX,
} from '../../domain/arranging/sketchHearVoicing'

function packed(
  steps: { rootPc: number; natureId: string }[],
  start = 0,
  width = 480,
): PackedModulationStep[] {
  return steps.map((s, i) => ({
    startTick: start + i * width,
    endTick: start + (i + 1) * width,
    rootPc: s.rootPc,
    natureId: s.natureId,
    role: 'step',
    stepIndex: i,
  }))
}

/** Naive per-chord placeVoicing (old Hear path behavior). */
function coldPlace(steps: PackedModulationStep[]) {
  return steps.map((step) => {
    const nature = BARBERSHOP_CHORDS.find((c) => c.id === step.natureId) ?? BARBERSHOP_CHORDS[0]!
    const leadMidi = 60 + ((step.rootPc % 12) + 12) % 12
    return (
      placeVoicing({
        chord: nature,
        rootPc: step.rootPc,
        leadMidi,
        voicing: nature.id === 'seventh' ? '1357' : '1351',
        spread: false,
      }) ?? { bass: 48, bari: 52, lead: 60, tenor: 67 }
    )
  })
}

function harmonyMotion(seq: { bass: number; bari: number; tenor: number }[]): number {
  let m = 0
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1]!
    const b = seq[i]!
    m += Math.abs(b.bass - a.bass) + Math.abs(b.bari - a.bari) + Math.abs(b.tenor - a.tenor)
  }
  return m
}

describe('voiceModulationHearPath', () => {
  const circleHome = packed([
    { rootPc: 0, natureId: 'major' },
    { rootPc: 2, natureId: 'seventh' },
    { rootPc: 7, natureId: 'seventh' },
    { rootPc: 0, natureId: 'major' },
  ])

  it('returns one TTBB stack per step in men’s range', () => {
    const path = voiceModulationHearPath(circleHome, { tonality: 0 })
    expect(path).toHaveLength(4)
    for (const v of path) {
      expect(v.tenor).toBeGreaterThan(v.lead)
      expect(v.bass).toBeLessThanOrEqual(Math.min(v.bari, v.lead))
      expect(v.bass).toBeGreaterThanOrEqual(SKETCH_HEAR_BASS_MIN - 7)
      expect(v.tenor).toBeLessThanOrEqual(SKETCH_HEAR_TENOR_MAX + 7)
    }
  })

  it('opens I with bass on root or fifth when tonality is C', () => {
    const path = voiceModulationHearPath(circleHome, { tonality: 0 })
    const bassPc = ((path[0]!.bass % 12) + 12) % 12
    expect([0, 7]).toContain(bassPc)
  })

  it('moves harmony parts less than independent cold placeVoicing', () => {
    const path = voiceModulationHearPath(circleHome, { tonality: 0 })
    const cold = coldPlace(circleHome)
    expect(harmonyMotion(path)).toBeLessThanOrEqual(harmonyMotion(cold))
  })

  it('latches melody lead when a note falls in the step window', () => {
    const path = voiceModulationHearPath(circleHome, {
      tonality: 0,
      melodyNotes: [
        { startTick: 0, endTick: 480, midi: 64 }, // E4 on first chord
        { startTick: 1440, endTick: 1920, midi: 60 },
      ],
    })
    expect(path[0]!.lead).toBe(64)
  })
})
