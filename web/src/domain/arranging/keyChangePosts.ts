/**
 * Post / common-tone key changes — held PC through BS7 chain (Phase K4).
 */
import { pcOf, secondaryDominantRootOf } from './secondaryDominant'
import {
  keyLabel,
  modulationChord as chord,
  modulationPathId as pathId,
  signedKeyInterval,
  type ModulationChord,
  type ModulationPath,
  type TonalityModeLike,
} from './keyChangeShared'
import { BARBERSHOP_CHORDS } from './chords/chords'

export type SuggestPostKeyChangesOpts = {
  fromTonality: number
  toTonality: number
  fromMode?: TonalityModeLike
  toMode?: TonalityModeLike
  /** Pitch-class held through every step (default: old tonic). */
  holdPc?: number
  preferUp?: boolean
  /** Max chords including arrival (default 5). */
  maxLength?: number
  limit?: number
}

/** Pitch-classes in a chord nature from root. */
export function chordTonePcs(rootPc: number, natureId: string): number[] {
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!nature) return [pcOf(rootPc)]
  const out: number[] = []
  for (const off of Object.values(nature.offsets)) {
    if (off != null) out.push(pcOf(rootPc + off))
  }
  return out
}

export function chordContainsPc(rootPc: number, natureId: string, holdPc: number): boolean {
  return chordTonePcs(rootPc, natureId).includes(pcOf(holdPc))
}

/** BS7 roots that include holdPc as a chord tone. */
export function seventhRootsContaining(holdPc: number): number[] {
  const h = pcOf(holdPc)
  // hold as 1, 3, 5, or ♭7 of a Mm7
  return [h, pcOf(h - 4), pcOf(h - 7), pcOf(h - 10)]
}

function dedupeSteps(steps: ModulationChord[]): ModulationChord[] {
  const out: ModulationChord[] = []
  for (const s of steps) {
    const last = out[out.length - 1]
    if (last && last.rootPc === s.rootPc && last.natureId === s.natureId) {
      out[out.length - 1] = s
      continue
    }
    out.push(s)
  }
  return out
}

function allHold(steps: ModulationChord[], holdPc: number): boolean {
  return steps.every((s) => chordContainsPc(s.rootPc, s.natureId, holdPc))
}

/**
 * Suggest modulation paths where every chord contains `holdPc` (Lead post / common tone).
 */
export function suggestPostKeyChanges(opts: SuggestPostKeyChangesOpts): ModulationPath[] {
  const fromTonality = pcOf(opts.fromTonality)
  const toTonality = pcOf(opts.toTonality)
  const fromMode = opts.fromMode ?? 'major'
  const toMode = opts.toMode ?? 'major'
  const holdPc = pcOf(opts.holdPc ?? fromTonality)
  const preferUp = opts.preferUp !== false
  const interval = signedKeyInterval(fromTonality, toTonality, preferUp)
  const maxLength = opts.maxLength ?? 5
  const limit = opts.limit ?? 12
  const fromL = keyLabel(fromTonality, fromMode)
  const toL = keyLabel(toTonality, toMode)
  const arrivalNature = toMode === 'minor' ? 'minor' : 'major'
  const arrivalRoman = toMode === 'minor' ? 'i' : 'I'
  const vNew = secondaryDominantRootOf(toTonality)

  if (fromTonality === toTonality && fromMode === toMode) return []
  if (!chordContainsPc(toTonality, arrivalNature, holdPc)) {
    // Hold must land in the new tonic — otherwise not a valid post into this key.
    return []
  }

  const paths: ModulationPath[] = []
  const push = (steps: ModulationChord[], kind: string, label: string, reason: string, rank: number) => {
    const compact = dedupeSteps(steps)
    if (compact.length < 2 || compact.length > maxLength) return
    if (!allHold(compact, holdPc)) return
    paths.push({
      id: pathId('smooth', kind, fromTonality, toTonality, compact),
      fromTonality,
      toTonality,
      fromMode,
      toMode,
      intervalSemis: interval,
      character: 'smooth',
      length: compact.length,
      steps: compact,
      label,
      reason,
      teachingId: 'common_tone',
      rank,
      templateId: `post-${kind}`,
    })
  }

  const holdLabel = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][holdPc]!

  // 1) Direct V7→I if both contain hold
  push(
    [
      chord(vNew, 'seventh', `Post ${holdLabel} under V7`, undefined, 'V7'),
      chord(toTonality, arrivalNature, `Arrival (held ${holdLabel})`, undefined, arrivalRoman),
    ],
    'v7-i',
    `Post ${holdLabel}: V7→${arrivalRoman} into ${toL}`,
    `Hold ${holdLabel} through the new dominant into tonic — classic common-tone post.`,
    1,
  )

  // 2) Old I7 → V7 → I when old tonic BS7 contains hold (usual: hold = old 1)
  if (chordContainsPc(fromTonality, 'seventh', holdPc)) {
    push(
      [
        chord(fromTonality, 'seventh', `Depart BS7 (held ${holdLabel})`, 'I7', undefined),
        chord(vNew, 'seventh', `V7 (held ${holdLabel})`, undefined, 'V7'),
        chord(toTonality, arrivalNature, `Arrival (held ${holdLabel})`, undefined, arrivalRoman),
      ],
      'i7-v7-i',
      `Post ${holdLabel}: I7→V7→${arrivalRoman} (${fromL}→${toL})`,
      `Color the old home, keep ${holdLabel} ringing, then cadence in ${toL}.`,
      2,
    )
  }

  // 3) Short circle: pick one intermediary BS7 containing hold between from and V7
  const candidates = seventhRootsContaining(holdPc).filter(
    (r) => r !== fromTonality && r !== vNew && r !== toTonality,
  )
  for (const mid of candidates.slice(0, 4)) {
    push(
      [
        chord(fromTonality, 'seventh', `Depart (held ${holdLabel})`, 'I7', undefined),
        chord(mid, 'seventh', `Connector BS7 (held ${holdLabel})`, undefined, undefined),
        chord(vNew, 'seventh', `V7 (held ${holdLabel})`, undefined, 'V7'),
        chord(toTonality, arrivalNature, `Arrival (held ${holdLabel})`, undefined, arrivalRoman),
      ],
      `circle-${mid}`,
      `Post ${holdLabel}: circle stub → V7→${arrivalRoman}`,
      `Descending-fifth flavor under a held ${holdLabel} into ${toL}.`,
      4,
    )
  }

  // 4) Tritone-sub approach if ♭II7 contains hold
  const subV = pcOf(vNew + 6)
  if (chordContainsPc(subV, 'seventh', holdPc)) {
    push(
      [
        chord(subV, 'seventh', `♭II7 post ${holdLabel}`, undefined, '♭II7'),
        chord(toTonality, arrivalNature, `Arrival (held ${holdLabel})`, undefined, arrivalRoman),
      ],
      'subv-i',
      `Post ${holdLabel}: ♭II7→${arrivalRoman}`,
      `Tritone-sub dominant under held ${holdLabel}.`,
      5,
    )
  }

  const seen = new Set<string>()
  const out = paths.filter((p) => {
    const key = p.steps.map((s) => `${s.rootPc}:${s.natureId}`).join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  out.sort((a, b) => a.rank - b.rank || a.length - b.length)
  return out.slice(0, limit)
}
