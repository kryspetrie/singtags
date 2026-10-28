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

  it('defers portamento destination to source release for monophonic notation', () => {
    const lead = 'p1'
    const out = collapsePartNotesMono([
      { id: 'a', partId: lead, midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ * 2 },
      {
        id: 'b',
        partId: lead,
        midi: 62,
        startTick: TAG_ROLL_PPQ,
        durationTicks: TAG_ROLL_PPQ * 2,
      },
    ])
    expect(out).toHaveLength(2)
    expect(out[0]!.durationTicks).toBe(TAG_ROLL_PPQ * 2)
    expect(out[1]!.startTick).toBe(TAG_ROLL_PPQ * 2)
    expect(out[1]!.durationTicks).toBe(TAG_ROLL_PPQ)
  })

  it('omits a destination that ends before the source releases', () => {
    const lead = 'p1'
    const out = collapsePartNotesMono([
      { id: 'a', partId: lead, midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ * 2 },
      {
        id: 'b',
        partId: lead,
        midi: 62,
        startTick: TAG_ROLL_PPQ,
        durationTicks: TAG_ROLL_PPQ / 2,
      },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('a')
    expect(out[0]!.durationTicks).toBe(TAG_ROLL_PPQ * 2)
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

  it('emits staff parts with clef octave-change and voice 1/2', () => {
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
    expect(xml).toContain('Tenor · Lead')
    expect(xml).toContain('Bari · Bass')
    expect(xml).toContain(`<divisions>${TAG_ROLL_PPQ}</divisions>`)
    expect(xml).toContain('<text>Hey</text>')
    expect(xml).toContain('Test &amp; Tag')
    expect(xml).toContain('<step>C</step>')
    expect(xml).toContain('<type>quarter</type>')
    expect(xml).toContain('<clef-octave-change>-1</clef-octave-change>')
    expect(xml).toContain('<voice>2</voice>') // Lead is voice 2 on upper staff
    expect(xml).toContain('<backup>')
  })

  it('emits subtitle, composer, arranger, and footer credit', () => {
    const p = createEmptyTagRollProject({ title: 'Title' })
    p.subtitle = 'Sub'
    p.composer = 'Comp'
    p.arranger = 'Arr'
    p.sheetNote = 'Foot note'
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      { id: 'n1', partId: lead.id, midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ },
    ]
    const xml = new TextDecoder().decode(exportTagRollMusicXml(p))
    expect(xml).toContain('<movement-title>Sub</movement-title>')
    expect(xml).toContain('<creator type="composer">Comp</creator>')
    expect(xml).toContain('<creator type="arranger">Arr</creator>')
    expect(xml).toContain('<credit-type>footer</credit-type>')
    expect(xml).toContain('<credit-words>Foot note</credit-words>')
  })

  it('exports locked harmony sketch as MusicXML chord symbols on the melody staff', () => {
    const p = createEmptyTagRollProject({ title: 'Sketch' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      { id: 'n1', partId: lead.id, midi: 67, startTick: 0, durationTicks: TAG_ROLL_PPQ },
    ]
    p.harmonySketch = [
      {
        id: 'hs1',
        startTick: 0,
        endTick: TAG_ROLL_PPQ,
        rootPc: 7,
        quality: 'seventh',
        source: 'user',
        locked: true,
      },
    ]
    const xml = new TextDecoder().decode(exportTagRollMusicXml(p))
    expect(xml).toContain('<harmony>')
    expect(xml).toContain('<root-step>G</root-step>')
    expect(xml).toContain('<kind text="7">dominant</kind>')
  })

  it('spells notes from the chord stack (Ab under Ab7, G# under E7)', () => {
    const midi = 68
    const withChord = (rootPc: number) => {
      const p = createEmptyTagRollProject({ title: 'Spell' })
      p.tonality = 0
      p.preferFlats = false
      const lead = p.parts.find((x) => x.name === 'Lead')!
      p.notes = [
        { id: 'n1', partId: lead.id, midi, startTick: 0, durationTicks: TAG_ROLL_PPQ },
      ]
      p.harmonySketch = [
        {
          id: 'c',
          startTick: 0,
          endTick: TAG_ROLL_PPQ * 4,
          rootPc,
          quality: 'seventh',
          source: 'user',
          locked: true,
        },
      ]
      return new TextDecoder().decode(exportTagRollMusicXml(p))
    }
    const ab = withChord(8)
    expect(ab).toContain('<step>A</step>')
    expect(ab).toContain('<alter>-1</alter>')
    expect(ab).toContain('<accidental>flat</accidental>')
    expect(ab).toContain('<root-step>A</root-step>')
    expect(ab).toContain('<root-alter>-1</root-alter>')

    const e7 = withChord(4)
    expect(e7).toContain('<step>G</step>')
    expect(e7).toContain('<alter>1</alter>')
    expect(e7).toContain('<accidental>sharp</accidental>')
  })

  it('emits flat-flat for dim7 sevenths (Bbb)', () => {
    const p = createEmptyTagRollProject({ title: 'Dim' })
    p.preferFlats = true
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      { id: 'n1', partId: lead.id, midi: 69, startTick: 0, durationTicks: TAG_ROLL_PPQ },
    ]
    p.harmonySketch = [
      {
        id: 'dim',
        startTick: 0,
        endTick: TAG_ROLL_PPQ * 4,
        rootPc: 0,
        quality: 'dim7',
        source: 'user',
        locked: true,
      },
    ]
    const xml = new TextDecoder().decode(exportTagRollMusicXml(p))
    expect(xml).toContain('<step>B</step>')
    expect(xml).toContain('<alter>-2</alter>')
    expect(xml).toContain('<accidental>flat-flat</accidental>')
  })

  it('emits time-modification from explicit tuplet containers', () => {
    const p = createEmptyTagRollProject({ title: 'Explicit trip' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    const third = Math.round(TAG_ROLL_PPQ / 3)
    const d0 = third
    const d1 = third
    const d2 = TAG_ROLL_PPQ - d0 - d1
    const groupId = 'tup_xml'
    p.tuplets = [
      {
        id: groupId,
        partId: lead.id,
        startTick: 0,
        spanTicks: TAG_ROLL_PPQ,
        actualNotes: 3,
        normalNotes: 2,
      },
    ]
    p.notes = [
      {
        id: 'a',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: d0,
        tuplet: { groupId, actualNotes: 3, normalNotes: 2 },
      },
      {
        id: 'b',
        partId: lead.id,
        midi: 62,
        startTick: d0,
        durationTicks: d1,
        tuplet: { groupId, actualNotes: 3, normalNotes: 2 },
      },
      {
        id: 'c',
        partId: lead.id,
        midi: 64,
        startTick: d0 + d1,
        durationTicks: d2,
        tuplet: { groupId, actualNotes: 3, normalNotes: 2 },
      },
    ]
    const xml = new TextDecoder().decode(exportTagRollMusicXml(p))
    expect(xml).toContain('<actual-notes>3</actual-notes>')
    expect(xml).toContain('<normal-notes>2</normal-notes>')
    expect(xml).toContain('<tuplet type="start"')
    expect(xml).toContain('<tuplet type="stop"')
  })

  it('emits syllabic begin/end and time-modification for inferred triplets', () => {
    const p = createEmptyTagRollProject({ title: 'Trip' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    const third = Math.round(TAG_ROLL_PPQ / 3)
    const d0 = third
    const d1 = third
    const d2 = TAG_ROLL_PPQ - d0 - d1
    p.notes = [
      {
        id: 'a',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: d0,
        lyric: 'Beau-',
      },
      {
        id: 'b',
        partId: lead.id,
        midi: 62,
        startTick: d0,
        durationTicks: d1,
        lyric: 'ti-',
      },
      {
        id: 'c',
        partId: lead.id,
        midi: 64,
        startTick: d0 + d1,
        durationTicks: d2,
        lyric: 'ful',
      },
    ]
    const xml = new TextDecoder().decode(exportTagRollMusicXml(p))
    expect(xml).toContain('<actual-notes>3</actual-notes>')
    expect(xml).toContain('<normal-notes>2</normal-notes>')
    expect(xml).toContain('<syllabic>begin</syllabic>')
    expect(xml).toContain('<text>Beau</text>')
    expect(xml).toContain('<syllabic>end</syllabic>')
    expect(xml).toContain('<text>ful</text>')
  })

  it('emits mid-score key changes from key markers', () => {
    const p = createEmptyTagRollProject({ title: 'Keys' })
    p.tonality = 0
    p.preferFlats = false
    p.keyMarkers = [
      { id: 'k0', tick: 0, tonality: 0, tonalityMode: 'major', preferFlats: false },
      {
        id: 'k1',
        tick: TAG_ROLL_PPQ * 4,
        tonality: 7,
        tonalityMode: 'major',
        preferFlats: false,
      },
    ]
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.lengthTicks = TAG_ROLL_PPQ * 8
    p.notes = [
      { id: 'n1', partId: lead.id, midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ },
      {
        id: 'n2',
        partId: lead.id,
        midi: 67,
        startTick: TAG_ROLL_PPQ * 4,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    const xml = new TextDecoder().decode(exportTagRollMusicXml(p))
    expect(xml).toContain('<fifths>0</fifths>')
    expect(xml).toContain('<fifths>1</fifths>')
  })
})
