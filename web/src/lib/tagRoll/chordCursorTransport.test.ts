/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import {
  confirmDeleteInspectRangeNotes,
  inspectRangeDeleteMessage,
  resolveInspectPlayback,
} from './chordCursorTransport'

describe('resolveInspectPlayback', () => {
  it('returns null without a range', () => {
    expect(resolveInspectPlayback(null, 100)).toBeNull()
    expect(resolveInspectPlayback({ startTick: 10, endTick: 10 }, 0)).toBeNull()
  })

  it('starts from playhead when inside the range', () => {
    expect(resolveInspectPlayback({ startTick: 0, endTick: 960 }, 480)).toEqual({
      fromTick: 480,
      untilTick: 960,
      rewindTick: 0,
    })
  })

  it('starts at range start when playhead is outside', () => {
    expect(resolveInspectPlayback({ startTick: 480, endTick: 960 }, 0)).toEqual({
      fromTick: 480,
      untilTick: 960,
      rewindTick: 480,
    })
    expect(resolveInspectPlayback({ startTick: 480, endTick: 960 }, 960)).toEqual({
      fromTick: 480,
      untilTick: 960,
      rewindTick: 480,
    })
  })
})

describe('inspectRangeDeleteMessage', () => {
  it('formats a count warning', () => {
    expect(inspectRangeDeleteMessage(3)).toContain('3 notes')
    expect(inspectRangeDeleteMessage(1)).toContain('1 note')
    expect(inspectRangeDeleteMessage(0)).toBeNull()
  })
})

describe('confirmDeleteInspectRangeNotes', () => {
  it('confirms with a count warning', () => {
    const ask = vi.fn(() => true)
    expect(confirmDeleteInspectRangeNotes(3, ask)).toBe(true)
    expect(ask.mock.calls[0]![0]).toContain('3 notes')
  })

  it('rejects empty', () => {
    expect(confirmDeleteInspectRangeNotes(0, () => true)).toBe(false)
  })
})
