/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyTagRollProject } from '../normalize'
import { TAG_ROLL_PPQ } from '../types'
import { sheetEngraveLengthTicks } from './engraveLength'

const M = TAG_ROLL_PPQ * 4

describe('sheetEngraveLengthTicks', () => {
  it('keeps one measure when the project is empty', () => {
    const p = createEmptyTagRollProject()
    p.lengthTicks = M * 8
    p.notes = []
    expect(sheetEngraveLengthTicks(p, M)).toBe(M)
  })

  it('trims trailing empty measures after the last note', () => {
    const p = createEmptyTagRollProject()
    p.lengthTicks = M * 8
    p.notes = [
      {
        id: 'n',
        partId: p.parts[0]!.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    expect(sheetEngraveLengthTicks(p, M)).toBe(M)
  })

  it('rounds content up to a whole measure', () => {
    const p = createEmptyTagRollProject()
    p.lengthTicks = M * 8
    p.notes = [
      {
        id: 'n',
        partId: p.parts[0]!.id,
        midi: 60,
        startTick: M + TAG_ROLL_PPQ,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    expect(sheetEngraveLengthTicks(p, M)).toBe(M * 2)
  })

  it('keeps a trailing measure that only has an annotation', () => {
    const p = createEmptyTagRollProject()
    p.lengthTicks = M * 4
    p.notes = [
      {
        id: 'n',
        partId: p.parts[0]!.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    p.tempoMarkers = [{ id: 't', tick: M * 2, bpm: 100 }]
    expect(sheetEngraveLengthTicks(p, M)).toBe(M * 3)
  })

  it('does not extend past the project length', () => {
    const p = createEmptyTagRollProject()
    p.lengthTicks = M * 2
    p.notes = [
      {
        id: 'n',
        partId: p.parts[0]!.id,
        midi: 60,
        startTick: 0,
        durationTicks: M * 10,
      },
    ]
    expect(sheetEngraveLengthTicks(p, M)).toBe(M * 2)
  })
})
