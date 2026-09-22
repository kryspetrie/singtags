import { describe, expect, it } from 'vitest'
import {
  easeInOutCosine,
  deferOverlappingOnsets,
  findOverlappingPredecessor,
  frequencyEaseInOutCurve,
  hasImmediateFollower,
  listPortamentoLinks,
  overlapWindow,
  partVoiceKey,
  shouldDecayOnNoteEnd,
} from './portamento'

describe('portamento', () => {
  it('ease-in-out is slow at ends', () => {
    expect(easeInOutCosine(0)).toBeCloseTo(0)
    expect(easeInOutCosine(1)).toBeCloseTo(1)
    expect(easeInOutCosine(0.5)).toBeCloseTo(0.5)
    // First quarter moves less than linear 0.25
    expect(easeInOutCosine(0.25)).toBeLessThan(0.25)
    expect(easeInOutCosine(0.75)).toBeGreaterThan(0.75)
  })

  it('builds a monotonic frequency curve', () => {
    const c = frequencyEaseInOutCurve(220, 440, 8)
    expect(c[0]).toBeCloseTo(220, 5)
    expect(c[c.length - 1]).toBeCloseTo(440, 5)
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThan(c[i - 1]!)
  })

  it('finds overlapping predecessor on the same part', () => {
    const a = { id: 'a', partId: 'p', midi: 60, startTick: 0, durationTicks: 480 }
    const b = { id: 'b', partId: 'p', midi: 64, startTick: 240, durationTicks: 480 }
    const other = { id: 'c', partId: 'q', midi: 67, startTick: 0, durationTicks: 960 }
    expect(findOverlappingPredecessor([a, b, other], b)?.id).toBe('a')
    expect(findOverlappingPredecessor([a, b], a)).toBeNull()
  })

  it('computes overlap window', () => {
    expect(overlapWindow({ startTick: 0, durationTicks: 100 }, { startTick: 80, durationTicks: 100 })).toEqual({
      startTick: 80,
      endTick: 100,
    })
    expect(overlapWindow({ startTick: 0, durationTicks: 50 }, { startTick: 50, durationTicks: 50 })).toBeNull()
  })

  it('part voice key', () => {
    expect(partVoiceKey('lead')).toBe('part:lead')
  })

  it('lists portamento links for overlapping same-part notes', () => {
    const a = { id: 'a', partId: 'p', midi: 60, startTick: 0, durationTicks: 480 }
    const b = { id: 'b', partId: 'p', midi: 64, startTick: 240, durationTicks: 480 }
    const c = { id: 'c', partId: 'q', midi: 67, startTick: 200, durationTicks: 480 }
    const links = listPortamentoLinks([a, b, c])
    expect(links).toHaveLength(1)
    expect(links[0]?.from.id).toBe('a')
    expect(links[0]?.to.id).toBe('b')
    expect(links[0]?.startTick).toBe(240)
    expect(links[0]?.endTick).toBe(480)
  })

  it('defers overlapping onsets to the source release', () => {
    const out = deferOverlappingOnsets([
      { id: 'a', startTick: 0, durationTicks: 480 },
      { id: 'b', startTick: 240, durationTicks: 480 },
    ])
    expect(out).toEqual([
      { id: 'a', startTick: 0, durationTicks: 480 },
      { id: 'b', startTick: 480, durationTicks: 240 },
    ])
  })

  it('decays only when no immediate same-part follower', () => {
    const a = { id: 'a', partId: 'p', midi: 60, startTick: 0, durationTicks: 480 }
    const abut = { id: 'b', partId: 'p', midi: 64, startTick: 480, durationTicks: 240 }
    const gap = { id: 'c', partId: 'p', midi: 67, startTick: 600, durationTicks: 240 }
    const otherPart = { id: 'd', partId: 'q', midi: 60, startTick: 480, durationTicks: 240 }
    expect(hasImmediateFollower([a, abut], a)).toBe(true)
    expect(shouldDecayOnNoteEnd([a, abut], a)).toBe(false)
    expect(hasImmediateFollower([a, gap], a)).toBe(false)
    expect(shouldDecayOnNoteEnd([a, gap], a)).toBe(true)
    // Other parts do not suppress decay.
    expect(shouldDecayOnNoteEnd([a, otherPart], a)).toBe(true)
  })
})
