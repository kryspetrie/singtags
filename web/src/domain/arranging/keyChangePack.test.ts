import { describe, expect, it } from 'vitest'
import { suggestKeyChanges } from './keyChange'
import { packModulationIntoSpan } from './keyChangePack'
import { assessKeyChangeFormImpact } from './keyChangeForm'

const PPQ = 480
const MEASURE = PPQ * 4 // 4/4

describe('packModulationIntoSpan', () => {
  it('kc-lift-db: packs chromatic lift into 2 measures covering full span', () => {
    const paths = suggestKeyChanges({
      fromTonality: 0,
      toTonality: 1,
      preferUp: true,
      maxLength: 4,
      includeHybrids: false,
    })
    const lift =
      paths.find((p) => p.templateId === 'lift-up' || /lift|chromatic|half/i.test(p.label)) ??
      paths.find((p) => p.length >= 2 && p.character !== 'hybrid')
    expect(lift).toBeTruthy()

    const start = 0
    const end = MEASURE * 2
    const packed = packModulationIntoSpan(lift!, {
      startTick: start,
      endTick: end,
      ppq: PPQ,
    })
    expect(packed.ok).toBe(true)
    if (!packed.ok) return
    expect(packed.steps[0]!.startTick).toBe(start)
    expect(packed.steps.at(-1)!.endTick).toBe(end)
    for (let i = 1; i < packed.steps.length; i++) {
      expect(packed.steps[i]!.startTick).toBe(packed.steps[i - 1]!.endTick)
    }
    const form = assessKeyChangeFormImpact({
      beforeMeasureCount: 2,
      afterMeasureCount: 2,
      beforeTickLength: end - start,
      afterTickLength: packed.steps.at(-1)!.endTick - packed.steps[0]!.startTick,
    })
    expect(form.ok).toBe(true)
  })

  it('kc-short-budget: long path into 1 beat fails with neededMeasures', () => {
    const paths = suggestKeyChanges({
      fromTonality: 0,
      toTonality: 6,
      preferUp: true,
      minLength: 4,
      includeHybrids: false,
      limit: 20,
    })
    const long = paths.find((p) => p.length >= 4)
    expect(long).toBeTruthy()
    const packed = packModulationIntoSpan(long!, {
      startTick: 0,
      endTick: PPQ, // 1 beat
      ppq: PPQ,
    })
    expect(packed.ok).toBe(false)
    if (packed.ok) return
    expect(packed.neededMeasures).toBeGreaterThanOrEqual(1)
    expect(packed.minBeats).toBe(long!.length)
  })

  it('same-key single step fills whole span', () => {
    const paths = suggestKeyChanges({ fromTonality: 0, toTonality: 0 })
    const stay = paths[0]!
    const packed = packModulationIntoSpan(stay, {
      startTick: 100,
      endTick: 100 + MEASURE,
      ppq: PPQ,
    })
    expect(packed.ok).toBe(true)
    if (!packed.ok) return
    expect(packed.steps).toHaveLength(1)
    expect(packed.steps[0]!.startTick).toBe(100)
    expect(packed.steps[0]!.endTick).toBe(100 + MEASURE)
  })

  it('rejects inverted span', () => {
    const paths = suggestKeyChanges({ fromTonality: 0, toTonality: 5 })
    const packed = packModulationIntoSpan(paths[0]!, {
      startTick: 100,
      endTick: 100,
      ppq: PPQ,
    })
    expect(packed.ok).toBe(false)
  })
})

describe('suggestKeyChanges fixture kc-i7-f', () => {
  it('C→F offers I7-as-V near top', () => {
    const paths = suggestKeyChanges({
      fromTonality: 0,
      toTonality: 5,
      preferUp: true,
      includeHybrids: false,
      limit: 12,
    })
    const i7 = paths.find((p) => p.templateId === 'I7-as-V' || /I7/.test(p.label))
    expect(i7).toBeTruthy()
    const idx = paths.indexOf(i7!)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(6)
  })
})
