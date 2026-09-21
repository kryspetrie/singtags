/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../types'
import { BARBERSHOP_CHORDS, placeVoicing } from '../chords'
import { projectToScoreModel } from '../musicxml/projectToScoreModel'
import { scoreModelToMusicXml } from '../../../adapters/arranging/musicxml/arrangementMusicXmlExporter'
import { createArrangementMusicXmlExporter } from '../../../adapters/arranging/musicxml/createMusicXmlExporter'
import { exportMusicXml } from '../../../application/arranging/ExportMusicXml'
import { midiToMusicXmlPitch } from '../musicxml/scoreModel'
import { dom9OmitStrategy, VOICINGS_BY_CHORD } from '../chords'

function arranged() {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!
  const midi = placeVoicing({ chord, rootPc: 0, leadMidi: 60, voicing: '1537' })!
  const p = createEmptyArrangement('XML Test', { id: 'arr_x', now: 1 })
  p.preferFlats = true
  p.melody = [
    { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn', lyric: 'Hi' },
  ]
  p.stacks = [
    {
      id: 's1',
      startTick: 0,
      durationTicks: 480,
      rootPc: 0,
      natureId: 'seventh',
      voicing: '1537',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      pillarId: null,
      midi,
      ruleTags: [],
    },
  ]
  return p
}

describe('MusicXML export', () => {
  it('maps MIDI pitch with flats', () => {
    expect(midiToMusicXmlPitch(61, true)).toEqual({ step: 'D', alter: -1, octave: 4 })
  })

  it('exports TTBB score-partwise with clefs and lyrics', () => {
    const model = projectToScoreModel(arranged(), 'ttbb')
    expect(model.parts).toHaveLength(2)
    expect(model.parts[0]!.clef).toBe('treble8vb')
    expect(model.parts[1]!.clef).toBe('bass')
    const xml = scoreModelToMusicXml(model)
    expect(xml).toContain('<score-partwise version="3.1">')
    expect(xml).toContain('clef-octave-change')
    expect(xml).toContain('<sign>F</sign>')
    expect(xml).toContain('<text>Hi</text>')
    expect(xml).toContain('XML Test')
  })

  it('perPart layout emits four parts', () => {
    const model = projectToScoreModel(arranged(), 'perPart')
    expect(model.parts.map((p) => p.name)).toEqual(['Tenor', 'Lead', 'Bari', 'Bass'])
  })

  it('ExportMusicXml use-case returns xml via port', () => {
    const result = exportMusicXml(arranged(), createArrangementMusicXmlExporter())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.xml).toContain('score-partwise')
  })

  it('orders Dom9 omit-root before omit-5 in voicing table (Prietto/BAM preference)', () => {
    expect(VOICINGS_BY_CHORD.ninth![0]!.startsWith('5')).toBe(true)
    expect(dom9OmitStrategy('5793')).toBe('omitRoot')
    expect(dom9OmitStrategy('1793')).toBe('omit5')
  })
})
