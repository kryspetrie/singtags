/**
 * Build TTBB chord miniatures for teaching (uses placeVoicing when possible).
 */
import {
  BARBERSHOP_CHORDS,
  placeVoicing,
  type VoicingPitches,
} from '../../chords'
import type { NotationChord, NotationExample } from './types'

function chord(
  natureId: string,
  rootPc: number,
  leadMidi: number,
  voicing: string,
  label: string,
  quarters = 2,
  annotation?: string,
): NotationChord | null {
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!nature) return null
  const midi = placeVoicing({ chord: nature, rootPc, leadMidi, voicing, spread: false })
  if (!midi) return null
  return { label, quarters, midi, annotation }
}

function must(c: NotationChord | null, fallback: NotationChord): NotationChord {
  return c ?? fallback
}

const fallback = (label: string, midi: VoicingPitches, quarters = 2): NotationChord => ({
  label,
  quarters,
  midi,
})

/** Circle-of-fifths highway into tonic: II7 → V7 → I */
export const EX_CIRCLE_FIFTHS: NotationExample = {
  id: 'ex-circle-fifths',
  title: 'Circle-of-fifths drive',
  caption: 'Descending fifths (II7–V7–I) — the barbershop harmonic highway into a pillar.',
  lessonIds: ['L-R1', 'L-f-secdom', 'L-step6'],
  glossaryIds: ['circle_fifths', 'secondary_dom', 'bs7', 'pillar'],
  conceptCite: '1980 Manual / Approach Three Rule 1 (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    must(
      chord('seventh', 2, 62, '1357', 'II7', 2, 'toward V'),
      fallback('II7', { bass: 50, bari: 57, lead: 62, tenor: 66 }),
    ),
    must(
      chord('seventh', 7, 62, '1357', 'V7', 2, 'toward I'),
      fallback('V7', { bass: 43, bari: 59, lead: 62, tenor: 67 }),
    ),
    must(
      chord('major', 0, 60, '1351', 'I', 2, 'pillar'),
      fallback('I', { bass: 48, bari: 52, lead: 60, tenor: 67 }),
    ),
  ],
}

/** Secondary dominant into next pillar */
export const EX_SECONDARY_DOM: NotationExample = {
  id: 'ex-secondary-dom',
  title: 'Secondary dominant into a pillar',
  caption: 'A BS7 rooted a fifth above the next pillar drives the harmony home.',
  lessonIds: ['L-secdom', 'L-f-secdom', 'L-step6'],
  glossaryIds: ['secondary_dom', 'bs7', 'pillar'],
  conceptCite: 'Prietto / Approach Three R1 (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    must(
      chord('seventh', 7, 62, '1753', 'V7/I', 2, 'secondary dominant'),
      fallback('V7/I', { bass: 43, bari: 53, lead: 62, tenor: 67 }),
    ),
    must(
      chord('major', 0, 60, '1531', 'I', 2, 'pillar arrival'),
      fallback('I', { bass: 48, bari: 55, lead: 60, tenor: 64 }),
    ),
  ],
}

/** Good TTBB stack vs tenor-below-lead */
export const EX_TTBB_GOOD: NotationExample = {
  id: 'ex-ttbb-good',
  title: 'TTBB stack (good)',
  caption: 'Tenor above lead, bass at the bottom — the characteristic barbershop stack.',
  lessonIds: ['L-ttbb', 'L-step8'],
  glossaryIds: ['ttbb'],
  conceptCite: '1980 Manual voicing (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    must(chord('seventh', 0, 60, '1357', 'I7', 4), fallback('I7', { bass: 48, bari: 52, lead: 60, tenor: 70 })),
  ],
}

export const EX_TTBB_BAD: NotationExample = {
  id: 'ex-ttbb-bad',
  title: 'Tenor below lead (avoid)',
  caption: 'Same harmony with tenor under the lead — flagged by voice-leading QA.',
  lessonIds: ['L-ttbb', 'L-step8'],
  glossaryIds: ['ttbb'],
  conceptCite: '1980 Manual voicing contrast (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    {
      label: 'I7 ✗',
      quarters: 4,
      midi: { bass: 48, bari: 52, lead: 60, tenor: 55 },
      highlight: { tenor: 'bad', lead: 'warn' },
      annotation: 'tenor below lead',
    },
  ],
}

/** Doubled third vs double root */
export const EX_DOUBLE_ROOT: NotationExample = {
  id: 'ex-double-root',
  title: 'Prefer double root on triads',
  caption: 'Major triad with root doubled — clearer lock than doubling the third.',
  lessonIds: ['L-doubles', 'L-complete'],
  glossaryIds: ['strong_voicing', 'lock_ring'],
  conceptCite: 'Rylander major triad / Approach Two (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    must(chord('major', 0, 60, '1351', 'I (root×2)', 2), fallback('I', { bass: 48, bari: 52, lead: 60, tenor: 67 })),
  ],
}

export const EX_DOUBLE_THIRD: NotationExample = {
  id: 'ex-double-third',
  title: 'Doubled third (weak)',
  caption: 'Two voices on the third muddy the triad — our doubled-third lint teaches this.',
  lessonIds: ['L-doubles'],
  glossaryIds: ['strong_voicing'],
  conceptCite: 'Rylander / Prietto doubles (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    {
      label: 'I ✗',
      quarters: 2,
      midi: { bass: 48, bari: 52, lead: 64, tenor: 64 },
      highlight: { bari: 'warn', lead: 'bad', tenor: 'bad' },
      annotation: 'third doubled',
    },
  ],
}

/** PCF pillar vs SCF passing */
export const EX_PCF_SCF: NotationExample = {
  id: 'ex-pcf-scf',
  title: 'Pillar PCF then SCF passing',
  caption: 'Structural I, then a passing V7/II color, returning toward the pillar story.',
  lessonIds: ['L-step3', 'L-step5', 'L-f-primary'],
  glossaryIds: ['pcf', 'scf', 'pillar', 'pmn', 'smn'],
  conceptCite: '1980 Approach Two Steps III–V (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    must(chord('major', 0, 60, '1351', 'I PCF', 2, 'pillar'), fallback('I', { bass: 48, bari: 52, lead: 60, tenor: 67 })),
    must(
      chord('seventh', 7, 62, '1357', 'V7 SCF', 1, 'passing'),
      fallback('V7', { bass: 43, bari: 59, lead: 62, tenor: 67 }),
    ),
    must(chord('major', 0, 64, '1531', 'I PCF', 2, 'pillar'), fallback('I', { bass: 48, bari: 55, lead: 64, tenor: 67 })),
  ],
}

/** Dom9 fuller vs thin */
export const EX_DOM9: NotationExample = {
  id: 'ex-dom9',
  title: 'Dominant ninth (four voices)',
  caption: 'Five pitch-classes → omit root (Prietto/BAM) or 5th (Rylander) so TTBB can sing the color chord.',
  lessonIds: ['L-dom9'],
  glossaryIds: ['bs7', 'omit_5'],
  conceptCite: 'Prietto/BAM omit-root vs Rylander omit-5 (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    must(chord('ninth', 7, 62, '5793', 'V9', 4, 'omit root'), fallback('V9', { bass: 50, bari: 59, lead: 62, tenor: 65 })),
  ],
}

/** Springboard I leaping */
export const EX_SPRINGBOARD: NotationExample = {
  id: 'ex-springboard',
  title: 'Springboard from I',
  caption: 'I may leap freely (springboard); afterward normal progression rules resume.',
  lessonIds: ['L-spring', 'L-f-motion'],
  glossaryIds: ['springboard', 'circle_fifths'],
  conceptCite: '1980 Approach Three axiom (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    must(chord('major', 0, 60, '1351', 'I', 2, 'springboard'), fallback('I', { bass: 48, bari: 52, lead: 60, tenor: 67 })),
    must(chord('seventh', 10, 61, '1357', '♭VII7', 2, 'leap ok from I'), fallback('bVII7', { bass: 46, bari: 56, lead: 61, tenor: 65 })),
  ],
}

export const NOTATION_EXAMPLES: readonly NotationExample[] = [
  EX_CIRCLE_FIFTHS,
  EX_SECONDARY_DOM,
  EX_TTBB_GOOD,
  EX_TTBB_BAD,
  EX_DOUBLE_ROOT,
  EX_DOUBLE_THIRD,
  EX_PCF_SCF,
  EX_DOM9,
  EX_SPRINGBOARD,
]

export function notationExampleById(id: string): NotationExample | undefined {
  return NOTATION_EXAMPLES.find((e) => e.id === id)
}

export function notationExamplesForLesson(lessonId: string): NotationExample[] {
  return NOTATION_EXAMPLES.filter((e) => e.lessonIds.includes(lessonId))
}

export function notationExamplesForGlossary(glossaryId: string): NotationExample[] {
  return NOTATION_EXAMPLES.filter((e) => e.glossaryIds.includes(glossaryId))
}
