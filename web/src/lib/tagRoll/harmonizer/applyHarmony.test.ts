import { describe, expect, it } from 'vitest'
import { createSequentialIdGenerator } from '../../../adapters/system/systemServices'
import { applyHarmonyToNotes } from './applyHarmony'
import { TAG_ROLL_PPQ } from '../types'

const parts = [
  { id: 'tenor', name: 'Tenor', color: '#c', midiGroup: 'upper' as const },
  { id: 'lead', name: 'Lead', color: '#l', midiGroup: 'upper' as const },
  { id: 'bari', name: 'Bari', color: '#b', midiGroup: 'lower' as const },
  { id: 'bass', name: 'Bass', color: '#s', midiGroup: 'lower' as const },
]

const pitches = { tenor: 67, bari: 57, bass: 48, lead: 60 }

function idGen() {
  return createSequentialIdGenerator(1)
}

describe('applyHarmonyToNotes', () => {
  it('moves an existing in-window note onto the melody stack (no duplicate)', () => {
    const melody = {
      id: 'm1',
      partId: 'lead',
      midi: 60,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ,
    }
    const bariIndependent = {
      id: 'b1',
      partId: 'bari',
      midi: 55,
      startTick: TAG_ROLL_PPQ / 2,
      durationTicks: TAG_ROLL_PPQ / 2,
    }
    const next = applyHarmonyToNotes({
      notes: [melody, bariIndependent],
      parts,
      melody,
      pitches,
      idGen: idGen(),
    })
    const bariNotes = next.filter((n) => n.partId === 'bari')
    expect(bariNotes).toHaveLength(1)
    expect(bariNotes[0]).toMatchObject({
      id: 'b1',
      midi: 57,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ,
    })
    expect(next.find((n) => n.partId === 'tenor' && n.startTick === 0)?.midi).toBe(67)
    expect(next.find((n) => n.partId === 'bass' && n.startTick === 0)?.midi).toBe(48)
  })

  it('retunes an exact stack match in place', () => {
    const melody = {
      id: 'm1',
      partId: 'lead',
      midi: 60,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ,
    }
    const bari = {
      id: 'b1',
      partId: 'bari',
      midi: 50,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ,
    }
    const next = applyHarmonyToNotes({
      notes: [melody, bari],
      parts,
      melody,
      pitches,
      idGen: idGen(),
    })
    expect(next.find((n) => n.id === 'b1')?.midi).toBe(57)
    expect(next.filter((n) => n.partId === 'bari')).toHaveLength(1)
  })

  it('breaks a note that spans the insert tick (truncate left + new stack note)', () => {
    const melody = {
      id: 'm1',
      partId: 'lead',
      midi: 60,
      startTick: TAG_ROLL_PPQ,
      durationTicks: TAG_ROLL_PPQ,
    }
    const bari = {
      id: 'b1',
      partId: 'bari',
      midi: 55,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ * 2,
    }
    const next = applyHarmonyToNotes({
      notes: [melody, bari],
      parts,
      melody,
      pitches,
      idGen: idGen(),
    })
    const bariNotes = next
      .filter((n) => n.partId === 'bari')
      .sort((a, b) => a.startTick - b.startTick)
    expect(bariNotes).toHaveLength(2)
    expect(bariNotes[0]).toMatchObject({
      id: 'b1',
      midi: 55,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ,
    })
    expect(bariNotes[1]).toMatchObject({
      midi: 57,
      startTick: TAG_ROLL_PPQ,
      durationTicks: TAG_ROLL_PPQ,
    })
  })

  it('preserves a right remnant when a spanning note extends past the harmony', () => {
    const melody = {
      id: 'm1',
      partId: 'lead',
      midi: 60,
      startTick: TAG_ROLL_PPQ,
      durationTicks: TAG_ROLL_PPQ,
    }
    const bari = {
      id: 'b1',
      partId: 'bari',
      midi: 55,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ * 3,
    }
    const gens = idGen()
    const next = applyHarmonyToNotes({
      notes: [melody, bari],
      parts,
      melody,
      pitches,
      idGen: gens,
    })
    const bariNotes = next
      .filter((n) => n.partId === 'bari')
      .sort((a, b) => a.startTick - b.startTick)
    expect(bariNotes).toHaveLength(3)
    expect(bariNotes[0]).toMatchObject({
      id: 'b1',
      midi: 55,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ,
    })
    expect(bariNotes[1]).toMatchObject({
      midi: 57,
      startTick: TAG_ROLL_PPQ,
      durationTicks: TAG_ROLL_PPQ,
    })
    expect(bariNotes[2]).toMatchObject({
      midi: 55,
      startTick: TAG_ROLL_PPQ * 2,
      durationTicks: TAG_ROLL_PPQ,
    })
    expect(bariNotes[2]!.id).not.toBe('b1')
  })

  it('honors an explicit cursorTick for placement', () => {
    const melody = {
      id: 'm1',
      partId: 'lead',
      midi: 60,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ,
    }
    const next = applyHarmonyToNotes({
      notes: [melody],
      parts,
      melody,
      pitches,
      cursorTick: TAG_ROLL_PPQ / 2,
      idGen: idGen(),
    })
    expect(next.find((n) => n.partId === 'bari')).toMatchObject({
      midi: 57,
      startTick: TAG_ROLL_PPQ / 2,
      durationTicks: TAG_ROLL_PPQ,
    })
  })

  it('does not move the melody note itself', () => {
    const melody = {
      id: 'm1',
      partId: 'lead',
      midi: 60,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ,
    }
    const next = applyHarmonyToNotes({
      notes: [melody],
      parts,
      melody,
      pitches,
      idGen: idGen(),
    })
    expect(next.find((n) => n.id === 'm1')).toEqual(melody)
  })

  it('uses injected idGen for brand-new stack notes', () => {
    const melody = {
      id: 'm1',
      partId: 'lead',
      midi: 60,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ,
    }
    const next = applyHarmonyToNotes({
      notes: [melody],
      parts,
      melody,
      pitches,
      idGen: createSequentialIdGenerator(40),
    })
    const newIds = next.filter((n) => n.id.startsWith('trn_')).map((n) => n.id)
    expect(newIds).toEqual(['trn_40', 'trn_41', 'trn_42'])
  })
})
