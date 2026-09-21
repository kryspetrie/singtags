import { describe, expect, it } from 'vitest'
import { createEmptyTagRollProject } from './normalize'
import { exportTagRollMidi } from './midiExport'
import { TAG_ROLL_PPQ } from './types'

function projectWithNotes() {
  const p = createEmptyTagRollProject({ title: 'MIDI Test' })
  const lead = p.parts.find((x) => x.name === 'Lead')!
  const bass = p.parts.find((x) => x.name === 'Bass')!
  p.notes = [
    {
      id: 'n1',
      partId: lead.id,
      midi: 60,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ,
      lyric: 'Hi',
    },
    {
      id: 'n2',
      partId: bass.id,
      midi: 48,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ,
    },
  ]
  return p
}

describe('tagRoll midiExport', () => {
  it('writes an SMF Type 1 header', () => {
    const bytes = exportTagRollMidi(projectWithNotes(), 'one')
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd')
    expect(bytes[8]).toBe(0)
    expect(bytes[9]).toBe(1) // format 1
    expect((bytes[12]! << 8) | bytes[13]!).toBe(TAG_ROLL_PPQ)
  })

  it('emits one track for one-track mode and more for all parts', () => {
    const p = projectWithNotes()
    const one = exportTagRollMidi(p, 'one')
    const all = exportTagRollMidi(p, 'all')
    const two = exportTagRollMidi(p, 'two')
    const nTracks = (b: Uint8Array) => (b[10]! << 8) | b[11]!
    expect(nTracks(one)).toBe(1)
    expect(nTracks(all)).toBe(2) // only parts with notes
    expect(nTracks(two)).toBe(2)
    expect(all.length).toBeGreaterThan(one.length)
  })

  it('bake swing on/off produces different MIDI when swing is enabled', () => {
    const p = projectWithNotes()
    p.notes = [
      {
        id: 'n1',
        partId: p.parts[0]!.id,
        midi: 60,
        startTick: TAG_ROLL_PPQ / 2,
        durationTicks: TAG_ROLL_PPQ / 2,
      },
    ]
    p.swing = { enabled: true, unit: 'eighth', style: 'triplet', amount: 1 }
    p.midiBakeSwing = true
    const baked = exportTagRollMidi(p, 'one', { bakeSwing: true })
    const straight = exportTagRollMidi(p, 'one', { bakeSwing: false })
    expect([...baked]).not.toEqual([...straight])
  })
})
