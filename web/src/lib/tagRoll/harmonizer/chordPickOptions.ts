/**
 * One-click Harmonize chord options (root + quality together).
 * Valid = lead is a chord tone; More = remaining catalog for browsing.
 */
import {
  formatRomanWithAlt,
  romanForChordDetailed,
} from '../../../domain/arranging/secondaryDominant'
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
  /** Roman e.g. I, V7, V7/V (II7) */
  roman: string
  /** Primary roman without alt (for matching / overrides). */
  romanPrimary: string
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
  /** Next harmony root (Sketch / pillar) — enables V7/V, ii7/V dual labels. */
  resolvesToRoot?: number | null
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
      const detailed = romanForChordDetailed({
        rootPc,
        natureId: chord.id,
        tonality,
        mode,
        resolvesToRoot: opts.resolvesToRoot ?? null,
      })
      all.push({
        rootOffset: r.offset,
        rootPc,
        chordId: chord.id,
        name: name || 'maj',
        roman: formatRomanWithAlt(detailed.roman, detailed.altRoman),
        romanPrimary: detailed.roman,
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

/** Rank hint from Detected / implied melody (root + nature). */
export type ChordRankHint = {
  rootPc: number
  natureId: string
  /** Cadence-aware suggestion (V7→I etc.). */
  cadence?: boolean
  /** Short reason for tooltips / chrome. */
  label?: string
}

/** Map Detected/implied name candidates into pick-list rank hints. */
export function rankHintsFromCandidates(
  cands: readonly {
    rootPc: number
    natureId: string
    label?: string
    cadenceLabel?: string
  }[],
): ChordRankHint[] {
  return cands.map((c) => ({
    rootPc: c.rootPc,
    natureId: c.natureId,
    cadence: !!c.cadenceLabel,
    label: c.cadenceLabel ?? c.label,
  }))
}

export function optionKeyFromRootPc(
  rootPc: number,
  chordId: string,
  tonality: number,
): string {
  const t = ((tonality % 12) + 12) % 12
  const rootOffset = (((rootPc - t) % 12) + 12) % 12
  return optionKey({ rootOffset, chordId })
}

/**
 * Put ranked Detected/implied candidates first (stable for the rest).
 * Incomplete catalog matches are skipped;Browse order otherwise preserved.
 */
export function prioritizeOptionsByRank(
  options: readonly HarmonizeChordOption[],
  ranked: readonly ChordRankHint[],
  tonality: number,
): HarmonizeChordOption[] {
  if (!ranked.length) return [...options]
  const byKey = new Map(options.map((o) => [optionKey(o), o]))
  const used = new Set<string>()
  const out: HarmonizeChordOption[] = []
  for (const r of ranked) {
    const k = optionKeyFromRootPc(r.rootPc, r.natureId, tonality)
    const hit = byKey.get(k)
    if (hit && !used.has(k)) {
      out.push(hit)
      used.add(k)
    }
  }
  for (const o of options) {
    const k = optionKey(o)
    if (!used.has(k)) out.push(o)
  }
  return out
}

export function findChordNature(id: string): BarbershopChordNature | null {
  return BARBERSHOP_CHORDS.find((c) => c.id === id) ?? null
}
