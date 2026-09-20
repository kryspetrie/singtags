import { describe, expect, it } from 'vitest'
import { assignSheetStaves } from './assignStaves'
import { layoutSheetScore } from './staffGeometry'
import { concertToWrittenMidi, writtenToConcertMidi } from './writtenPitch'
import { TAG_ROLL_DEFAULT_LENGTH_TICKS, TAG_ROLL_PPQ } from '../types'

const ttbbParts = [
  { id: 't', name: 'Tenor', color: '#c', midiGroup: 'upper' as const },
  { id: 'l', name: 'Lead', color: '#l', midiGroup: 'upper' as const },
  { id: 'r', name: 'Bari', color: '#b', midiGroup: 'lower' as const },
  { id: 'b', name: 'Bass', color: '#s', midiGroup: 'lower' as const },
]

describe('assignSheetStaves', () => {
  it('maps TTBB onto upper/lower voices with correct stem voices', () => {
    const a = assignSheetStaves(ttbbParts, 'ttbb')
    expect(a.staves).toHaveLength(2)
    expect(a.staves[0]).toMatchObject({
      kind: 'upper',
      clef: 'treble8vb',
      labels: ['Tenor', 'Lead'],
    })
    expect(a.staves[0]!.voices.map((v) => [v.role, v.voice])).toEqual([
      ['tenor', 1],
      ['lead', 2],
    ])
    expect(a.staves[1]).toMatchObject({
      kind: 'lower',
      clef: 'bass',
      labels: ['Bari', 'Bass'],
    })
    expect(a.staves[1]!.voices.map((v) => [v.role, v.voice])).toEqual([
      ['bari', 1],
      ['bass', 2],
    ])
  })

  it('uses SSAA clefs', () => {
    const a = assignSheetStaves(ttbbParts, 'ssaa')
    expect(a.staves[0]!.clef).toBe('treble')
    expect(a.staves[1]!.clef).toBe('bass8va')
  })

  it('puts extra parts on solo staves', () => {
    const parts = [
      ...ttbbParts,
      { id: 'x', name: 'Solo', color: '#x', midiGroup: 'solo' as const },
    ]
    const a = assignSheetStaves(parts, 'ttbb')
    expect(a.staves).toHaveLength(3)
    expect(a.staves[2]).toMatchObject({
      kind: 'solo',
      clef: 'treble',
      labels: ['Solo'],
    })
    expect(a.staves[2]!.voices[0]!.voice).toBe(1)
  })
})

describe('writtenPitch', () => {
  it('transposes TTBB upper up an octave for writing', () => {
    expect(concertToWrittenMidi(60, 'ttbb', 'upper')).toBe(72)
    expect(concertToWrittenMidi(48, 'ttbb', 'lower')).toBe(48)
    expect(writtenToConcertMidi(72, 'ttbb', 'upper')).toBe(60)
  })

  it('transposes SSAA lower down an octave for writing', () => {
    expect(concertToWrittenMidi(55, 'ssaa', 'lower')).toBe(43)
    expect(concertToWrittenMidi(67, 'ssaa', 'upper')).toBe(67)
    expect(writtenToConcertMidi(43, 'ssaa', 'lower')).toBe(55)
  })
})

describe('layoutSheetScore', () => {
  it('places barlines on measure boundaries matching 4/4', () => {
    const assignment = assignSheetStaves(ttbbParts, 'ttbb')
    const layout = layoutSheetScore({
      assignment,
      lengthTicks: TAG_ROLL_PPQ * 4 * 2,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    expect(layout.barTicks).toEqual([0, TAG_ROLL_PPQ * 4, TAG_ROLL_PPQ * 8])
    expect(layout.staves).toHaveLength(2)
    expect(layout.staves[1]!.topY).toBeGreaterThan(layout.staves[0]!.topY)
    expect(layout.marginLeft).toBeGreaterThan(40)
    expect(layout.contentHeight).toBeGreaterThan(layout.staves[1]!.topY)
  })

  it('includes beat ticks between barlines', () => {
    const assignment = assignSheetStaves(ttbbParts, 'ttbb')
    const layout = layoutSheetScore({
      assignment,
      lengthTicks: TAG_ROLL_DEFAULT_LENGTH_TICKS,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    expect(layout.beatTicksList).toContain(TAG_ROLL_PPQ)
    expect(layout.beatTicksList).not.toContain(0)
    expect(layout.beatTicksList).not.toContain(TAG_ROLL_PPQ * 4)
  })
})
