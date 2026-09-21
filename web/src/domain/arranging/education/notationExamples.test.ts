/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  NOTATION_EXAMPLES,
  notationExamplesForLesson,
  EX_CIRCLE_FIFTHS,
  EX_TTBB_BAD,
  notationExampleToAbc,
  midiToAbcPitch,
} from './notation'
import { teachLint, teachWizardStep } from './explain'
import { createAbcjsNotationRenderer } from '../../../adapters/arranging/notation/abcjsRenderer'

describe('notation examples (abcjs)', () => {
  it('catalog has pedagogical miniatures with TTBB midi', () => {
    expect(NOTATION_EXAMPLES.length).toBeGreaterThanOrEqual(8)
    for (const ex of NOTATION_EXAMPLES) {
      expect(ex.clef).toBe('ttbb')
      expect(ex.chords.length).toBeGreaterThan(0)
    }
  })

  it('converts MIDI to ABC pitches', () => {
    expect(midiToAbcPitch(60)).toBe('C')
    expect(midiToAbcPitch(48)).toBe('C,')
    expect(midiToAbcPitch(72)).toBe('c')
  })

  it('emits ABC with tenor staff (treble-8) and bass staff', () => {
    const abc = notationExampleToAbc(EX_CIRCLE_FIFTHS)
    expect(abc).toContain('clef=treble-8')
    expect(abc).toContain('clef=bass')
    expect(abc).toContain('%%score (T L) | (Br B)')
    expect(abc).toContain('[V:T]')
    expect(abc).toContain('[V:L]')
    expect(abc).toContain('[V:Br]')
    expect(abc).toContain('[V:B]')
  })

  it('abcjs renderer draws SVG from ABC', () => {
    const renderer = createAbcjsNotationRenderer()
    const abc = notationExampleToAbc(EX_CIRCLE_FIFTHS)
    const svg = renderer.renderSvg(abc)
    expect(svg).toContain('<svg')
    expect(svg.length).toBeGreaterThan(200)
  })

  it('bad TTBB example marks tenor below lead in data', () => {
    expect(EX_TTBB_BAD.chords[0]!.highlight?.tenor).toBe('bad')
    expect(EX_TTBB_BAD.chords[0]!.midi.tenor).toBeLessThan(EX_TTBB_BAD.chords[0]!.midi.lead)
  })

  it('lessons attach ABC (and SVG when renderer provided)', () => {
    const forR1 = notationExamplesForLesson('L-R1')
    expect(forR1.some((e) => e.id === 'ex-circle-fifths')).toBe(true)
    const lint = teachLint('voice-leading', undefined, createAbcjsNotationRenderer())
    expect(lint.notation?.some((n) => n.abc.includes('treble-8'))).toBe(true)
    expect(lint.notation?.some((n) => n.svg?.includes('svg'))).toBe(true)
  })

  it('wizard strengthen step surfaces secondary-dom art as ABC', () => {
    const m = teachWizardStep('step6_alts')
    expect(m?.notation?.length).toBeGreaterThan(0)
    expect(m?.notation?.[0]?.abc).toContain('clef=treble-8')
  })
})
