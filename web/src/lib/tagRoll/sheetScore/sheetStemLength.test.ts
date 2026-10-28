import { describe, expect, it } from 'vitest'
import { Stem } from 'vexflow'
import { applySheetStemLength, clampSheetStemLength } from './sheetStemLength'

describe('sheetStemLength', () => {
  it('clamps to format bounds', () => {
    expect(clampSheetStemLength(undefined)).toBe(0.8)
    expect(clampSheetStemLength(1)).toBe(1)
    expect(clampSheetStemLength(0.1)).toBe(0.55)
    expect(clampSheetStemLength(9)).toBe(1.85)
  })

  it('scales stem length while preserving flag extension', () => {
    const note = {
      isRest: () => false,
      getStemExtension: () => 4,
      setStemLength: (h: number) => {
        ;(note as { _h?: number })._h = h
      },
      _h: 0 as number,
    }
    applySheetStemLength(note as never, 1.5)
    expect(note._h).toBeCloseTo(Stem.HEIGHT * 1.5 + 4, 5)
  })

  it('skips rests and near-default scale', () => {
    let called = 0
    const rest = {
      isRest: () => true,
      setStemLength: () => {
        called++
      },
    }
    applySheetStemLength(rest as never, 1.5)
    expect(called).toBe(0)
    const note = {
      isRest: () => false,
      getStemExtension: () => 0,
      setStemLength: () => {
        called++
      },
    }
    applySheetStemLength(note as never, 1)
    expect(called).toBe(0)
  })
})
