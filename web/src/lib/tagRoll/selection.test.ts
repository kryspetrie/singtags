import { describe, expect, it } from 'vitest'
import {
  clipboardToNotesAt,
  carveNotesInRange,
  normalizeScreenBox,
  noteIdsInMarquee,
  notesToClipboard,
  rectsIntersect,
  sectionClipboardFromRange,
} from './selection'

describe('tagRoll selection', () => {
  it('normalizes marquee boxes', () => {
    expect(normalizeScreenBox(10, 20, 5, 8)).toEqual({ x: 5, y: 8, w: 5, h: 12 })
  })

  it('intersects notes with marquee', () => {
    const notes = [
      { id: 'a', partId: 'p', midi: 60, startTick: 0, durationTicks: 100 },
      { id: 'b', partId: 'q', midi: 62, startTick: 0, durationTicks: 100 },
    ]
    const ids = noteIdsInMarquee(
      notes,
      (n) => (n.id === 'a' ? { x: 0, y: 0, w: 10, h: 10 } : { x: 50, y: 50, w: 10, h: 10 }),
      { x: 2, y: 2, w: 20, h: 20 },
    )
    expect(ids).toEqual(['a'])
    expect(
      noteIdsInMarquee(
        notes,
        (n) => (n.id === 'a' ? { x: 0, y: 0, w: 10, h: 10 } : { x: 50, y: 50, w: 10, h: 10 }),
        { x: 2, y: 2, w: 20, h: 20 },
        { partId: 'q' },
      ),
    ).toEqual([])
  })

  it('clipboard round-trips relative to origin', () => {
    const clip = notesToClipboard([
      { id: '1', partId: 'p', midi: 60, startTick: 480, durationTicks: 240 },
      { id: '2', partId: 'q', midi: 64, startTick: 720, durationTicks: 240, lyric: 'oh' },
    ])
    expect(clip[0]!.startTick).toBe(0)
    expect(clip[1]!.startTick).toBe(240)
    const placed = clipboardToNotesAt(clip, 960, () => 'n')
    expect(placed[0]!.startTick).toBe(960)
    expect(placed[1]!.startTick).toBe(1200)
    expect(placed[1]!.lyric).toBe('oh')
  })

  it('sectionClipboardFromRange anchors to the left bound', () => {
    const clip = sectionClipboardFromRange(
      [
        { id: '1', partId: 'p', midi: 60, startTick: 600, durationTicks: 120 },
        { id: '2', partId: 'q', midi: 64, startTick: 720, durationTicks: 120 },
      ],
      { startTick: 480, endTick: 960 },
    )
    expect(clip).toEqual({
      notes: [
        { midi: 60, startTick: 120, durationTicks: 120, partId: 'p' },
        { midi: 64, startTick: 240, durationTicks: 120, partId: 'q' },
      ],
      spanTicks: 480,
    })
  })

  it('sectionClipboardFromRange slices notes that cross the bounds', () => {
    const clip = sectionClipboardFromRange(
      [{ id: '1', partId: 'p', midi: 60, startTick: 0, durationTicks: 1000, lyric: 'hold' }],
      { startTick: 200, endTick: 500 },
    )
    expect(clip).toEqual({
      notes: [{ midi: 60, startTick: 0, durationTicks: 300, partId: 'p' }],
      spanTicks: 300,
    })
  })

  it('carveNotesInRange keeps outside remnants and splits spanning notes', () => {
    let i = 0
    const next = carveNotesInRange(
      [
        { id: 'span', partId: 'p', midi: 60, startTick: 0, durationTicks: 1000, lyric: 'a' },
        { id: 'inside', partId: 'p', midi: 62, startTick: 300, durationTicks: 100 },
        { id: 'outside', partId: 'p', midi: 64, startTick: 900, durationTicks: 50 },
      ],
      { startTick: 200, endTick: 500 },
      () => `n${++i}`,
    )
    expect(next).toEqual([
      { id: 'span', partId: 'p', midi: 60, startTick: 0, durationTicks: 200, lyric: 'a' },
      { id: 'n1', partId: 'p', midi: 60, startTick: 500, durationTicks: 500 },
      { id: 'outside', partId: 'p', midi: 64, startTick: 900, durationTicks: 50 },
    ])
  })

  it('rectsIntersect', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 2, h: 2 })).toBe(true)
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 2, h: 2 })).toBe(false)
  })
})
