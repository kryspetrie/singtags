import { describe, expect, it } from 'vitest'
import {
  bpmAtTick,
  beatTicks,
  effectiveTempoMarkers,
  fermataExecutionTick,
  measureTicks,
  notesSpanningTick,
  sampleTempoEvents,
  shouldSkipFermataOnPlay,
  upsertRampEndMarker,
} from './tempoMap'
import { TAG_ROLL_PPQ } from './types'

describe('tempoMap', () => {
  it('computes measure ticks for common meters', () => {
    expect(measureTicks({ numerator: 4, denominator: 4 })).toBe(TAG_ROLL_PPQ * 4)
    expect(measureTicks({ numerator: 3, denominator: 4 })).toBe(TAG_ROLL_PPQ * 3)
    expect(measureTicks({ numerator: 6, denominator: 8 })).toBe(TAG_ROLL_PPQ * 3)
    expect(beatTicks({ numerator: 4, denominator: 4 })).toBe(TAG_ROLL_PPQ)
  })

  it('resolves tempo markers and ramps', () => {
    const markers = [
      { id: 'a', tick: 0, bpm: 104 },
      { id: 'b', tick: TAG_ROLL_PPQ * 4, bpm: 120 },
    ]
    expect(bpmAtTick(0, markers)).toBe(104)
    expect(bpmAtTick(TAG_ROLL_PPQ * 4, markers)).toBe(120)

    const rit = [
      {
        id: 'r',
        kind: 'rit' as const,
        startTick: 0,
        endTick: TAG_ROLL_PPQ * 4,
        startBpm: 100,
        endBpm: 80,
      },
    ]
    expect(bpmAtTick(0, markers, rit)).toBe(100)
    expect(bpmAtTick(TAG_ROLL_PPQ * 2, markers, rit)).toBe(90)
    expect(bpmAtTick(TAG_ROLL_PPQ * 4, markers, rit)).toBe(80)
  })

  it('keeps endBpm after a rit/accel (no snap-back)', () => {
    const markers = [{ id: 'a', tick: 0, bpm: 104 }]
    const rit = [
      {
        id: 'r1',
        kind: 'rit' as const,
        startTick: 0,
        endTick: TAG_ROLL_PPQ * 4,
        startBpm: 100,
        endBpm: 80,
      },
    ]
    // Past the ramp: sticky end marker from effectiveTempoMarkers
    expect(bpmAtTick(TAG_ROLL_PPQ * 4 + 1, markers, rit)).toBe(80)
    expect(bpmAtTick(TAG_ROLL_PPQ * 8, markers, rit)).toBe(80)

    const effective = effectiveTempoMarkers(markers, rit)
    expect(effective.some((m) => m.tick === TAG_ROLL_PPQ * 4 && m.bpm === 80)).toBe(true)
  })

  it('upsertRampEndMarker replaces prior sticky id', () => {
    const markers = [{ id: 'a', tick: 0, bpm: 104 }]
    const once = upsertRampEndMarker(markers, {
      id: 'r1',
      endTick: 960,
      endBpm: 80,
    })
    const twice = upsertRampEndMarker(once, {
      id: 'r1',
      endTick: 1920,
      endBpm: 70,
    })
    expect(twice.filter((m) => m.id === 'trt-ramp-r1')).toHaveLength(1)
    expect(twice.find((m) => m.id === 'trt-ramp-r1')?.tick).toBe(1920)
    expect(twice.find((m) => m.id === 'trt-ramp-r1')?.bpm).toBe(70)
  })

  it('skips fermatas strictly before fromTick only', () => {
    expect(shouldSkipFermataOnPlay(0, 0)).toBe(false)
    expect(shouldSkipFermataOnPlay(0, 1)).toBe(true)
    expect(shouldSkipFermataOnPlay(480, 480)).toBe(false)
    expect(shouldSkipFermataOnPlay(480, 481)).toBe(true)
  })

  it('defers fermata execution to the end of notes on the mark', () => {
    const notes = [{ startTick: 0, durationTicks: 480 }]
    expect(fermataExecutionTick(0, notes)).toBe(480)
    expect(fermataExecutionTick(240, notes)).toBe(480)
    expect(fermataExecutionTick(0, [])).toBe(0)
  })

  it('notesSpanningTick includes active spans only', () => {
    const notes = [
      { id: 'a', startTick: 0, durationTicks: 480 },
      { id: 'b', startTick: 480, durationTicks: 480 },
    ]
    expect(notesSpanningTick(notes, 0).map((n) => n.id)).toEqual(['a'])
    expect(notesSpanningTick(notes, 479).map((n) => n.id)).toEqual(['a'])
    expect(notesSpanningTick(notes, 480).map((n) => n.id)).toEqual(['b'])
  })

  it('later-starting overlapping ramp wins interpolation', () => {
    const markers = [{ id: 'a', tick: 0, bpm: 100 }]
    const exprs = [
      {
        id: 'r1',
        kind: 'rit' as const,
        startTick: 0,
        endTick: TAG_ROLL_PPQ * 4,
        startBpm: 100,
        endBpm: 80,
      },
      {
        id: 'r2',
        kind: 'accel' as const,
        startTick: TAG_ROLL_PPQ * 2,
        endTick: TAG_ROLL_PPQ * 4,
        startBpm: 90,
        endBpm: 110,
      },
    ]
    // Midpoint of r2
    expect(bpmAtTick(TAG_ROLL_PPQ * 3, markers, exprs)).toBe(100)
  })

  it('samples rit tempo curve for MIDI-style events', () => {
    const markers = [{ id: 'a', tick: 0, bpm: 120 }]
    const rit = [
      {
        id: 'r1',
        kind: 'rit' as const,
        startTick: TAG_ROLL_PPQ * 4,
        endTick: TAG_ROLL_PPQ * 8,
        startBpm: 120,
        endBpm: 60,
      },
    ]
    const samples = sampleTempoEvents(markers, rit, 120, TAG_ROLL_PPQ)
    expect(samples[0]).toEqual({ tick: 0, bpm: 120 })
    // Mid-ramp points change bpm (start 120 is deduped against marker at 0).
    expect(samples.some((s) => s.bpm > 60 && s.bpm < 120 && s.tick > TAG_ROLL_PPQ * 4)).toBe(
      true,
    )
    expect(samples.some((s) => s.tick === TAG_ROLL_PPQ * 8 && s.bpm === 60)).toBe(true)
    expect(samples.length).toBeGreaterThan(3)
  })
})
