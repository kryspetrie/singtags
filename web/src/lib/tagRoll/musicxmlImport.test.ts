/**
 * @vitest-environment happy-dom
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTagRollMusicXml } from './musicxmlImport'
import { measureTicks } from './tempoMap'
import { TAG_ROLL_PPQ } from './types'

const MILL_STREAM = resolve(
  __dirname,
  '../../../../polecats/mixed-musicxml/DOWN BY THE OLD MILL STREAM.musicxml.xml',
)

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

  it('explodes two dual-voice parts (mixed polecat SA–TB) into Tenor/Lead/Bari/Bass', () => {
    const xml = partwise(`
      <part-list>
        <score-part id="P1"><part-name>Tenor Lead</part-name></score-part>
        <score-part id="P2"><part-name>Bari Bass</part-name></score-part>
      </part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
        <backup><duration>4</duration></backup>
        <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>1</staff></note>
      </measure></part>
      <part id="P2"><measure number="1">
        <attributes><divisions>1</divisions></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
        <backup><duration>4</duration></backup>
        <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>1</staff></note>
      </measure></part>
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
    const byName = Object.fromEntries(
      r.project.parts.map((p) => [
        p.name,
        r.project.notes.filter((n) => n.partId === p.id).map((n) => n.midi),
      ]),
    )
    expect(byName.Tenor).toEqual([67])
    expect(byName.Lead).toEqual([64])
    expect(byName.Bari).toEqual([60])
    expect(byName.Bass).toEqual([48])
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
    expect(r.project.notes[0]!.startTick).toBe(0)
    expect(r.project.notes[0]!.durationTicks).toBe(TAG_ROLL_PPQ)
  })

  it('right-aligns a short opening pickup so the next bar hits the meter grid', () => {
    // Sibelius-style incomplete first bar (pickup) then full bar at onset 0 —
    // must not clamp onset 0→1, and should pad the pickup into a full 3/4 bar.
    const xml = partwise(`
      <part-list><score-part id="P1"><part-name>Lead</part-name></score-part></part-list>
      <part id="P1">
        <measure number="1">
          <attributes>
            <divisions>256</divisions>
            <time><beats>3</beats><beat-type>4</beat-type></time>
          </attributes>
          <note>
            <pitch><step>A</step><octave>3</octave></pitch>
            <duration>128</duration><voice>1</voice><type>eighth</type>
          </note>
          <note>
            <pitch><step>C</step><octave>4</octave></pitch>
            <duration>128</duration><voice>1</voice><type>eighth</type>
          </note>
          <note>
            <pitch><step>E</step><octave>4</octave></pitch>
            <duration>128</duration><voice>1</voice><type>eighth</type>
          </note>
        </measure>
        <measure number="2">
          <note>
            <pitch><step>G</step><octave>4</octave></pitch>
            <duration>768</duration><voice>1</voice><type>half</type><dot/>
          </note>
        </measure>
      </part>
    `)
    const r = parseTagRollMusicXml(xml)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const notes = [...r.project.notes].sort((a, b) => a.startTick - b.startTick)
    // 3/4 = 1440; pickup (720) right-aligned → 720,960,1200; chorus downbeat 1440.
    expect(notes.map((n) => n.startTick)).toEqual([720, 960, 1200, 1440])
    expect(notes[3]!.durationTicks).toBe(1440)
    expect(notes.every((n) => n.startTick % (TAG_ROLL_PPQ / 2) === 0)).toBe(true)
  })

  it('rejects timewise scores', () => {
    const xml = `<?xml version="1.0"?><score-timewise></score-timewise>`
    const r = parseTagRollMusicXml(xml)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/timewise/i)
  })

  it.skipIf(!existsSync(MILL_STREAM))(
    'Mill Stream: explodes dual voices to TTBB and puts chorus on a barline',
    () => {
      const r = parseTagRollMusicXml(readFileSync(MILL_STREAM, 'utf8'))
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.project.parts.map((p) => p.name)).toEqual(['Tenor', 'Lead', 'Bari', 'Bass'])
      const counts = Object.fromEntries(
        r.project.parts.map((p) => [
          p.name,
          r.project.notes.filter((n) => n.partId === p.id).length,
        ]),
      )
      expect(counts.Tenor).toBeGreaterThan(40)
      expect(counts.Lead).toBeGreaterThan(40)
      expect(counts.Bari).toBeGreaterThan(40)
      expect(counts.Bass).toBeGreaterThan(40)

      const mLen = measureTicks(r.project.timeSignature, TAG_ROLL_PPQ)
      expect(mLen).toBe(1440)
      // First TTBB stack (“old”) must sit on a measure boundary.
      const chordTick = [...new Set(r.project.notes.map((n) => n.startTick))]
        .sort((a, b) => a - b)
        .find((t) => {
          const parts = new Set(
            r.project.notes.filter((n) => n.startTick === t).map((n) => n.partId),
          )
          return parts.size >= 4
        })
      expect(chordTick).toBe(1440)
      expect(chordTick! % mLen).toBe(0)
      // Pickup eighths sit in the prior bar (right-aligned anacrusis).
      const lead = r.project.parts.find((p) => p.name === 'Lead')!
      const pickup = r.project.notes
        .filter((n) => n.partId === lead.id && n.startTick < 1440)
        .sort((a, b) => a.startTick - b.startTick)
      expect(pickup.map((n) => n.startTick)).toEqual([720, 960, 1200])
    },
  )
})
