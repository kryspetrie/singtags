import { describe, expect, it } from 'vitest'
import {
  collapsePartNotesMono,
  exportTagRollMusicXml,
  midiToMusicXmlPitch,
  splitSlicesAtMeasures,
} from './musicxmlExport'
import { createEmptyTagRollProject } from './normalize'
import { TAG_ROLL_PPQ } from './types'

describe('musicxmlExport', () => {
  it('spells sharps and flats from preferFlats', () => {
    expect(midiToMusicXmlPitch(61, false)).toEqual({ step: 'C', alter: 1, octave: 4 })
    expect(midiToMusicXmlPitch(61, true)).toEqual({ step: 'D', alter: -1, octave: 4 })
    expect(midiToMusicXmlPitch(60, false)).toEqual({ step: 'C', alter: 0, octave: 4 })
  })

  it('truncates overlapping notes for monophonic parts', () => {
    const lead = 'p1'
    const out = collapsePartNotesMono([
      { id: 'a', partId: lead, midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ * 2 },
      { id: 'b', partId: lead, midi: 62, startTick: TAG_ROLL_PPQ, durationTicks: TAG_ROLL_PPQ },
    ])
    expect(out[0]!.durationTicks).toBe(TAG_ROLL_PPQ)
    expect(out[1]!.startTick).toBe(TAG_ROLL_PPQ)
  })

  it('splits notes across barlines with ties', () => {
    const mLen = TAG_ROLL_PPQ * 4
    const measures = splitSlicesAtMeasures(
      [{ start: TAG_ROLL_PPQ * 3, dur: TAG_ROLL_PPQ * 2, midi: 60 }],
      mLen,
      mLen * 2,
    )
    expect(measures[0]!.some((s) => s.tieStart && s.midi === 60)).toBe(true)
    expect(measures[1]!.some((s) => s.tieStop && s.midi === 60)).toBe(true)
  })

  it('emits partwise XML with part names and divisions', () => {
    const p = createEmptyTagRollProject({ title: 'Test & Tag' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      {
        id: 'n1',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
        lyric: 'Hey',
      },
    ]
    const xml = new TextDecoder().decode(exportTagRollMusicXml(p))
    expect(xml).toContain('score-partwise')
    expect(xml).toContain('<part-name>Lead</part-name>')
    expect(xml).toContain(`<divisions>${TAG_ROLL_PPQ}</divisions>`)
    expect(xml).toContain('<text>Hey</text>')
    expect(xml).toContain('Test &amp; Tag')
    expect(xml).toContain('<step>C</step>')
  })
})
