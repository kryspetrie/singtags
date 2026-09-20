import { describe, expect, it } from 'vitest'
import {
  nextSongPitchShiftMap,
  pruneIdsToAlive,
  songCanPitch,
  songShiftFromMap,
  toggleExpandedId,
} from './pitchUi'

describe('songCanPitch / pitch map', () => {
  it('detects playable keys', () => {
    expect(songCanPitch({ key: 'C Major' })).toBe(true)
    expect(songCanPitch({ key: '' })).toBe(false)
    expect(songCanPitch({})).toBe(false)
  })

  it('sets and clears shifts', () => {
    expect(nextSongPitchShiftMap({}, 'a', 2)).toEqual({ a: 2 })
    expect(nextSongPitchShiftMap({ a: 2 }, 'a', 0)).toEqual({})
    expect(nextSongPitchShiftMap({ a: 2 }, 'a', 0)).toEqual({})
    expect(songShiftFromMap({ a: 3 }, 'a')).toBe(3)
    expect(songShiftFromMap({}, 'a')).toBe(0)
  })
})

describe('toggleExpandedId / pruneIdsToAlive', () => {
  it('toggles expand membership', () => {
    const open = toggleExpandedId(new Set(), 'x')
    expect(open.collapsed).toBe(false)
    expect([...open.next]).toEqual(['x'])
    const closed = toggleExpandedId(open.next, 'x')
    expect(closed.collapsed).toBe(true)
    expect(closed.next.size).toBe(0)
  })

  it('prunes selection to alive ids', () => {
    expect([...pruneIdsToAlive(new Set(['a', 'b', 'c']), ['a', 'c'])].sort()).toEqual([
      'a',
      'c',
    ])
  })
})
