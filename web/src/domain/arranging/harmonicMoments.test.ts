import { describe, expect, it } from 'vitest'
import {
  buildHarmonicMoments,
  momentToMelodyEvent,
  momentsFromMelodyAlone,
} from './harmonicMoments'
import type { MelodyEvent } from './types'

const lead = (id: string, start: number, dur: number, midi = 60): MelodyEvent => ({
  id,
  midi,
  startTick: start,
  durationTicks: dur,
  role: 'pmn',
})

describe('buildHarmonicMoments', () => {
  it('matches lead onsets when no extra parts', () => {
    const mel = [lead('a', 0, 480), lead('b', 480, 480)]
    const moments = momentsFromMelodyAlone(mel)
    expect(moments).toHaveLength(2)
    expect(moments[0]).toMatchObject({ startTick: 0, leadMidi: 60, heldLead: false })
    expect(moments[1]).toMatchObject({ startTick: 480, heldLead: false })
  })

  it('splits a held lead post when other parts change (Lilly-like)', () => {
    // Lead holds 0..1920; TBB change at 0, 480, 960, 1440
    const mel = [lead('post', 0, 1920, 67)]
    const parts = [
      { startTick: 0, durationTicks: 480, midi: 55 },
      { startTick: 480, durationTicks: 480, midi: 57 },
      { startTick: 960, durationTicks: 480, midi: 59 },
      { startTick: 1440, durationTicks: 480, midi: 60 },
    ]
    const moments = buildHarmonicMoments(mel, parts)
    expect(moments).toHaveLength(4)
    expect(moments.every((m) => m.leadMidi === 67)).toBe(true)
    expect(moments[0]!.heldLead).toBe(false)
    expect(moments.slice(1).every((m) => m.heldLead)).toBe(true)
    expect(moments.map((m) => m.startTick)).toEqual([0, 480, 960, 1440])
    expect(moments[0]!.durationTicks).toBe(480)
    expect(moments[3]!.durationTicks).toBe(480)
  })

  it('ignores part onsets with no sounding lead', () => {
    const mel = [lead('a', 480, 480)]
    const moments = buildHarmonicMoments(mel, [
      { startTick: 0, durationTicks: 240, midi: 40 },
      { startTick: 480, durationTicks: 240, midi: 42 },
    ])
    // Pre-lead material at t=0 is ignored; lead span may still split at part release (720).
    expect(moments[0]!.startTick).toBe(480)
    expect(moments.every((m) => m.startTick >= 480)).toBe(true)
  })

  it('splits when a non-lead part ends mid-hold (release is a chord change)', () => {
    const mel = [lead('post', 0, 960, 67)]
    // Bass sounds 0..480 then silence; tenor holds 0..960
    const parts = [
      { startTick: 0, durationTicks: 960, midi: 72 },
      { startTick: 0, durationTicks: 480, midi: 48 },
    ]
    const moments = buildHarmonicMoments(mel, parts)
    expect(moments.map((m) => m.startTick)).toEqual([0, 480])
    expect(moments[0]!.durationTicks).toBe(480)
    expect(moments[1]!.durationTicks).toBe(480)
    expect(moments[1]!.heldLead).toBe(true)
  })

  it('momentToMelodyEvent preserves lead pitch and moment span', () => {
    const m = buildHarmonicMoments([lead('post', 0, 960, 64)], [
      { startTick: 0, durationTicks: 480, midi: 48 },
      { startTick: 480, durationTicks: 480, midi: 50 },
    ])[1]!
    const ev = momentToMelodyEvent(m)
    expect(ev.midi).toBe(64)
    expect(ev.startTick).toBe(480)
    expect(ev.durationTicks).toBe(480)
    expect(ev.id).toBe('post')
  })
})
