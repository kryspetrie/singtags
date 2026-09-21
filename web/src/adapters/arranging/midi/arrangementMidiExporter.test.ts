import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../../../domain/arranging/types'
import { exportArrangementMidi } from '../midi/arrangementMidiExporter'
import { autoHarmonizeMelody } from '../../../domain/arranging/harmonize'

describe('arrangementMidiExporter', () => {
  it('writes SMF header Type 1 with 4 tracks', () => {
    const p = createEmptyArrangement('demo')
    p.melody = [
      { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm2', midi: 64, startTick: 480, durationTicks: 480, role: 'pmn' },
    ]
    p.pillars = [
      {
        id: 'p1',
        rootPc: 0,
        startTick: 0,
        endTick: 2000,
        source: 'user',
        confirmed: true,
      },
    ]
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: 0,
    })
    const bytes = exportArrangementMidi(p, { justIntonation: true })
    expect(bytes[0]).toBe(0x4d) // M
    expect(bytes[1]).toBe(0x54) // T
    expect(bytes[2]).toBe(0x68) // h
    expect(bytes[3]).toBe(0x64) // d
    // format 1
    expect(bytes[8]).toBe(0)
    expect(bytes[9]).toBe(1)
    // 4 tracks
    expect(bytes[10]).toBe(0)
    expect(bytes[11]).toBe(4)
    expect(bytes.length).toBeGreaterThan(100)
  })

  it('embeds lead lyrics as MIDI lyric meta events', () => {
    const p = createEmptyArrangement('lyric')
    p.melody = [
      { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn', lyric: 'Oh' },
    ]
    p.pillars = [
      { id: 'p1', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true },
    ]
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: 0,
    })
    const bytes = exportArrangementMidi(p)
    // FF 05 = lyric meta
    const arr = [...bytes]
    let found = false
    for (let i = 0; i < arr.length - 2; i++) {
      if (arr[i] === 0xff && arr[i + 1] === 0x05) found = true
    }
    expect(found).toBe(true)
  })
})
