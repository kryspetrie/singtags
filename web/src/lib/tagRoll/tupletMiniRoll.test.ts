/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildTupletMiniLayout,
  midiAtY,
  moveSlotBetweenColumns,
  slotIndexAtX,
  slotRect,
  TUPLET_MINI_HEADER_H,
} from './tupletMiniRoll'
import { TAG_ROLL_MIDI_MAX, TAG_ROLL_MIDI_MIN } from './types'

describe('tupletMiniRoll', () => {
  it('maps equal-width slots and MIDI rows', () => {
    const L = buildTupletMiniLayout({
      slotCount: 3,
      width: 336,
      midiMin: TAG_ROLL_MIDI_MIN,
      midiMax: TAG_ROLL_MIDI_MAX,
    })
    expect(slotIndexAtX(L, L.gutterW + 1)).toBe(0)
    expect(slotIndexAtX(L, L.gutterW + L.slotW + 1)).toBe(1)
    expect(slotIndexAtX(L, L.gutterW - 1)).toBeNull()

    const midC = slotRect(L, 1, 60, 0)
    expect(midC.w).toBeCloseTo(L.slotW)
    expect(midiAtY(L, midC.y + midC.h / 2, 0)).toBe(60)
    expect(midiAtY(L, TUPLET_MINI_HEADER_H - 1, 0)).toBeNull()
  })

  it('swaps slots when dragging between columns', () => {
    const slots = [{ midi: 60 }, { midi: 64 }, { midi: null }]
    expect(moveSlotBetweenColumns(slots, 0, 2)).toEqual([
      { midi: null },
      { midi: 64 },
      { midi: 60 },
    ])
    expect(moveSlotBetweenColumns(slots, 0, 0)).toEqual(slots)
  })
})
