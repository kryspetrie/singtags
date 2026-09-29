import { describe, expect, it } from 'vitest'
import {
  prepareModulationApply,
  pickModulationPath,
  listModulationOptions,
} from './KeyChangeApply'
import { suggestKeyChanges } from '../../domain/arranging/keyChange'

const PPQ = 480
const MEASURE = PPQ * 4

describe('KeyChangeApply', () => {
  it('C→F packs I7-as-V into 2 measures as Sketch patches', () => {
    const result = prepareModulationApply({
      fromTonality: 0,
      toTonality: 5,
      preferUp: true,
      includeHybrids: false,
      templateId: 'I7-as-V',
      startTick: 0,
      endTick: MEASURE * 2,
      ppq: PPQ,
      beforeMeasureCount: 2,
      afterMeasureCount: 2,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.path.templateId === 'I7-as-V' || /I7/.test(result.path.label)).toBe(true)
    expect(result.patches.length).toBe(result.path.length)
    expect(result.patches[0]!.startTick).toBe(0)
    expect(result.patches.at(-1)!.endTick).toBe(MEASURE * 2)
    expect(result.patches.at(-1)!.pillar).toBe(true)
    expect(result.form.ok).toBe(true)
  })

  it('listModulationOptions soft-ranks with melody', () => {
    const opts = listModulationOptions({
      fromTonality: 0,
      toTonality: 5,
      includeHybrids: false,
      limit: 10,
      startTick: 0,
      endTick: MEASURE * 2,
      ppq: PPQ,
      melodyNotes: [
        { startTick: 0, midi: 60 },
        { startTick: MEASURE, midi: 65 },
      ],
    })
    expect(opts.length).toBeGreaterThan(0)
    expect(opts.some((o) => o.packOk)).toBe(true)
    expect(opts[0]!.soft).toBeTruthy()
  })

  it('form impact fail blocks Apply', () => {
    const result = prepareModulationApply({
      fromTonality: 0,
      toTonality: 1,
      startTick: 0,
      endTick: MEASURE * 2,
      ppq: PPQ,
      beforeMeasureCount: 2,
      afterMeasureCount: 3,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.form?.ok).toBe(false)
  })

  it('pickModulationPath prefers templateId', () => {
    const paths = suggestKeyChanges({
      fromTonality: 0,
      toTonality: 5,
      includeHybrids: false,
      limit: 20,
    })
    const picked = pickModulationPath(paths, { templateId: 'I7-as-V' })
    expect(picked?.templateId).toBe('I7-as-V')
  })
})
