/**
 * @vitest-environment happy-dom
 *
 * Mill Stream MusicXML import regression: onset grid + pickup right-align.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTagRollMusicXml } from './musicxmlImport'
import { assignSheetStaves } from './sheetScore/assignStaves'
import { buildSheetRhythm } from './sheetScore/rhythmLayout'
import { melodyPartAtTick } from './melodyPass'
import { sheetEngraveLengthTicks } from './sheetScore/engraveLength'
import { measureTicks } from './tempoMap'
import { TAG_ROLL_PPQ } from './types'

const ORIG = resolve(
  __dirname,
  '../../../../polecats/mixed-musicxml/DOWN BY THE OLD MILL STREAM.musicxml.xml',
)

describe('Mill Stream MusicXML import', () => {
  it.skipIf(!existsSync(ORIG))('right-aligns pickup and stays on the eighth grid', () => {
    const imported = parseTagRollMusicXml(readFileSync(ORIG, 'utf8'))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    const { project } = imported

    expect(project.notes.filter((n) => n.startTick % 240 === 1)).toHaveLength(0)

    const lead = project.notes
      .filter((n) => project.parts.find((p) => p.id === n.partId)?.name === 'Lead')
      .sort((a, b) => a.startTick - b.startTick)
    expect(lead.slice(0, 5).map((n) => ({ t: n.startTick, ly: n.lyric }))).toEqual([
      { t: 720, ly: 'Down' },
      { t: 960, ly: 'by' },
      { t: 1200, ly: 'the' },
      { t: 1440, ly: 'old' },
      { t: 2880, ly: 'mill' },
    ])

    const assignment = assignSheetStaves(project.parts, project.clefFamily ?? 'ttbb', {
      melodyPartId: project.view.melodyPartId,
      notes: project.notes,
    })
    const mLen = measureTicks(project.timeSignature, TAG_ROLL_PPQ)
    const events = buildSheetRhythm({
      assignment,
      notes: project.notes,
      lengthTicks: sheetEngraveLengthTicks(project, mLen),
      timeSignature: project.timeSignature,
      ppq: TAG_ROLL_PPQ,
      melodyPartAt: (tick) => melodyPartAtTick(project, tick),
    })
    const sounding = events.filter((e) => e.concertMidi != null)
    const tuplets = sounding.filter((e) => e.tuplet)
    // On-grid 3/4 rhythms must not be mistaken for 3:2 tuplets.
    expect(sounding.length).toBeLessThan(350)
    expect(tuplets).toHaveLength(0)
  })
})
