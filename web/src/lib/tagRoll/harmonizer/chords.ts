/**
 * Barbershop chord vocabulary + voicing tables for Tag Studio Harmonize.
 * Placement prefers closed, mid–high TTBB shells (less muddy bass).
 * Catalog inspired by znarf94/MuseScore_Barbershop_Harmonizer (reimplemented in TS).
 */
import type { TagRollClefFamily, TagRollMidiGroup } from '../types'
import {
  placeVoicing as placeVoicingDomain,
  placeVoicingConcert as placeVoicingConcertDomain,
  settleDistinctTtbb,
  type BarbershopChordNature as DomainChordNature,
  type VoicingPitches as DomainVoicingPitches,
} from '../../../domain/arranging/chords/chords'

export type ChordToneRole = 1 | 3 | 5 | 6 | 7 | 9

export type BarbershopChordNature = {
  id: string
  name: string
  notation: string
  /** Chord-tone role → semitone offset from root. */
  offsets: Partial<Record<ChordToneRole, number>>
}

export const BARBERSHOP_CHORDS: BarbershopChordNature[] = [
  { id: 'major', name: 'major', notation: '', offsets: { 1: 0, 3: 4, 5: 7 } },
  { id: 'seventh', name: 'seventh', notation: '7', offsets: { 1: 0, 3: 4, 5: 7, 7: 10 } },
  {
    id: 'half-dim',
    name: 'half-diminished seventh',
    notation: 'ø7',
    offsets: { 1: 0, 3: 3, 5: 6, 7: 10 },
  },
  { id: 'aug', name: 'augmented', notation: '+', offsets: { 1: 0, 3: 4, 5: 8 } },
  { id: 'ninth', name: 'ninth', notation: '7(9)', offsets: { 1: 0, 3: 4, 5: 7, 7: 10, 9: 2 } },
  { id: 'sixth', name: 'sixth', notation: '6', offsets: { 1: 0, 3: 4, 5: 7, 6: 9 } },
  { id: 'maj7', name: 'major seventh', notation: 'M7', offsets: { 1: 0, 3: 4, 5: 7, 7: 11 } },
  { id: 'minor', name: 'minor', notation: 'm', offsets: { 1: 0, 3: 3, 5: 7 } },
  { id: 'm7', name: 'minor seventh', notation: 'm7', offsets: { 1: 0, 3: 3, 5: 7, 7: 10 } },
  { id: 'dim7', name: 'diminished seventh', notation: 'o7', offsets: { 1: 0, 3: 3, 5: 6, 7: 9 } },
  { id: 'dim', name: 'diminished', notation: 'o', offsets: { 1: 0, 3: 3, 5: 6 } },
  { id: 'add9', name: 'major with added ninth', notation: 'add9', offsets: { 1: 0, 3: 4, 5: 7, 9: 2 } },
  { id: 'madd6', name: 'minor with added sixth', notation: 'madd6', offsets: { 1: 0, 3: 3, 5: 7, 6: 9 } },
]

/** Voicing strings: bass | bari | lead | tenor chord-tone roles (chars '1','3','5','6','7','9'). */
export const VOICINGS_BY_CHORD: Record<string, string[]> = {
  major: ['1513', '1531', '1153', '1351', '1355', '3515', '3151', '3155', '5135', '5153', '5351'],
  seventh: [
    '5317',
    '5713',
    '1537',
    '1735',
    '5137',
    '5731',
    '1357',
    '1753',
    '1375',
    '1573',
    '5173',
    '5371',
  ],
  'half-dim': ['5317', '5713', '1537', '1735', '1357', '1753'],
  aug: ['1153', '1351'],
  /**
   * Dom9: omit-root (bass=5) first — Prietto/BAM; omit-5 (bass=1) also legal.
   * Keep in sync with domain/arranging/chords/chords.ts.
   */
  ninth: ['5793', '5397', '1793', '1379', '1759', '5973', '1973', '3759'],
  sixth: ['1361', '1163', '1365'],
  maj7: ['1573', '1375'],
  // Same triad shells as major / MuseScore plugin (incl. 3155, 5351).
  minor: ['1513', '1531', '1153', '1351', '1355', '3515', '3151', '3155', '5135', '5153', '5351'],
  m7: ['5317', '5713', '1537', '1735', '1357', '1753'],
  dim7: ['1375', '1735', '3715', '5713'],
  dim: ['1351'],
  add9: ['1593', '1395'],
  madd6: ['1563', '1356', '1653', '1635'],
}

export const ROOT_OFFSETS = [
  { name: 'I', offset: 0 },
  { name: 'II', offset: 2 },
  { name: 'III', offset: 4 },
  { name: 'IV', offset: 5 },
  { name: 'V', offset: 7 },
  { name: 'VI', offset: 9 },
  { name: 'VII', offset: 11 },
  { name: '', offset: 6 },
  { name: '', offset: 8 },
  { name: '', offset: 10 },
  { name: '', offset: 1 },
  { name: '', offset: 3 },
] as const

export function chordContainsLead(
  chord: BarbershopChordNature,
  rootPc: number,
  leadMidi: number,
): boolean {
  const leadPc = ((leadMidi % 12) + 12) % 12
  return Object.values(chord.offsets).some(
    (off) => off != null && (((rootPc + off) % 12) + 12) % 12 === leadPc,
  )
}

export function leadRoleInChord(
  chord: BarbershopChordNature,
  rootPc: number,
  leadMidi: number,
): ChordToneRole | null {
  const leadPc = ((leadMidi % 12) + 12) % 12
  for (const [role, off] of Object.entries(chord.offsets)) {
    if (off != null && (((rootPc + off) % 12) + 12) % 12 === leadPc) {
      return Number(role) as ChordToneRole
    }
  }
  return null
}

export function voicingFitsLead(voicing: string, leadRole: ChordToneRole): boolean {
  if (voicing.length < 4) return false
  return Number(voicing[2]) === leadRole
}

export type VoicingPitches = {
  bass: number
  bari: number
  lead: number
  tenor: number
}

function asDomainChord(chord: BarbershopChordNature): DomainChordNature {
  return chord as unknown as DomainChordNature
}

/**
 * Place TTBB in one pitch space — closed shell: bari under lead, tenor ≤ octave above.
 * Delegates to arranging placement so Harmonize matches Coach / Path Optimize.
 */
export function placeVoicing(opts: {
  chord: BarbershopChordNature
  rootPc: number
  leadMidi: number
  voicing: string
  spread?: boolean
}): VoicingPitches | null {
  return placeVoicingDomain({
    chord: asDomainChord(opts.chord),
    rootPc: opts.rootPc,
    leadMidi: opts.leadMidi,
    voicing: opts.voicing,
    spread: opts.spread,
  }) as DomainVoicingPitches | null
}

/**
 * Place a voicing and return concert MIDI for Tag Studio's piano roll.
 * TTBB Lead/Tenor use written = concert+12 so bari/bass sit in a ringing register
 * (not an octave too low / muddy).
 */
export function placeVoicingConcert(opts: {
  chord: BarbershopChordNature
  rootPc: number
  /** Concert MIDI of the melody (anchor) note. */
  leadMidi: number
  voicing: string
  spread?: boolean
  clefFamily?: TagRollClefFamily
  /** Staff of the melody part. Default upper (Lead/Tenor). */
  melodyStaff?: TagRollMidiGroup
}): VoicingPitches | null {
  const clefFamily = opts.clefFamily ?? 'ttbb'
  const melodyStaff = opts.melodyStaff ?? 'upper'

  // TTBB upper melody: same written-space path as arranging (clears mud + unisons).
  if (clefFamily === 'ttbb' && melodyStaff === 'upper') {
    return placeVoicingConcertDomain({
      chord: asDomainChord(opts.chord),
      rootPc: opts.rootPc,
      leadMidi: opts.leadMidi,
      voicing: opts.voicing,
      spread: opts.spread,
    }) as DomainVoicingPitches | null
  }

  // SSAA / lower-staff melody: place in concert space, then settle.
  const placed = placeVoicing(opts)
  if (!placed) return null
  return settleDistinctTtbb(placed)
}

/** Soft score for Harmonize defaults: closed outer span + higher register (ring). */
export function closedHighRingScore(midi: VoicingPitches): number {
  const outer = midi.tenor - midi.bass
  const upperTrio =
    Math.max(midi.bari, midi.lead, midi.tenor) - Math.min(midi.bari, midi.lead, midi.tenor)
  let score = 0
  if (outer <= 12) score += 4
  else if (outer <= 16) score += 1.5
  else if (outer <= 21) score -= 1
  else score -= 3
  if (upperTrio <= 12) score += 2.5
  else if (upperTrio <= 16) score += 0.5
  else score -= 1.5
  // Prefer bass out of the mud and toward a brighter mid register.
  if (midi.bass >= 48 && midi.bass <= 58) score += 2
  else if (midi.bass >= 45 && midi.bass < 48) score += 0.5
  else if (midi.bass < 45) score -= (45 - midi.bass) * 0.35
  const mean = (midi.bass + midi.bari + midi.lead + midi.tenor) / 4
  if (mean >= 58) score += 1.2
  else if (mean >= 54) score += 0.5
  else if (mean < 50) score -= 0.8
  return score
}

/** Sort voicing strings so Harmonize defaults / ↑↓ prefer closed high-ring shells. */
export function orderVoicingsClosedHighRing(opts: {
  chord: BarbershopChordNature
  rootPc: number
  leadMidi: number
  voicings: readonly string[]
  spread?: boolean
  clefFamily?: TagRollClefFamily
  melodyStaff?: TagRollMidiGroup
}): string[] {
  const scored = opts.voicings.map((v, i) => {
    const midi = placeVoicingConcert({
      chord: opts.chord,
      rootPc: opts.rootPc,
      leadMidi: opts.leadMidi,
      voicing: v,
      spread: opts.spread,
      clefFamily: opts.clefFamily,
      melodyStaff: opts.melodyStaff,
    })
    const score = midi ? closedHighRingScore(midi) : -999
    return { v, score, i }
  })
  scored.sort((a, b) => b.score - a.score || a.i - b.i)
  return scored.map((s) => s.v)
}

export function pcName(pc: number, flats: boolean): string {
  const names = flats
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  return names[((pc % 12) + 12) % 12]!
}
