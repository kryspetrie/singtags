import { describe, expect, it } from 'vitest'
import { emptyQuickAddState, songPartConfidence } from './quickAddState'

describe('emptyQuickAddState', () => {
  it('starts on title with empty fields', () => {
    const s = emptyQuickAddState()
    expect(s.cursor).toEqual({ kind: 'title' })
    expect(s.title).toBe('')
    expect(s.parts).toEqual({})
    expect(s.linkTagId).toBeNull()
    expect(s.linkHighlight).toBe(-1)
  })
})

describe('songPartConfidence', () => {
  it('returns null when unmarked', () => {
    expect(songPartConfidence({}, 'lead')).toBeNull()
  })

  it('returns stored confidence including 0', () => {
    expect(songPartConfidence({ lead: 0 }, 'lead')).toBe(0)
    expect(songPartConfidence({ lead: 4 }, 'lead')).toBe(4)
  })
})
