/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import { createEmptyTagRollProject } from '../lib/tagRoll/normalize'
import { useTagRollCoachFocus } from './useTagRollCoachFocus'

describe('useTagRollCoachFocus', () => {
  it('onCoachFocusRange sets L/R bounds and selects the start column only', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      { id: 'a', partId: lead.id, midi: 60, startTick: 0, durationTicks: 240 },
      { id: 'b', partId: lead.id, midi: 62, startTick: 480, durationTicks: 240 },
      { id: 'c', partId: lead.id, midi: 64, startTick: 960, durationTicks: 240 },
    ]
    const selectNotes = vi.fn()
    const setPlayheadTick = vi.fn()
    const api = useTagRollCoachFocus(() => p, { selectNotes, setPlayheadTick })

    api.onCoachFocusRange(0, 720)

    expect(api.chordCursor.value).toEqual({ startTick: 0, endTick: 720 })
    expect(selectNotes).toHaveBeenCalledWith(['a'])
    expect(setPlayheadTick).toHaveBeenCalledWith(0, { snap: false })
  })

  it('onCoachFocusRange none mode sets L/R and clears edit selection', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      { id: 'a', partId: lead.id, midi: 60, startTick: 0, durationTicks: 240 },
      { id: 'b', partId: lead.id, midi: 62, startTick: 480, durationTicks: 240 },
    ]
    const selectNotes = vi.fn()
    const setPlayheadTick = vi.fn()
    const api = useTagRollCoachFocus(() => p, { selectNotes, setPlayheadTick })

    api.onCoachFocusRange(0, 960, 'none')

    expect(api.chordCursor.value).toEqual({ startTick: 0, endTick: 960 })
    expect(selectNotes).toHaveBeenCalledWith([])
    expect(setPlayheadTick).toHaveBeenCalledWith(0, { snap: false })
  })

  it('onCoachFocusRange pillar mode keeps L/R on the span and picks the stack onset', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    const tenor = p.parts.find((x) => x.name === 'Tenor')!
    const bari = p.parts.find((x) => x.name === 'Bari')!
    const bass = p.parts.find((x) => x.name === 'Bass')!
    p.notes = [
      { id: 'lead', partId: lead.id, midi: 60, startTick: 1920, durationTicks: 1920 },
      { id: 't', partId: tenor.id, midi: 65, startTick: 2880, durationTicks: 240 },
      { id: 'r', partId: bari.id, midi: 57, startTick: 2880, durationTicks: 240 },
      { id: 'b', partId: bass.id, midi: 53, startTick: 2880, durationTicks: 240 },
    ]
    const selectNotes = vi.fn()
    const setPlayheadTick = vi.fn()
    const api = useTagRollCoachFocus(() => p, { selectNotes, setPlayheadTick })

    api.onCoachFocusRange(1920, 3840, 'pillar')

    expect(api.chordCursor.value).toEqual({ startTick: 1920, endTick: 3840 })
    expect(selectNotes).toHaveBeenCalledWith(['t', 'r', 'b'])
    expect(setPlayheadTick).toHaveBeenCalledWith(2880, { snap: false })
  })

  it('setChordCursor select:range still picks every overlapping note', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      { id: 'a', partId: lead.id, midi: 60, startTick: 0, durationTicks: 240 },
      { id: 'b', partId: lead.id, midi: 62, startTick: 480, durationTicks: 240 },
    ]
    const selectNotes = vi.fn()
    const api = useTagRollCoachFocus(() => p, { selectNotes, setPlayheadTick: vi.fn() })
    api.setChordCursor({ startTick: 0, endTick: 720 }, { select: 'range' })
    expect(selectNotes).toHaveBeenCalledWith(['a', 'b'])
  })

  it('tryDeleteInspectRangeNotes confirms then carves', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      { id: 'a', partId: lead.id, midi: 60, startTick: 0, durationTicks: 240 },
      { id: 'b', partId: lead.id, midi: 62, startTick: 480, durationTicks: 240 },
    ]
    const selectNotes = vi.fn()
    const setPlayheadTick = vi.fn()
    const replaceNotesFromExternal = vi.fn((notes) => {
      p.notes = notes
    })
    const api = useTagRollCoachFocus(() => p, {
      selectNotes,
      setPlayheadTick,
      replaceNotesFromExternal,
      nextNoteId: () => 'n',
    })
    api.setChordCursor({ startTick: 0, endTick: 720 })
    expect(api.tryDeleteInspectRangeNotes(() => true)).toBe(true)
    expect(replaceNotesFromExternal).toHaveBeenCalled()
    expect(p.notes.map((n) => n.id)).toEqual([])
  })

  it('armInspectPlayback stores rewind for natural end', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const api = useTagRollCoachFocus(() => p, {
      selectNotes: vi.fn(),
      setPlayheadTick: vi.fn(),
    })
    api.chordCursor.value = { startTick: 480, endTick: 960 }
    expect(api.armInspectPlayback(0)).toEqual({
      fromTick: 480,
      untilTick: 960,
      rewindTick: 480,
    })
    expect(api.takeInspectPlaybackRewind()).toBe(480)
    expect(api.takeInspectPlaybackRewind()).toBeNull()
  })

  it('tryCopyInspectRangeNotes anchors to the section start', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      { id: 'a', partId: lead.id, midi: 60, startTick: 600, durationTicks: 120 },
      { id: 'b', partId: lead.id, midi: 62, startTick: 720, durationTicks: 120 },
    ]
    const api = useTagRollCoachFocus(() => p, {
      selectNotes: vi.fn(),
      setPlayheadTick: vi.fn(),
    })
    api.chordCursor.value = { startTick: 480, endTick: 960 }
    expect(api.tryCopyInspectRangeNotes()).toEqual({
      notes: [
        { midi: 60, startTick: 120, durationTicks: 120, partId: lead.id },
        { midi: 62, startTick: 240, durationTicks: 120, partId: lead.id },
      ],
      spanTicks: 480,
    })
  })

  it('tryCutInspectRangeNotes copies then carves without confirm', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      { id: 'a', partId: lead.id, midi: 60, startTick: 0, durationTicks: 1000, lyric: 'x' },
      { id: 'b', partId: lead.id, midi: 62, startTick: 960, durationTicks: 120 },
    ]
    const replaceNotesFromExternal = vi.fn((notes) => {
      p.notes = notes
    })
    const api = useTagRollCoachFocus(() => p, {
      selectNotes: vi.fn(),
      setPlayheadTick: vi.fn(),
      replaceNotesFromExternal,
      nextNoteId: () => 'right',
    })
    api.chordCursor.value = { startTick: 200, endTick: 500 }
    const clip = api.tryCutInspectRangeNotes()
    expect(clip).toEqual({
      notes: [{ midi: 60, startTick: 0, durationTicks: 300, partId: lead.id }],
      spanTicks: 300,
    })
    expect(p.notes).toEqual([
      { id: 'a', partId: lead.id, midi: 60, startTick: 0, durationTicks: 200, lyric: 'x' },
      { id: 'right', partId: lead.id, midi: 60, startTick: 500, durationTicks: 500 },
      { id: 'b', partId: lead.id, midi: 62, startTick: 960, durationTicks: 120 },
    ])
    expect(api.chordCursor.value).toBeNull()
  })

  it('onCoachFocusTick clears chord cursor', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [{ id: 'a', partId: lead.id, midi: 60, startTick: 480, durationTicks: 240 }]
    const selectNotes = vi.fn()
    const setPlayheadTick = vi.fn()
    const api = useTagRollCoachFocus(() => p, { selectNotes, setPlayheadTick })

    api.setChordCursor({ startTick: 0, endTick: 960 })
    api.onCoachFocusTick(480)

    expect(api.chordCursor.value).toBeNull()
    expect(selectNotes).toHaveBeenLastCalledWith(['a'])
  })
})
