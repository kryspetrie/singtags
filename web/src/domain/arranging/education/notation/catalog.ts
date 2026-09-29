/**
 * Build TTBB chord miniatures for teaching (uses placeVoicing when possible).
 * Every non-highlight chord must cover the full tone set for its nature
 * (Dom9 omit-root covers 3–5–7–9).
 */
import {
  BARBERSHOP_CHORDS,
  placeVoicing,
  type ChordToneRole,
  type VoicingPitches,
} from '../../chords'
import type { NotationChord, NotationExample } from './types'

function pcsOf(midi: VoicingPitches): Set<number> {
  return new Set(
    [midi.bass, midi.bari, midi.lead, midi.tenor].map((m) => ((m % 12) + 12) % 12),
  )
}

function requiredPcs(natureId: string, rootPc: number): number[] {
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!nature) return []
  if (natureId === 'ninth') {
    // Teaching Dom9 omit-root voicing (5793): 5,7,9,3 — no root in the stack.
    return ([5, 7, 9, 3] as const)
      .map((role) => nature.offsets[role])
      .filter((o): o is number => o != null)
      .map((o) => (((rootPc + o) % 12) + 12) % 12)
  }
  return Object.values(nature.offsets)
    .filter((o): o is number => o != null)
    .map((o) => (((rootPc + o) % 12) + 12) % 12)
}

function leadMidiForRole(
  rootPc: number,
  natureId: string,
  voicing: string,
  preferMidi = 62,
): number {
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!nature || voicing.length < 3) return preferMidi
  const leadRole = Number(voicing[2]) as ChordToneRole
  const off = nature.offsets[leadRole]
  if (off == null) return preferMidi
  const pc = (((rootPc + off) % 12) + 12) % 12
  // Pick the octave of `pc` nearest preferMidi (typical Lead range).
  let midi = pc
  while (midi < preferMidi - 6) midi += 12
  while (midi > preferMidi + 6) midi -= 12
  return midi
}

function coversRequired(midi: VoicingPitches, natureId: string, rootPc: number): boolean {
  const have = pcsOf(midi)
  return requiredPcs(natureId, rootPc).every((pc) => have.has(pc))
}

/** Preferred voicings tried in order until placeVoicing yields a complete chord. */
const VOICING_TRIES: Record<string, readonly string[]> = {
  major: ['1351', '1531', '1513', '3151', '5135'],
  seventh: ['1357', '1753', '1537', '1735', '5317', '5713', '5137', '5731'],
  ninth: ['5793', '5397', '1793', '1379'],
  sixth: ['1361', '1163', '1365'],
  maj7: ['1573', '1375'],
  add9: ['1593', '1395'],
  minor: ['1351', '1531', '1513', '3151'],
  madd6: ['1563', '1356', '1653', '1635'],
  m7: ['1357', '1753', '1537', '1735', '5317'],
  aug: ['1351', '1153'],
  dim7: ['1375', '1735', '3715', '5713'],
}

/**
 * Build a complete TTBB teaching chord, or throw (catalog must not ship incomplete stacks).
 */
function chord(
  natureId: string,
  rootPc: number,
  label: string,
  quarters = 2,
  annotation?: string,
  preferLeadMidi = 62,
): NotationChord {
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!nature) throw new Error(`Unknown nature ${natureId} for ${label}`)
  const tries = VOICING_TRIES[natureId] ?? ['1351']
  for (const voicing of tries) {
    const leadMidi = leadMidiForRole(rootPc, natureId, voicing, preferLeadMidi)
    const midi = placeVoicing({ chord: nature, rootPc, leadMidi, voicing, spread: false })
    if (!midi) continue
    if (!coversRequired(midi, natureId, rootPc)) continue
    // Keep tenor above lead for TTBB teaching (except intentional bad examples).
    if (midi.tenor <= midi.lead) continue
    if (midi.bass >= midi.bari) continue
    return { label, quarters, midi, annotation }
  }
  throw new Error(`No complete voicing for ${label} (${natureId} root ${rootPc})`)
}

/** Circle-of-fifths highway into tonic: II7 → V7 → I */
export const EX_CIRCLE_FIFTHS: NotationExample = {
  id: 'ex-circle-fifths',
  title: 'Circle-of-fifths drive',
  caption: 'Descending fifths (II7–V7–I) — the barbershop harmonic highway into a pillar.',
  lessonIds: ['L-R1', 'L-f-secdom', 'L-step6'],
  glossaryIds: ['circle_fifths', 'secondary_dom', 'bs7', 'pillar', 'classic_cadences'],
  conceptCite: '1980 Manual / Approach Three Rule 1 (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    chord('seventh', 2, 'II7', 2, 'toward V', 62),
    chord('seventh', 7, 'V7', 2, 'toward I', 62),
    chord('major', 0, 'I', 2, 'pillar', 60),
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
    chord('seventh', 7, 'V7/I', 2, 'secondary dominant', 67),
    chord('major', 0, 'I', 2, 'pillar arrival', 60),
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
  chords: [chord('seventh', 0, 'I7', 4, undefined, 60)],
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
      // Complete C7 pcs, but tenor under the lead (intentional bad stack).
      midi: { bass: 48, bari: 52, lead: 67, tenor: 58 },
      highlight: { tenor: 'bad', lead: 'warn' },
      annotation: 'tenor below lead',
    },
  ],
}

/** Doubled root vs double third */
export const EX_DOUBLE_ROOT: NotationExample = {
  id: 'ex-double-root',
  title: 'Prefer double root on triads',
  caption: 'Major triad with root doubled — clearer lock than doubling the third.',
  lessonIds: ['L-doubles', 'L-complete'],
  glossaryIds: ['strong_voicing', 'lock_ring'],
  conceptCite: 'Rylander major triad / Approach Two (pedagogical miniature)',
  clef: 'ttbb',
  chords: [chord('major', 0, 'I (root×2)', 2, undefined, 60)],
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
      // Complete C triad pcs present, but third doubled (intentional weak stack).
      midi: { bass: 48, bari: 52, lead: 64, tenor: 67 },
      highlight: { bari: 'warn', lead: 'bad' },
      annotation: 'third doubled (tenor has 5th)',
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
    chord('major', 0, 'I PCF', 2, 'pillar', 60),
    chord('seventh', 7, 'V7 SCF', 1, 'passing', 62),
    chord('major', 0, 'I PCF', 2, 'pillar', 64),
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
  chords: [chord('ninth', 7, 'V9', 4, 'omit root', 62)],
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
    chord('major', 0, 'I', 2, 'springboard', 60),
    chord('seventh', 10, '♭VII7', 2, 'leap ok from I', 61),
  ],
}

/** Single BS7 in C — chord-tone makeup */
export const EX_BS7_MAKEUP: NotationExample = {
  id: 'ex-bs7-makeup',
  title: 'Barbershop seventh in C',
  caption: 'C7 = root, major 3rd, 5th, flat 7th — the classic lock-and-ring tetrad.',
  lessonIds: ['L-bs7', 'L-classic-cadences'],
  glossaryIds: ['bs7', 'lock_ring', 'classic_cadences'],
  conceptCite: 'Rylander BS7 / Prietto style blocks (pedagogical miniature)',
  clef: 'ttbb',
  chords: [chord('seventh', 0, 'C7', 4, '1–3–5–♭7', 60)],
}

/** Authentic cadence V7→I in C */
export const EX_AUTH_V7_I: NotationExample = {
  id: 'ex-auth-v7-i',
  title: 'Authentic cadence V7→I',
  caption: 'Lead ^5→^1 under G7→C — fundamental tension and release (B↑C, F↓E).',
  lessonIds: ['L-classic-cadences'],
  glossaryIds: [
    'classic_cadences',
    'tension_release',
    'leading_tone',
    'active_seventh',
    'bs7',
  ],
  conceptCite: '1980 Manual / Prietto cadences (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    chord('seventh', 7, 'G7', 2, 'V7 · Lead ^5', 67),
    chord('major', 0, 'C', 2, 'I · Lead ^1', 60),
  ],
}

/** Plagal IV→I */
export const EX_PLAGAL_IV_I: NotationExample = {
  id: 'ex-plagal-iv-i',
  title: 'Plagal cadence IV→I',
  caption: 'F→C (“amen”) — softer close than V7→I; still a classic textbook cadence.',
  lessonIds: ['L-classic-cadences'],
  glossaryIds: ['classic_cadences', 'tension_release'],
  conceptCite: 'Prietto / BAM plagal (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    chord('major', 5, 'F', 2, 'IV', 65),
    chord('major', 0, 'C', 2, 'I', 60),
  ],
}

/** Primary dominant I7→IV */
export const EX_I7_IV: NotationExample = {
  id: 'ex-i7-iv',
  title: 'Primary dominant I7→IV',
  caption: 'C7→F — I7 acts as V7 of IV (springboard into the subdominant).',
  lessonIds: ['L-classic-cadences', 'L-spring'],
  glossaryIds: ['classic_cadences', 'secondary_dom', 'springboard', 'bs7'],
  conceptCite: 'Approach Three / Prietto primary dominant (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    chord('seventh', 0, 'C7', 2, 'I7 = V7/IV', 60),
    chord('major', 5, 'F', 2, 'IV', 65),
  ],
}

/** Tritone counterparts */
export const EX_COUNTERPART: NotationExample = {
  id: 'ex-counterpart',
  title: 'Tritone counterparts',
  caption: 'C7 and F#7 share 3↔7 pitch-classes — Approach Three Rule 3 swap under the right melody.',
  lessonIds: ['L-counterpart', 'L-f-secdom'],
  glossaryIds: ['counterpart', 'bs7', 'secondary_dom'],
  conceptCite: '1980 Approach Three Rule 3 (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    chord('seventh', 0, 'C7', 2, undefined, 60),
    chord('seventh', 6, 'F#7', 2, 'tritone away', 61),
  ],
}

/** Contest eleven — major-family sonorities (Flinn / Rylander) */
export const EX_ELEVEN_MAJOR: NotationExample = {
  id: 'ex-eleven-major',
  title: 'Eleven chords — major family',
  caption:
    'Six major-tonality sonorities in C: triad, BS7, Dom9 (omit root), maj6, maj7, add9. Hear each stack.',
  lessonIds: ['L-eleven-chords'],
  glossaryIds: ['eleven_chords', 'bs7', 'omit_5'],
  conceptCite: 'Flinn 11 BBS chords / Rylander contest eleven (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    chord('major', 0, 'C', 2, '1 · Major triad', 60),
    chord('seventh', 0, 'C7', 2, '2 · Barbershop 7th', 60),
    chord('ninth', 0, 'C9', 2, '3 · Dom9 (omit root)', 62),
    chord('sixth', 0, 'C6', 2, '4 · Major 6th', 69),
    chord('maj7', 0, 'CM7', 2, '5 · Major 7th', 71),
    chord('add9', 0, 'Cadd9', 2, '6 · Major 9th (no 7)', 62),
  ],
}

/** Contest eleven — minor family */
export const EX_ELEVEN_MINOR: NotationExample = {
  id: 'ex-eleven-minor',
  title: 'Eleven chords — minor family',
  caption: 'Three minor-tonality colors in C: minor triad, minor 6th, minor 7th.',
  lessonIds: ['L-eleven-chords'],
  glossaryIds: ['eleven_chords'],
  conceptCite: 'Flinn 11 BBS chords / Rylander contest eleven (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    chord('minor', 0, 'Cm', 2, '7 · Minor triad', 60),
    chord('madd6', 0, 'Cm6', 2, '8 · Minor 6th', 69),
    chord('m7', 0, 'Cm7', 2, '9 · Minor 7th', 70),
  ],
}

/** Contest eleven — symmetrical */
export const EX_ELEVEN_SYM: NotationExample = {
  id: 'ex-eleven-sym',
  title: 'Eleven chords — symmetrical',
  caption: 'Augmented triad and diminished seventh — connecting / special-effect colors.',
  lessonIds: ['L-eleven-chords'],
  glossaryIds: ['eleven_chords'],
  conceptCite: 'Flinn 11 BBS chords / Rylander contest eleven (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    chord('aug', 0, 'C+', 2, '10 · Augmented', 68),
    chord('dim7', 0, 'Co7', 2, '11 · Diminished 7th', 60),
  ],
}

/** Circle highway with distance labels (teaching how to walk home) */
export const EX_CIRCLE_HOMECOMING: NotationExample = {
  id: 'ex-circle-homecoming',
  title: 'Circle homecoming (leap out, walk home)',
  caption:
    'From I, leap to a distant BS7, then fall by fifths: E7→A7→D7→G7→C. Each step cuts distance-from-home by one.',
  lessonIds: ['L-circle-fifths', 'L-R1'],
  glossaryIds: ['circle_fifths', 'secondary_dom', 'bs7', 'springboard'],
  conceptCite: 'Approach Three Rule 1 / circle-of-fifths highway (pedagogical miniature)',
  clef: 'ttbb',
  chords: [
    chord('major', 0, 'I', 1, 'home (dist 0)', 60),
    chord('seventh', 4, 'III7', 1, 'leap · dist 4', 64),
    chord('seventh', 9, 'VI7', 1, 'dist 3', 61),
    chord('seventh', 2, 'II7', 1, 'dist 2', 62),
    chord('seventh', 7, 'V7', 1, 'dist 1', 67),
    chord('major', 0, 'I', 2, 'home', 60),
  ],
}

export const NOTATION_EXAMPLES: readonly NotationExample[] = [
  EX_CIRCLE_FIFTHS,
  EX_CIRCLE_HOMECOMING,
  EX_SECONDARY_DOM,
  EX_TTBB_GOOD,
  EX_TTBB_BAD,
  EX_DOUBLE_ROOT,
  EX_DOUBLE_THIRD,
  EX_PCF_SCF,
  EX_DOM9,
  EX_SPRINGBOARD,
  EX_BS7_MAKEUP,
  EX_AUTH_V7_I,
  EX_PLAGAL_IV_I,
  EX_I7_IV,
  EX_COUNTERPART,
  EX_ELEVEN_MAJOR,
  EX_ELEVEN_MINOR,
  EX_ELEVEN_SYM,
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
