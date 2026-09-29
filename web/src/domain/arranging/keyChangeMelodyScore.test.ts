import { describe, expect, it } from 'vitest'
import { suggestKeyChanges } from './keyChange'
import { melodySoftScore, rankPathsByMelody } from './keyChangeMelodyScore'

describe('melodySoftScore', () => {
  it('scores higher when Lead sits in chord tones', () => {
    const paths = suggestKeyChanges({
      fromTonality: 0,
      toTonality: 5,
      includeHybrids: false,
      templateId: undefined,
      maxLength: 3,
    })
    const i7 = paths.find((p) => p.templateId === 'I7-as-V')!
    expect(i7).toBeTruthy()
    // C then F under I7→IV/I style: C ∈ C7, F ∈ F
    const good = melodySoftScore(i7, [
      { startTick: 0, midi: 60 },
      { startTick: 480, midi: 65 },
    ], { startTick: 0, endTick: 960 })
    const bad = melodySoftScore(i7, [
      { startTick: 0, midi: 61 }, // C#
      { startTick: 480, midi: 66 }, // F#
    ], { startTick: 0, endTick: 960 })
    expect(good.score).toBeGreaterThan(bad.score)
  })

  it('empty melody returns neutral 0.5', () => {
    const path = suggestKeyChanges({ fromTonality: 0, toTonality: 1 })[0]!
    const soft = melodySoftScore(path, [], { startTick: 0, endTick: 1920 })
    expect(soft.score).toBe(0.5)
    expect(soft.samples).toBe(0)
  })

  it('rankPathsByMelody prefers common-tone Lead', () => {
    const paths = suggestKeyChanges({
      fromTonality: 0,
      toTonality: 5,
      includeHybrids: false,
      limit: 12,
    })
    const ranked = rankPathsByMelody(
      paths,
      [
        { startTick: 0, midi: 60 },
        { startTick: 480, midi: 65 },
      ],
      { startTick: 0, endTick: 1920 },
    )
    expect(ranked[0]!.soft.score).toBeGreaterThanOrEqual(ranked.at(-1)!.soft.score)
  })
})
