/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { BARBERSHOP_CHORDS, placeVoicingConcert, pcName } from './harmonizer/chords'
import {
  matchConcertStackVoicing,
  recoverChordsSelection,
} from './recoverChordsSelection'
import type { TagRollNote, TagRollPart } from './types'

const parts: TagRollPart[] = [
  { id: 't', name: 'Tenor', color: '#c45c26', midiGroup: 'upper' },
  { id: 'l', name: 'Lead', color: '#2b6cb0', midiGroup: 'upper' },
  { id: 'b', name: 'Bari', color: '#2f7d4a', midiGroup: 'lower' },
  { id: 's', name: 'Bass', color: '#5b3d8f', midiGroup: 'lower' },
]

function note(partId: string, midi: number, id: string): TagRollNote {
  return {
    id,
    partId,
    midi,
    startTick: 0,
    durationTicks: 480,
  }
}

describe('recoverChordsSelection', () => {
  it('recovers voicing (and spread only when MIDI still differs) from a stack', () => {
    const chord = BARBERSHOP_CHORDS.find((c) => c.id === 'major')!
    // 1513: bass=1 bari=5 lead=1 tenor=3 — lead on root
    const voicing = '1513'
    const leadMidi = 60
    const placed = placeVoicingConcert({
      chord,
      rootPc: 0,
      leadMidi,
      voicing,
      spread: true,
      clefFamily: 'ttbb',
      melodyStaff: 'upper',
    })!
    expect(placed).toBeTruthy()
    const closed = placeVoicingConcert({
      chord,
      rootPc: 0,
      leadMidi,
      voicing,
      spread: false,
      clefFamily: 'ttbb',
      melodyStaff: 'upper',
    })
    // Spread often collapses to the same concert MIDI after settle; match closed then.
    const expectSpread = JSON.stringify(placed) !== JSON.stringify(closed)
    const matched = matchConcertStackVoicing({
      midi: placed,
      rootPc: 0,
      natureId: 'major',
    })
    expect(
      matched,
      `no match for placed=${JSON.stringify(placed)} closed=${JSON.stringify(closed)}`,
    ).toBeTruthy()
    expect(matched?.voicing).toBe(voicing)
    expect(matched?.spread).toBe(expectSpread)

    const recovered = recoverChordsSelection({
      notes: [
        note('t', placed.tenor, 'n1'),
        note('l', placed.lead, 'n2'),
        note('b', placed.bari, 'n3'),
        note('s', placed.bass, 'n4'),
      ],
      parts,
      sketch: [
        {
          id: 'sk1',
          startTick: 0,
          endTick: 480,
          rootPc: 0,
          quality: 'major',
          source: 'user',
          locked: true,
        },
      ],
      tick: 0,
      leadMidi,
      preferFlats: false,
      pcName,
    })
    expect(recovered?.natureId).toBe('major')
    expect(recovered?.voicing).toBe(voicing)
    expect(recovered?.spread).toBe(expectSpread)
    expect(recovered?.source).toBe('stack')
  })

  it('returns null when neither sketch nor stack is valid', () => {
    const recovered = recoverChordsSelection({
      notes: [note('l', 60, 'n2')],
      parts,
      sketch: [],
      tick: 0,
      leadMidi: 60,
      preferFlats: false,
      pcName,
    })
    expect(recovered).toBeNull()
  })

  it('ignores blank Sketch placeholders (timing-only)', () => {
    const recovered = recoverChordsSelection({
      notes: [note('l', 60, 'n2')],
      parts,
      sketch: [
        {
          id: 'blank1',
          startTick: 0,
          endTick: 480,
          rootPc: 0,
          quality: 'blank',
          source: 'user',
          locked: true,
        },
      ],
      tick: 0,
      leadMidi: 60,
      preferFlats: false,
      pcName,
    })
    expect(recovered).toBeNull()
  })
})
