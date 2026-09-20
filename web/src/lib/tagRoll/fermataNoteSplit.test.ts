import { describe, expect, it } from 'vitest'
import {
  expandNotesForMidi,
  notePerformanceSlices,
  noteSoundSegments,
} from './fermataNoteSplit'
import { createTagStudioHonestyFixture } from './honestyFixture'
import { exportTagRollMidi } from './midiExport'
import { createEmptyTagRollProject } from './normalize'
import { projectDurationSeconds, ticksToSecondsAtBpm } from './tempoMap'
import { TAG_ROLL_PPQ } from './types'

describe('fermataNoteSplit', () => {
  it('extends a note through hold at its end (no mid-note chop)', () => {
    const markers = [{ id: 't0', tick: 0, bpm: 120 }]
    const exprs = [
      {
        id: 'f1',
        kind: 'fermata' as const,
        tick: TAG_ROLL_PPQ,
        holdTicks: TAG_ROLL_PPQ,
        gapTicks: TAG_ROLL_PPQ / 2,
      },
    ]
    const note = { startTick: 0, durationTicks: TAG_ROLL_PPQ * 2 }
    const segs = noteSoundSegments(note, markers, exprs, 120, [note])
    expect(segs.length).toBe(1)
    const holdSec = ticksToSecondsAtBpm(TAG_ROLL_PPQ, 120)
    // Full written 1s + hold 0.5s
    expect(segs[0]!.startSec).toBeCloseTo(0, 5)
    expect(segs[0]!.durSec).toBeCloseTo(1 + holdSec, 5)
  })

  it('MIDI slice is written duration + hold; gap is not part of the note', () => {
    const exprs = [
      {
        id: 'f1',
        kind: 'fermata' as const,
        tick: TAG_ROLL_PPQ,
        holdTicks: 100,
        gapTicks: 50,
      },
    ]
    const note = {
      id: 'n',
      partId: 'p',
      midi: 60,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ * 2,
    }
    const slices = notePerformanceSlices(note, exprs, [note])
    expect(slices.length).toBe(1)
    expect(slices[0]!.startTick).toBe(0)
    expect(slices[0]!.durationTicks).toBe(TAG_ROLL_PPQ * 2 + 100)
  })

  it('passes lyric on the sustained MIDI slice', () => {
    const exprs = [
      {
        id: 'f1',
        kind: 'fermata' as const,
        tick: TAG_ROLL_PPQ,
        holdTicks: 10,
        gapTicks: 10,
      },
    ]
    const slices = expandNotesForMidi(
      [
        {
          id: 'n',
          partId: 'p',
          midi: 60,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ * 2,
          lyric: 'Hi',
        },
      ],
      exprs,
    )
    expect(slices).toHaveLength(1)
    expect(slices[0]!.lyric).toBe('Hi')
  })
})

describe('honesty fixture parity', () => {
  it('builds fixture with rit sticky end + fermata + bari eighths', () => {
    const p = createTagStudioHonestyFixture()
    expect(p.bpm).toBe(104)
    expect(p.tempoMarkers.some((m) => m.bpm === 120)).toBe(true)
    expect(p.tempoMarkers.some((m) => m.bpm === 90)).toBe(true)
    expect(p.expressions.some((e) => e.kind === 'fermata')).toBe(true)
    expect(p.expressions.some((e) => e.kind === 'rit')).toBe(true)
    const bari = p.parts.find((x) => x.name === 'Bari')!
    const bariNotes = p.notes.filter((n) => n.partId === bari.id)
    expect(bariNotes.length).toBe(8)
    expect(bariNotes.every((n) => n.durationTicks === TAG_ROLL_PPQ / 2)).toBe(true)
  })

  it('spanning note sustains through hold as one bounce segment', () => {
    const p = createTagStudioHonestyFixture()
    const span = p.notes.find((n) => n.id === 'lead-span-ferm')!
    const segs = noteSoundSegments(
      span,
      p.tempoMarkers,
      p.expressions,
      p.bpm,
      p.notes,
    )
    expect(segs.length).toBe(1)
    expect(segs[0]!.durSec).toBeGreaterThan(0)

    const slices = notePerformanceSlices(span, p.expressions, p.notes)
    expect(slices.length).toBe(1)

    const bytes = exportTagRollMidi(p, 'one')
    let tempos = 0
    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0x51 && bytes[i + 2] === 0x03) tempos++
    }
    expect(tempos).toBeGreaterThanOrEqual(3) // 104, 120, 90 sticky

    const withFermata = projectDurationSeconds(p)
    const noExpr = createEmptyTagRollProject()
    noExpr.bpm = p.bpm
    noExpr.tempoMarkers = p.tempoMarkers.filter((m) => !m.id.startsWith('trt-ramp-'))
    // Keep markers but drop expressions for baseline length compare at same lengthTicks
    noExpr.lengthTicks = p.lengthTicks
    noExpr.notes = p.notes
    noExpr.tempoMarkers = [
      { id: 't0', tick: 0, bpm: 104 },
      { id: 't1', tick: TAG_ROLL_PPQ * 4, bpm: 120 },
      { id: 't2', tick: TAG_ROLL_PPQ * 12, bpm: 90 },
    ]
    expect(withFermata).toBeGreaterThan(projectDurationSeconds(noExpr))
  })
})
