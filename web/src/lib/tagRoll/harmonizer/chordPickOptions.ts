/**
 * One-click Harmonize chord options (root + quality together).
 * Valid = lead is a chord tone; More = remaining catalog for browsing.
 */
import { romanForChord } from '../../../domain/arranging/secondaryDominant'
import type { TonalityMode } from '../../../domain/arranging/types'
import {
  BARBERSHOP_CHORDS,
  ROOT_OFFSETS,
  chordContainsLead,
  pcName,
  type BarbershopChordNature,
} from './chords'

export type HarmonizeChordOption = {
  rootOffset: number
  rootPc: number
  chordId: string
  /** Absolute label e.g. C, G7, Am */
  name: string
  /** Roman e.g. I, V7, vi */
  roman: string
  /** Lead is a tone of this chord. */
  validForLead: boolean
  /** Root is a diatonic scale degree (named ROOT_OFFSETS entry). */
  diatonicRoot: boolean
}

const NATURE_ORDER = BARBERSHOP_CHORDS.map((c) => c.id)

function natureRank(id: string): number {
  const i = NATURE_ORDER.indexOf(id)
  return i >= 0 ? i : 99
}

export function buildHarmonizeChordOptions(opts: {
  tonality: number
  mode?: TonalityMode
  preferFlats: boolean
  leadMidi: number | null
  /** When true, primary list ignores lead-in-chord filter (declare anything). */
  chordOnly?: boolean
}): { primary: HarmonizeChordOption[]; more: HarmonizeChordOption[] } {
  const mode = opts.mode ?? 'major'
  const tonality = ((opts.tonality % 12) + 12) % 12
  const all: HarmonizeChordOption[] = []

  for (const r of ROOT_OFFSETS) {
    const rootPc = (((tonality + r.offset) % 12) + 12) % 12
    const diatonicRoot = !!r.name
    for (const chord of BARBERSHOP_CHORDS) {
      const validForLead =
        opts.leadMidi == null
          ? true
          : chordContainsLead(chord, rootPc, opts.leadMidi)
      const name = `${pcName(rootPc, opts.preferFlats)}${chord.notation || ''}` || pcName(rootPc, opts.preferFlats)
      const roman = romanForChord({
        rootPc,
        natureId: chord.id,
        tonality,
        mode,
      })
      all.push({
        rootOffset: r.offset,
        rootPc,
        chordId: chord.id,
        name: name || 'maj',
        roman,
        validForLead,
        diatonicRoot,
      })
    }
  }

  const sortOpts = (a: HarmonizeChordOption, b: HarmonizeChordOption) => {
    if (a.diatonicRoot !== b.diatonicRoot) return a.diatonicRoot ? -1 : 1
    if (a.rootOffset !== b.rootOffset) return a.rootOffset - b.rootOffset
    return natureRank(a.chordId) - natureRank(b.chordId)
  }

  if (opts.chordOnly || opts.leadMidi == null) {
    const diatonic = all.filter((o) => o.diatonicRoot).sort(sortOpts)
    const chromatic = all.filter((o) => !o.diatonicRoot).sort(sortOpts)
    // Chord-only: show common diatonic natures first (maj/7/m/m7), rest in More.
    const common = new Set(['major', 'seventh', 'minor', 'm7', 'maj7', 'dim', 'dim7', 'half-dim'])
    const primary = diatonic.filter((o) => common.has(o.chordId))
    const more = [
      ...diatonic.filter((o) => !common.has(o.chordId)),
      ...chromatic,
    ]
    return { primary, more }
  }

  const primary = all.filter((o) => o.validForLead).sort(sortOpts)
  const more = all.filter((o) => !o.validForLead && o.diatonicRoot).sort(sortOpts)
  return { primary, more }
}

export function optionKey(o: Pick<HarmonizeChordOption, 'rootOffset' | 'chordId'>): string {
  return `${o.rootOffset}:${o.chordId}`
}

export function findChordNature(id: string): BarbershopChordNature | null {
  return BARBERSHOP_CHORDS.find((c) => c.id === id) ?? null
}
