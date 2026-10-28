/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { Dot, StaveNote } from 'vexflow'
import { attachNoteDots, connectSheetTie } from './sheetRhythmMarks'

describe('sheetRhythmMarks', () => {
  it('attaches Dot modifiers for each augmentation dot', () => {
    const note = new StaveNote({ keys: ['c/5'], duration: 'q', dots: 1 })
    expect(Dot.getDots(note)).toHaveLength(0)
    attachNoteDots(note, 1)
    expect(Dot.getDots(note)).toHaveLength(1)
  })

  it('connects open ties then starts the next', () => {
    const factory = {
      StaveTie: vi.fn(),
    }
    const open = new Map()
    const a = new StaveNote({ keys: ['c/5'], duration: 'h' })
    const b = new StaveNote({ keys: ['c/5'], duration: 'q' })
    const c = new StaveNote({ keys: ['c/5'], duration: 'q' })
    connectSheetTie(factory as never, open, 'lead:2', a, 60, true, false)
    connectSheetTie(factory as never, open, 'lead:2', b, 60, true, true)
    connectSheetTie(factory as never, open, 'lead:2', c, 60, false, true)
    expect(factory.StaveTie).toHaveBeenCalledTimes(2)
    expect(factory.StaveTie).toHaveBeenNthCalledWith(1, { from: a, to: b })
    expect(factory.StaveTie).toHaveBeenNthCalledWith(2, { from: b, to: c })
  })
})
