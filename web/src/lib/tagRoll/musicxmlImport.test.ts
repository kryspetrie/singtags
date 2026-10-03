/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { parseTagRollMusicXml } from './musicxmlImport'
import { TAG_ROLL_PPQ } from './types'

function partwise(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>Test Tag</work-title></work>
  ${body}
</score-partwise>`
}

describe('parseTagRollMusicXml', () => {
  it('maps four monophonic parts top-down to Tenor/Lead/Bari/Bass', () => {
    const xml = partwise(`
      <part-list>
        <score-part id="P1"><part-name>T</part-name></score-part>
        <score-part id="P2"><part-name>L</part-name></score-part>
        <score-part id="P3"><part-name>Br</part-name></score-part>
        <score-part id="P4"><part-name>Bs</part-name></score-part>
      </part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
      </measure></part>
      <part id="P2"><measure number="1">
        <attributes><divisions>1</divisions></attributes>
        <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
      </measure></part>
      <part id="P3"><measure number="1">
        <attributes><divisions>1</divisions></attributes>
        <note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
      </measure></part>
      <part id="P4"><measure number="1">
        <attributes><divisions>1</divisions></attributes>
        <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
      </measure></part>
    `)
    const r = parseTagRollMusicXml(xml)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project.title).toBe('Test Tag')
    expect(r.project.parts.map((p) => p.name)).toEqual(['Tenor', 'Lead', 'Bari', 'Bass'])
    const byName = Object.fromEntries(
      r.project.parts.map((p) => [
        p.name,
        r.project.notes.filter((n) => n.partId === p.id).map((n) => n.midi),
      ]),
    )
    expect(byName.Tenor).toEqual([72]) // C5
    expect(byName.Lead).toEqual([64]) // E4
    expect(byName.Bari).toEqual([55]) // G3
    expect(byName.Bass).toEqual([48]) // C3
    expect(r.project.view.melodyPartId).toBe(r.project.parts.find((p) => p.name === 'Lead')!.id)
  })

  it('reads subtitle, credits, and footer note', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>Main</work-title></work>
  <movement-title>Subline</movement-title>
  <identification>
    <creator type="composer">Comp</creator>
    <creator type="arranger">Arr</creator>
  </identification>
  <credit page="1"><credit-type>footer</credit-type><credit-words>Foot</credit-words></credit>
  <part-list>
    <score-part id="P1"><part-name>Lead</part-name></score-part>
  </part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
  </measure></part>
</score-partwise>`
    const r = parseTagRollMusicXml(xml)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project.title).toBe('Main')
    expect(r.project.subtitle).toBe('Subline')
    expect(r.project.composer).toBe('Comp')
    expect(r.project.arranger).toBe('Arr')
    expect(r.project.sheetNote).toBe('Foot')
  })

  it('explodes grand-staff 2+2 voices into Tenor/Lead/Bari/Bass', () => {
    const xml = partwise(`
      <part-list>
        <score-part id="P1"><part-name>Piano</part-name></score-part>
      </part-list>
      <part id="P1">
        <measure number="1">
          <attributes>
            <divisions>1</divisions>
            <staves>2</staves>
            <time><beats>4</beats><beat-type>4</beat-type></time>
            <key><fifths>0</fifths><mode>major</mode></key>
          </attributes>
          <!-- staff 1 voice 1 = Tenor -->
          <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
          <backup><duration>4</duration></backup>
          <!-- staff 1 voice 2 = Lead -->
          <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>1</staff></note>
          <backup><duration>4</duration></backup>
          <!-- staff 2 voice 1 = Bari -->
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>2</staff></note>
          <backup><duration>4</duration></backup>
          <!-- staff 2 voice 2 = Bass -->
          <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>2</staff></note>
        </measure>
      </part>
    `)
    const r = parseTagRollMusicXml(xml)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project.parts.map((p) => p.name)).toEqual(['Tenor', 'Lead', 'Bari', 'Bass'])
    const midis = (name: string) => {
      const id = r.project.parts.find((p) => p.name === name)!.id
      return r.project.notes.filter((n) => n.partId === id).map((n) => n.midi)
    }
    expect(midis('Tenor')).toEqual([67])
    expect(midis('Lead')).toEqual([64])
    expect(midis('Bari')).toEqual([60])
    expect(midis('Bass')).toEqual([48])
  })

  it('adds a fifth stream as Part 5 after TTBB', () => {
    const xml = partwise(`
      <part-list>
        <score-part id="P1"><part-name>Choir</part-name></score-part>
        <score-part id="P2"><part-name>Solo</part-name></score-part>
      </part-list>
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions><staves>2</staves>
            <time><beats>1</beats><beat-type>4</beat-type></time>
          </attributes>
          <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
          <backup><duration>1</duration></backup>
          <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><staff>1</staff></note>
          <backup><duration>1</duration></backup>
          <note><pitch><step>G</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff></note>
          <backup><duration>1</duration></backup>
          <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><staff>2</staff></note>
        </measure>
      </part>
      <part id="P2">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
        </measure>
      </part>
    `)
    const r = parseTagRollMusicXml(xml)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project.parts.map((p) => p.name).slice(0, 4)).toEqual([
      'Tenor',
      'Lead',
      'Bari',
      'Bass',
    ])
    expect(r.project.parts.length).toBe(5)
    expect(r.project.parts[4]!.name).toMatch(/Solo/)
  })

  it('converts durations with divisions and reads tempo', () => {
    const xml = partwise(`
      <part-list><score-part id="P1"><part-name>Lead</part-name></score-part></part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <direction><direction-type><metronome>
          <beat-unit>quarter</beat-unit><per-minute>120</per-minute>
        </metronome></direction-type><sound tempo="120"/></direction>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
      </measure></part>
    `)
    const r = parseTagRollMusicXml(xml)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project.bpm).toBe(120)
    expect(r.project.notes[0]!.durationTicks).toBe(TAG_ROLL_PPQ)
  })

  it('rejects timewise scores', () => {
    const xml = `<?xml version="1.0"?><score-timewise></score-timewise>`
    const r = parseTagRollMusicXml(xml)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/timewise/i)
  })
})
