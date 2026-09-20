/**
 * Barbershop chord vocabulary + voicing tables.
 * Inspired by znarf94/MuseScore_Barbershop_Harmonizer (reimplemented in TS).
 */
import type { TagRollClefFamily, TagRollMidiGroup } from '../types'
import {
  concertToWrittenMidi,
  writtenToConcertMidi,
} from '../sheetScore/writtenPitch'

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
  { id: 'ninth', name: 'ninth', notation: '9', offsets: { 1: 0, 3: 4, 5: 7, 7: 10, 9: 2 } },
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
  ninth: ['5793', '5397', '1793', '1379'],
  sixth: ['1361', '1163', '1365'],
  maj7: ['1573', '1375'],
  minor: ['1513', '1531', '1153', '1351', '1355', '3515', '3151', '5135', '5153'],
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

/**
 * Place TTBB octaves in a single pitch space (MuseScore's written-pitch space):
 * tenor above lead; bari below tenor (spread drops bari octave); bass below bari/lead.
 */
export function placeVoicing(opts: {
  chord: BarbershopChordNature
  rootPc: number
  leadMidi: number
  voicing: string
  spread?: boolean
}): VoicingPitches | null {
  const { chord, rootPc, leadMidi, voicing, spread } = opts
  if (voicing.length < 4) return null
  const roleAt = (i: number): ChordToneRole => Number(voicing[i]) as ChordToneRole
  const off = (role: ChordToneRole): number | undefined => chord.offsets[role]
  const bassOff = off(roleAt(0))
  const bariOff = off(roleAt(1))
  const leadOff = off(roleAt(2))
  const tenorOff = off(roleAt(3))
  if (bassOff == null || bariOff == null || leadOff == null || tenorOff == null) return null

  const lead = leadMidi
  let tenor = rootPc + tenorOff
  while (tenor <= lead) tenor += 12
  // match octave neighborhood of lead
  while (tenor > lead + 18) tenor -= 12

  let bari = rootPc + bariOff
  while (bari < lead) bari += 12
  if (bari >= tenor) bari -= 12
  if (spread) bari -= 12

  let bass = rootPc + bassOff
  while (bass < bari && bass < lead) bass += 12
  bass -= 12
  while (bass > bari) bass -= 12
  while (bass < bari - 24) bass += 12

  return { bass, bari, lead, tenor }
}

/**
 * Place a voicing and return concert MIDI for Tag Studio's piano roll.
 *
 * MuseScore's harmonizer anchors on written lead pitch (TTBB treble-8vb = concert+12).
 * Anchoring on concert lead without that offset drops bari/bass an octave relative to
 * the sheet / MuseScore register. Tenor stays in the lead's concert neighborhood.
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

  // Only TTBB upper (Lead/Tenor) uses an octave-transposing written pitch.
  if (!(clefFamily === 'ttbb' && melodyStaff === 'upper')) {
    return placeVoicing(opts)
  }

  const leadWritten = concertToWrittenMidi(opts.leadMidi, clefFamily, 'upper')
  const placed = placeVoicing({ ...opts, leadMidi: leadWritten })
  if (!placed) return null

  return {
    bass: writtenToConcertMidi(placed.bass, clefFamily, 'lower'),
    bari: writtenToConcertMidi(placed.bari, clefFamily, 'lower'),
    lead: writtenToConcertMidi(placed.lead, clefFamily, 'upper'),
    tenor: writtenToConcertMidi(placed.tenor, clefFamily, 'upper'),
  }
}

export function pcName(pc: number, flats: boolean): string {
  const names = flats
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  return names[((pc % 12) + 12) % 12]!
}
