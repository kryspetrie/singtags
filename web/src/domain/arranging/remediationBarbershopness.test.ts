import { describe, expect, it } from 'vitest'
import { assessBarbershopness } from './barbershopness'
import { createEmptyArrangement } from './types'
import { BARBERSHOP_CHORDS, placeVoicing } from './chords'
import { assessHowBarbershop } from '../../application/arranging/DocumentOps'

function stackBs7(opts: {
  id: string
  tick: number
  rootPc: number
  leadMidi: number
  voicing?: string
}): ReturnType<typeof createEmptyArrangement>['stacks'][number] {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!
  const voicing = opts.voicing ?? '1735'
  const midi = placeVoicing({
    chord,
    rootPc: opts.rootPc,
    leadMidi: opts.leadMidi,
    voicing,
    spread: false,
  })!
  return {
    id: opts.id,
    startTick: opts.tick,
    durationTicks: 480,
    rootPc: opts.rootPc,
    natureId: 'seventh',
    voicing,
    spread: false,
    layer: 'primary',
    scfGroup: null,
    pillarId: 'p1',
    midi,
    ruleTags: ['R1_p5'],
  }
}

describe('remediation: how barbershop is this', () => {
  it('scores a BS7 highway high', () => {
    const project = createEmptyArrangement('highway')
    project.tonality = 0
    project.contestProfile = 'sai11'
    project.pillars = [
      {
        id: 'p1',
        rootPc: 0,
        startTick: 0,
        endTick: 1920,
        source: 'user',
        confirmed: true,
      },
      {
        id: 'p2',
        rootPc: 5,
        startTick: 1920,
        endTick: 3840,
        source: 'user',
        confirmed: true,
      },
    ]
    // Circle: D7 → G7 → C7 → F7 with leads on 3rds
    // D7 3rd=F#66, G7 3rd=B71, C7 3rd=E64, F7 3rd=A69
    project.stacks = [
      stackBs7({ id: 's0', tick: 0, rootPc: 2, leadMidi: 66 }),
      stackBs7({ id: 's1', tick: 480, rootPc: 7, leadMidi: 71 }),
      stackBs7({ id: 's2', tick: 960, rootPc: 0, leadMidi: 64 }),
      stackBs7({ id: 's3', tick: 1440, rootPc: 5, leadMidi: 69 }),
    ]
    project.melody = project.stacks.map((s, i) => ({
      id: `m${i}`,
      midi: s.midi!.lead,
      startTick: s.startTick,
      durationTicks: 480,
      role: 'pmn' as const,
    }))
    const report = assessBarbershopness(project)
    expect(report.scoredStackCount).toBe(4)
    expect(report.score).toBeGreaterThanOrEqual(70)
    expect(report.summary.toLowerCase()).toMatch(/barbershop|contest|strong/)
  })

  it('scores thin / illegal stacks lower', () => {
    const project = createEmptyArrangement('weak')
    project.contestProfile = 'sai11'
    project.stacks = [
      {
        id: 's0',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'half-dim', // illegal on sai11
        voicing: '153b7',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { bass: 48, bari: 55, lead: 60, tenor: 63 },
        ruleTags: [],
      },
      {
        id: 's1',
        startTick: 480,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'aug',
        voicing: '1531',
        spread: true,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { bass: 60, bari: 64, lead: 68, tenor: 72 }, // broken TTBB? tenor>lead ok, bass=lead bad-ish
        ruleTags: [],
      },
    ]
    const report = assessBarbershopness(project)
    expect(report.score).toBeLessThan(70)
  })

  it('skips stacks with fewer than 3 parts', () => {
    const project = createEmptyArrangement('thin')
    project.stacks = [
      {
        id: 's0',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1531',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: null,
        ruleTags: [],
      },
    ]
    const report = assessBarbershopness(project)
    expect(report.scoredStackCount).toBe(0)
    expect(report.skippedThin).toBe(1)
    expect(report.score).toBe(0)
  })

  it('application assessHowBarbershop mirrors domain', () => {
    const project = createEmptyArrangement('app')
    project.stacks = [
      stackBs7({ id: 's0', tick: 0, rootPc: 0, leadMidi: 64 }),
    ]
    expect(assessHowBarbershop(project).score).toBe(assessBarbershopness(project).score)
  })
})
