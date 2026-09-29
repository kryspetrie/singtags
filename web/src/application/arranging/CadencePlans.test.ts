import { describe, expect, it } from 'vitest'
import { listCadencePlans, planToSketchPatches, planStepToSketchPatch } from './CadencePlans'

const PPQ = 480

function moments(midis: number[]) {
  return midis.map((melodyMidi, i) => ({
    startTick: i * PPQ,
    endTick: (i + 1) * PPQ,
    melodyMidi,
  }))
}

describe('CadencePlans', () => {
  it('planToSketchPatches maps V7→I onto moment ticks', () => {
    const ms = moments([67, 60])
    const plans = listCadencePlans({
      moments: ms,
      tonality: 0,
      phraseRoles: ['open', 'cadence'],
    })
    const auth = plans.find((p) => p.cadenceId === 'auth_v7_i')!
    expect(auth).toBeTruthy()
    const { patches, skipped } = planToSketchPatches(auth, ms)
    expect(skipped).toEqual([])
    expect(patches).toHaveLength(2)
    expect(patches[0]).toMatchObject({
      startTick: 0,
      endTick: PPQ,
      rootPc: 7,
      quality: 'seventh',
      label: 'V7',
    })
    expect(patches[1]).toMatchObject({
      startTick: PPQ,
      rootPc: 0,
      quality: 'major',
      label: 'I',
      pillar: true,
    })
  })

  it('skips locked conflicting Sketch', () => {
    const ms = moments([67, 60])
    const plans = listCadencePlans({
      moments: ms,
      tonality: 0,
      phraseRoles: ['open', 'cadence'],
    })
    const auth = plans.find((p) => p.cadenceId === 'auth_v7_i')!
    const { patches, skipped } = planToSketchPatches(auth, ms, [
      { startTick: 0, endTick: PPQ, rootPc: 0, natureId: 'major', locked: true },
    ])
    expect(skipped.some((s) => /Locked Sketch/i.test(s))).toBe(true)
    expect(patches.every((p) => p.label !== 'V7')).toBe(true)
    expect(patches.some((p) => p.label === 'I')).toBe(true)
  })

  it('planStepToSketchPatch applies one step', () => {
    const ms = moments([67, 60])
    const plans = listCadencePlans({
      moments: ms,
      tonality: 0,
      phraseRoles: ['open', 'cadence'],
    })
    const auth = plans.find((p) => p.cadenceId === 'auth_v7_i')!
    const { patches } = planStepToSketchPatch(auth, 0, ms)
    expect(patches).toHaveLength(1)
    expect(patches[0]!.label).toBe('V7')
  })
})
