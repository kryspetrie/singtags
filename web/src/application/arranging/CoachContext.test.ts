import { describe, expect, it } from 'vitest'
import { buildHarmonicMoments } from '../../domain/arranging/harmonicMoments'
import { createEmptyArrangement, type MelodyEvent } from '../../domain/arranging/types'
import { contextForSelectedMoment } from './CoachContext'

const mel = (id: string, start: number, dur: number, midi = 67): MelodyEvent => ({
  id,
  midi,
  startTick: start,
  durationTicks: dur,
  role: 'pmn',
})

describe('contextForSelectedMoment', () => {
  it('returns gap DTO with CTAs when no stack', () => {
    const p = createEmptyArrangement('Ctx')
    p.melody = [mel('post', 0, 960)]
    p.pillars = [
      {
        id: 'pil1',
        startTick: 0,
        endTick: 960,
        rootPc: 0,
        confirmed: true,
        source: 'user',
        reason: 'home',
      },
    ]
    const moment = buildHarmonicMoments(p.melody, [
      { startTick: 0, durationTicks: 480, midi: 48 },
      { startTick: 480, durationTicks: 480, midi: 50 },
    ])[1]!
    const dto = contextForSelectedMoment(p, moment, [
      {
        rootPc: 7,
        natureId: 'seventh',
        voicing: '1513',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        midi: { bass: 50, bari: 55, lead: 67, tenor: 74 },
        score: 1,
        ruleTags: [],
        label: 'G7',
      },
    ])
    expect(dto.kind).toBe('gap')
    expect(dto.heldLead).toBe(true)
    expect(dto.bestAltHint).toMatch(/G7 · 1513/)
    expect(dto.narrative).toMatch(/No chord yet/)
  })

  it('returns stack DTO with voicing, roman, post badge fields', () => {
    const p = createEmptyArrangement('Ctx')
    p.melody = [mel('post', 0, 960)]
    p.pillars = [
      {
        id: 'pil1',
        startTick: 0,
        endTick: 960,
        rootPc: 0,
        confirmed: true,
        source: 'user',
        reason: 'home',
      },
    ]
    p.stacks = [
      {
        id: 's1',
        startTick: 480,
        durationTicks: 480,
        rootPc: 7,
        natureId: 'seventh',
        voicing: '1513',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'pil1',
        midi: { bass: 50, bari: 55, lead: 67, tenor: 74 },
        ruleTags: [],
      },
    ]
    const moment = buildHarmonicMoments(p.melody, [
      { startTick: 0, durationTicks: 480, midi: 48 },
      { startTick: 480, durationTicks: 480, midi: 50 },
    ])[1]!
    const dto = contextForSelectedMoment(p, moment, [])
    expect(dto.kind).toBe('stack')
    expect(dto.title).toBe('G7 · 1513')
    expect(dto.voicing).toBe('1513')
    expect(dto.voicingLegend).toBe('bass→tenor')
    expect(dto.heldLead).toBe(true)
    expect(dto.roman).toBeTruthy()
    expect(dto.functionLabel).toBeTruthy()
  })
})
