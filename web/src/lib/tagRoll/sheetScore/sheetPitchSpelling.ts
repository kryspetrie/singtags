/**
 * Pitch spelling for sheet engraving: chord-stack tones set letter + accidental
 * together (G# vs Ab), not a flat/sharp tacked onto a preferFlats letter.
 */
import { accidentalBiasForRootInKey } from '../../../domain/arranging/secondaryDominant'
import type { TonalityMode } from '../../../domain/arranging/types'
import {
  BARBERSHOP_CHORDS,
  pcName,
  type ChordToneRole,
} from '../harmonizer/chords'
import { isBlankSketchQuality, sketchSpanAtTick } from '../harmonySketch'
import { midiToMusicXmlPitch } from '../midiPitch'
import type { SheetChordDetectSegment } from '../sheetChordMarks'
import type { TagRollProject } from '../types'
import { preferFlatsAtTick, sheetKeyAtTick } from './sheetAccidentals'

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
const NAT_PC = [0, 2, 4, 5, 7, 9, 11] as const

/** Diatonic letter steps from the chord root for each tone role. */
const ROLE_LETTER_STEPS: Record<ChordToneRole, number> = {
  1: 0,
  3: 2,
  5: 4,
  6: 5,
  7: 6,
  9: 1,
}

const ROLE_PREF: ChordToneRole[] = [1, 3, 5, 7, 6, 9]

export type SpelledPitch = {
  step: string
  alter: number
  octave: number
}

export type ChordSpellContext = {
  rootPc: number
  quality: string
}

function parsePcName(name: string): { step: string; alter: number } | null {
  const m = /^([A-G])(#{1,2}|b{1,2})?$/.exec(name.trim())
  if (!m) return null
  const step = m[1]!
  const acc = m[2] ?? ''
  let alter = 0
  if (acc === '#') alter = 1
  else if (acc === '##') alter = 2
  else if (acc === 'b') alter = -1
  else if (acc === 'bb') alter = -2
  return { step, alter }
}

/** Root letter/accidental using key-aware bias (same as chord labels). */
export function spellChordRoot(
  rootPc: number,
  preferFlats: boolean,
  tonality?: number,
  tonalityMode: TonalityMode = 'major',
): SpelledPitch {
  let flats = preferFlats
  if (tonality != null) {
    const bias = accidentalBiasForRootInKey(rootPc, tonality, tonalityMode)
    if (bias != null) flats = bias
  }
  const parsed = parsePcName(pcName(((rootPc % 12) + 12) % 12, flats))
  if (!parsed) {
    const fb = midiToMusicXmlPitch(60 + (((rootPc % 12) + 12) % 12), flats)
    return { step: fb.step, alter: fb.alter, octave: 4 }
  }
  return { step: parsed.step, alter: parsed.alter, octave: 4 }
}

/**
 * Spell a concert/written MIDI from a chord stack: matching chord tones use the
 * root's letter + role interval (so E7 → G#, Ab7 → Ab on the same MIDI 8).
 * Non-chord tones fall back to preferFlats spelling.
 */
export function spellMidiFromChord(
  midi: number,
  chord: ChordSpellContext,
  preferFlats: boolean,
  opts?: { tonality?: number; tonalityMode?: TonalityMode },
): SpelledPitch {
  const n = Math.max(0, Math.min(127, Math.round(midi)))
  const pc = ((n % 12) + 12) % 12
  const rootPc = ((chord.rootPc % 12) + 12) % 12
  const nature =
    BARBERSHOP_CHORDS.find((c) => c.id === chord.quality) ??
    BARBERSHOP_CHORDS.find((c) => c.id === 'major')!

  const matches: ChordToneRole[] = []
  for (const role of ROLE_PREF) {
    const off = nature.offsets[role]
    if (off == null) continue
    if ((rootPc + off) % 12 === pc) matches.push(role)
  }
  if (!matches.length) {
    return midiToMusicXmlPitch(n, preferFlats)
  }

  const role = matches[0]!
  const root = spellChordRoot(rootPc, preferFlats, opts?.tonality, opts?.tonalityMode ?? 'major')
  const rootIdx = STEPS.indexOf(root.step as (typeof STEPS)[number])
  if (rootIdx < 0) return midiToMusicXmlPitch(n, preferFlats)

  const stepIdx = (rootIdx + ROLE_LETTER_STEPS[role]) % 7
  const step = STEPS[stepIdx]!
  const natPc = NAT_PC[stepIdx]!
  const alter = ((pc - natPc + 6) % 12) - 6
  // Keep chord-letter spelling only for single accidentals. Dim7 sevenths
  // (Bbb/Ebb/…) are theoretically a 7th below the root letter, but barbershop
  // charts almost never want double flats/sharps — prefer key-friendly spelling.
  if (alter > 1 || alter < -1) {
    return midiToMusicXmlPitch(n, preferFlats)
  }
  const octave = (n - alter - natPc) / 12 - 1
  if (!Number.isInteger(octave)) {
    return midiToMusicXmlPitch(n, preferFlats)
  }
  return { step, alter, octave }
}

/** Locked sketch first, then any sketch span, then detected segment. */
export function chordSpellContextAtTick(
  project: TagRollProject,
  tick: number,
  detectSegments?: readonly SheetChordDetectSegment[] | null,
): ChordSpellContext | null {
  const sketch = project.harmonySketch ?? []
  const locked = sketch
    .filter((s) => s.locked && !isBlankSketchQuality(s.quality))
    .sort((a, b) => a.startTick - b.startTick)
    .find((s) => s.startTick <= tick && tick < s.endTick)
  if (locked) return { rootPc: locked.rootPc, quality: locked.quality }

  const any = sketchSpanAtTick(sketch, tick)
  if (any && !isBlankSketchQuality(any.quality)) {
    return { rootPc: any.rootPc, quality: any.quality }
  }

  const det = (detectSegments ?? []).find(
    (s) =>
      s.startTick <= tick &&
      tick < s.endTick &&
      s.rootPc != null &&
      Number.isFinite(s.rootPc),
  )
  if (det && det.rootPc != null) {
    const q = (det.quality || '').trim()
    if (q && !isBlankSketchQuality(q)) {
      return { rootPc: ((det.rootPc % 12) + 12) % 12, quality: q }
    }
  }
  return null
}

/** Written MIDI → step/alter/octave using chord stack when available. */
export function spellWrittenMidi(
  writtenMidi: number,
  project: TagRollProject,
  tick: number,
  detectSegments?: readonly SheetChordDetectSegment[] | null,
): SpelledPitch {
  const flats = preferFlatsAtTick(project, tick)
  const key = sheetKeyAtTick(project, tick)
  const chord = chordSpellContextAtTick(project, tick, detectSegments)
  if (chord) {
    return spellMidiFromChord(writtenMidi, chord, flats, {
      tonality: key.tonality,
      tonalityMode: key.tonalityMode,
    })
  }
  return midiToMusicXmlPitch(writtenMidi, flats)
}

export function spelledPitchToVexKey(p: SpelledPitch): string {
  let acc = ''
  if (p.alter === 1) acc = '#'
  else if (p.alter === 2) acc = '##'
  else if (p.alter === -1) acc = 'b'
  else if (p.alter === -2) acc = 'bb'
  return `${p.step.toLowerCase()}${acc}/${p.octave}`
}
