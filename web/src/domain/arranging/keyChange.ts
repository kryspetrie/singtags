/**
 * Key-change / modulation path suggestions (short↔long, abrupt↔smooth).
 * Barbershop-oriented: BS7 approaches, pivots, circle walks, lifts.
 * @see knowledge/11-intros-tags-medleys.md · OCR key-change notes
 */
import { pcOf, secondaryDominantRootOf } from './secondaryDominant'
import { counterpartRoot } from './counterpart'
import {
  findPivotChords,
  keyLabel,
  modulationChord as chord,
  modulationPathId as pathId,
  signedKeyInterval,
  type ModulationCharacter,
  type ModulationChord,
  type ModulationPath,
  type SuggestKeyChangesOpts,
} from './keyChangeShared'
import { pushHybridKeyChanges } from './keyChangeHybrids'

export type {
  CombineKeyChangeOpts,
  ModulationCharacter,
  ModulationChord,
  ModulationPath,
  StyleShift,
  SuggestKeyChangesOpts,
} from './keyChangeShared'
export {
  findPivotChords,
  keyLabel,
  signedKeyInterval,
} from './keyChangeShared'
export { combineKeyChangePaths } from './keyChangeHybrids'

/**
 * Generate modulation paths from one key to another.
 */
export function suggestKeyChanges(opts: SuggestKeyChangesOpts): ModulationPath[] {
  const fromTonality = pcOf(opts.fromTonality)
  const toTonality = pcOf(opts.toTonality)
  const fromMode = opts.fromMode ?? 'major'
  const toMode = opts.toMode ?? 'major'
  const preferUp = opts.preferUp !== false
  const interval = signedKeyInterval(fromTonality, toTonality, preferUp)
  const fromL = keyLabel(fromTonality, fromMode)
  const toL = keyLabel(toTonality, toMode)

  if (fromTonality === toTonality && fromMode === toMode) {
    return [
      {
        id: `same:${fromTonality}`,
        fromTonality,
        toTonality,
        fromMode,
        toMode,
        intervalSemis: 0,
        character: 'abrupt',
        length: 1,
        steps: [
          chord(
            toTonality,
            toMode === 'minor' ? 'minor' : 'major',
            'Already in the destination key',
            toMode === 'minor' ? 'i' : 'I',
            toMode === 'minor' ? 'i' : 'I',
          ),
        ],
        label: `Stay in ${toL}`,
        reason: 'Departure and arrival keys are the same.',
        teachingId: 'roman_analysis',
        rank: 0,
      },
    ]
  }

  const paths: ModulationPath[] = []
  const vNew = secondaryDominantRootOf(toTonality)
  const vOfVNew = secondaryDominantRootOf(vNew)
  const subV = counterpartRoot(vNew)
  const arrivalNature = toMode === 'minor' ? 'minor' : 'major'
  const arrivalRoman = toMode === 'minor' ? 'i' : 'I'
  const fromINature = fromMode === 'minor' ? 'minor' : 'major'
  const fromIRoman = fromMode === 'minor' ? 'i' : 'I'

  const push = (
    p: Omit<
      ModulationPath,
      'fromTonality' | 'toTonality' | 'fromMode' | 'toMode' | 'intervalSemis'
    >,
  ) => {
    paths.push({
      ...p,
      fromTonality,
      toTonality,
      fromMode,
      toMode,
      intervalSemis: interval,
    })
  }

  // ——— Abrupt (1): land on new tonic ———
  push({
    id: pathId('abrupt', 'direct-I', fromTonality, toTonality, [
      chord(toTonality, arrivalNature, 'Direct arrival tonic', undefined, arrivalRoman),
    ]),
    character: 'abrupt',
    length: 1,
    steps: [chord(toTonality, arrivalNature, 'Direct arrival tonic', undefined, arrivalRoman)],
    label: `Hitch → ${toL}`,
    reason: 'Hard hitch into the new tonic with no common tones — maximum surprise, minimal preparation.',
    teachingId: 'roman_analysis',
    rank: 10,
    templateId: 'hitch',
  })

  // ——— Abrupt (1): V7 of new alone ———
  push({
    id: pathId('abrupt', 'V7-only', fromTonality, toTonality, [
      chord(vNew, 'seventh', 'V7 of new key alone', undefined, 'V7'),
    ]),
    character: 'abrupt',
    length: 1,
    steps: [chord(vNew, 'seventh', 'V7 of new key alone', undefined, 'V7')],
    label: `Plant V7/${toL}`,
    reason: 'Single dominant of the new key — listeners expect the new tonic next.',
    teachingId: 'tension_release',
    rank: 8,
  })

  // ——— Direct (2): V7 → I (named I7-as-V when old tonic is already V of new) ———
  {
    const i7AsV = fromTonality === vNew
    const kind = i7AsV ? 'I7-as-V' : 'V7-I'
    const steps = [
      chord(
        vNew,
        'seventh',
        i7AsV ? 'Old tonic as V7 of new key' : 'Dominant of arrival key',
        i7AsV ? `${fromIRoman}7` : undefined,
        'V7',
      ),
      chord(toTonality, arrivalNature, 'Arrival tonic', undefined, arrivalRoman),
    ]
    push({
      id: pathId('direct', kind, fromTonality, toTonality, steps),
      character: 'direct',
      length: 2,
      steps,
      label: i7AsV
        ? `${fromIRoman}7 → ${arrivalRoman} (subdominant hitch into ${toL})`
        : `V7 → ${arrivalRoman} into ${toL}`,
      reason: i7AsV
        ? 'Up-a-fourth / down-a-fifth hitch: the old tonic becomes V7 of the new key.'
        : 'Classic short modulation: announce the new dominant, then release.',
      teachingId: 'tension_release',
      rank: 1,
      templateId: kind,
    })
  }

  // ——— Direct (2): old I → V7/new ———
  {
    const steps = [
      chord(fromTonality, fromINature, 'Depart home', fromIRoman, undefined),
      chord(vNew, 'seventh', 'Pivot into V7 of new key', undefined, 'V7'),
    ]
    push({
      id: pathId('direct', 'I-V7', fromTonality, toTonality, steps),
      character: 'direct',
      length: 2,
      steps,
      label: `${fromIRoman} → V7/${toL}`,
      reason: 'Leave the old tonic and plant the new dominant — resolve on the next phrase.',
      teachingId: 'secondary_dom',
      rank: 3,
    })
  }

  // ——— Direct (2): tritone sub → I ———
  {
    const steps = [
      chord(subV, 'seventh', 'Tritone substitute for V of new key', undefined, '♭II7'),
      chord(toTonality, arrivalNature, 'Arrival tonic', undefined, arrivalRoman),
    ]
    push({
      id: pathId('direct', 'subV-I', fromTonality, toTonality, steps),
      character: 'direct',
      length: 2,
      steps,
      label: `♭II7 → ${arrivalRoman} into ${toL}`,
      reason: 'Abrupt-feeling dominant approach via tritone substitute.',
      teachingId: 'counterpart',
      rank: 4,
    })
  }

  // ——— Direct (3): V7/V → V7 → I ———
  {
    const steps = [
      chord(vOfVNew, 'seventh', 'V7 of V in new key', undefined, 'V7/V'),
      chord(vNew, 'seventh', 'V7 of new key', undefined, 'V7'),
      chord(toTonality, arrivalNature, 'Arrival tonic', undefined, arrivalRoman),
    ]
    push({
      id: pathId('direct', 'VV-V-I', fromTonality, toTonality, steps),
      character: 'direct',
      length: 3,
      steps,
      label: `V7/V → V7 → ${arrivalRoman} (${toL})`,
      reason: 'Five-of-five highway into the new key — clear and singable.',
      teachingId: 'secondary_dom',
      rank: 2,
    })
  }

  // ——— Chromatic lift for ±1 / ±2 ———
  if (Math.abs(interval) === 1 || Math.abs(interval) === 2) {
    const dir = interval > 0 ? 'up' : 'down'
    const steps = [
      chord(fromTonality, 'seventh', 'Old tonic as BS7 (unstable home)', `${fromIRoman}7`, undefined),
      chord(vNew, 'seventh', 'Swing to V7 of the lifted key', undefined, 'V7'),
      chord(toTonality, arrivalNature, 'Lifted tonic', undefined, arrivalRoman),
    ]
    push({
      id: pathId('smooth', `lift-${dir}`, fromTonality, toTonality, steps),
      character: 'smooth',
      length: 3,
      steps,
      label: `Chromatic lift ${dir} to ${toL}`,
      reason: `Common barbershop lift of ${Math.abs(interval)} semitone(s): color the old tonic, then cadence in the new key.`,
      teachingId: 'tension_release',
      rank: 1,
      templateId: `lift-${dir}`,
    })
  }

  // ——— Tertian / common-tone flavored lift for ±3 / ±4 ———
  if (Math.abs(interval) === 3 || Math.abs(interval) === 4) {
    const tertianStep = pcOf(fromTonality + (interval > 0 ? 4 : 8))
    const steps = [
      chord(fromTonality, 'seventh', 'Old tonic BS7 (tertian setup)', `${fromIRoman}7`, undefined),
      chord(tertianStep, 'seventh', 'Tertian BS7 connector', undefined, undefined),
      chord(vNew, 'seventh', 'V7 of new key', undefined, 'V7'),
      chord(toTonality, arrivalNature, 'Arrival tonic', undefined, arrivalRoman),
    ]
    push({
      id: pathId('smooth', 'tertian', fromTonality, toTonality, steps),
      character: 'smooth',
      length: 4,
      steps,
      label: `Tertian approach to ${toL}`,
      reason: 'Major-third-flavored connector into the new dominant — common-tone / tertian lift idiom.',
      teachingId: 'circle_fifths',
      rank: 2,
      templateId: 'tertian',
    })
  }

  // ——— Smooth pivot paths ———
  const pivots = findPivotChords(fromTonality, toTonality, fromMode, toMode)
  for (const piv of pivots.slice(0, 6)) {
    if (piv.rootPc === fromTonality) continue
    const steps = [
      chord(fromTonality, fromINature, 'Depart', fromIRoman, undefined),
      chord(
        piv.rootPc,
        piv.natureId === 'dim' ? 'dim' : piv.natureId,
        `Pivot (${piv.fromRoman} = ${piv.toRoman})`,
        piv.fromRoman,
        piv.toRoman,
      ),
      chord(vNew, 'seventh', 'Confirm new key with V7', undefined, 'V7'),
      chord(toTonality, arrivalNature, 'Arrival', undefined, arrivalRoman),
    ]
    const compact: ModulationChord[] = []
    for (const s of steps) {
      const last = compact[compact.length - 1]
      if (last && last.rootPc === s.rootPc && last.natureId === s.natureId) {
        compact[compact.length - 1] = s
        continue
      }
      compact.push(s)
    }
    push({
      id: pathId('smooth', `pivot-${piv.rootPc}`, fromTonality, toTonality, compact),
      character: 'smooth',
      length: compact.length,
      steps: compact,
      label: `Pivot ${piv.fromRoman}/${piv.toRoman} → V7 → ${arrivalRoman}`,
      reason: `Shared chord ${piv.fromRoman} (old) = ${piv.toRoman} (new) eases the ear before the new dominant.`,
      teachingId: 'roman_analysis',
      rank: piv.toRoman === 'V' || piv.fromRoman === 'V' ? 2 : 5,
    })
  }

  // ——— Smooth: old V7 → new V7 ———
  {
    const vOld = secondaryDominantRootOf(fromTonality)
    if (vOld !== vNew) {
      const steps = [
        chord(vOld, 'seventh', 'Old dominant', 'V7', undefined),
        chord(vNew, 'seventh', 'Re-aim as V7 of new key', undefined, 'V7'),
        chord(toTonality, arrivalNature, 'Arrival', undefined, arrivalRoman),
      ]
      push({
        id: pathId('smooth', 'oldV-newV', fromTonality, toTonality, steps),
        character: 'smooth',
        length: 3,
        steps,
        label: `V7/${fromL} → V7/${toL} → ${arrivalRoman}`,
        reason: 'Dominant-to-dominant re-aim — continuous tension, new target.',
        teachingId: 'circle_fifths',
        rank: 4,
      })
    }
  }

  // ——— Extended circle walk ———
  {
    const chain: ModulationChord[] = []
    let root = fromTonality
    const guard = new Set<number>()
    chain.push(chord(root, 'seventh', 'Launch on old tonic BS7', `${fromIRoman}7`, undefined))
    guard.add(root)
    for (let i = 0; i < 5; i++) {
      root = pcOf(root + 5)
      if (guard.has(root)) break
      guard.add(root)
      if (root === vNew) {
        chain.push(chord(root, 'seventh', 'Reached V7 of new key', undefined, 'V7'))
        break
      }
      chain.push(
        chord(root, 'seventh', 'Circle-of-fifths stepping stone', undefined, undefined),
      )
      if (chain.length >= 6) break
    }
    if (chain[chain.length - 1]?.rootPc !== vNew) {
      chain.push(chord(vNew, 'seventh', 'V7 of new key', undefined, 'V7'))
    }
    chain.push(chord(toTonality, arrivalNature, 'Arrival tonic', undefined, arrivalRoman))
    push({
      id: pathId('extended', 'circle-walk', fromTonality, toTonality, chain),
      character: 'extended',
      length: chain.length,
      steps: chain,
      label: `Circle walk → ${toL}`,
      reason: 'Longer descending-fifth highway into the new dominant, then release.',
      teachingId: 'circle_fifths',
      rank: 3,
    })
  }

  // ——— Extended: IV then V–I ———
  {
    const ivNew = pcOf(toTonality + 5)
    const steps = [
      chord(fromTonality, fromINature, 'Depart', fromIRoman, undefined),
      chord(
        ivNew,
        toMode === 'minor' ? 'minor' : 'major',
        'IV/iv of new key as plateau',
        undefined,
        toMode === 'minor' ? 'iv' : 'IV',
      ),
      chord(vNew, 'seventh', 'V7 of new key', undefined, 'V7'),
      chord(toTonality, arrivalNature, 'Arrival', undefined, arrivalRoman),
    ]
    push({
      id: pathId('extended', 'IV-V-I', fromTonality, toTonality, steps),
      character: 'extended',
      length: 4,
      steps,
      label: `Visit ${toMode === 'minor' ? 'iv' : 'IV'}/${toL} then V7–${arrivalRoman}`,
      reason: 'Scenic route: establish subdominant of the new key before cadencing.',
      teachingId: 'springboard',
      rank: 6,
    })
  }

  // ——— Extended scenic chromatic ———
  if (Math.abs(interval) >= 1) {
    const mid = pcOf(fromTonality + (interval > 0 ? 1 : 11))
    const steps = [
      chord(fromTonality, 'seventh', 'Old tonic BS7', `${fromIRoman}7`, undefined),
      chord(mid, 'seventh', 'Chromatic connector', undefined, undefined),
      chord(vOfVNew, 'seventh', 'V7/V of new', undefined, 'V7/V'),
      chord(vNew, 'seventh', 'V7 of new', undefined, 'V7'),
      chord(toTonality, arrivalNature, 'Arrival', undefined, arrivalRoman),
    ]
    push({
      id: pathId('extended', 'scenic', fromTonality, toTonality, steps),
      character: 'extended',
      length: 5,
      steps,
      label: `Scenic chromatic approach to ${toL}`,
      reason: 'Longer narrative: destabilize home, chromatic step, then five-of-five into the new key.',
      teachingId: 'circle_fifths',
      rank: 7,
    })
  }

  if (opts.includeHybrids !== false) {
    pushHybridKeyChanges({
      push,
      fromTonality,
      toTonality,
      fromMode,
      toMode,
      fromL,
      toL,
      fromINature,
      fromIRoman,
      arrivalNature,
      arrivalRoman,
      vNew,
      vOfVNew,
      subV,
      interval,
    })
  }

  const characters = opts.characters
  const minL = opts.minLength ?? 1
  const maxL = opts.maxLength ?? 12
  let out = paths.filter((p) => {
    if (characters && !characters.includes(p.character)) return false
    if (p.length < minL || p.length > maxL) return false
    return true
  })

  const seen = new Set<string>()
  out = out.filter((p) => {
    const key = p.steps.map((s) => `${s.rootPc}:${s.natureId}`).join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  out.sort((a, b) => {
    const charOrder: Record<ModulationCharacter, number> = {
      abrupt: 0,
      direct: 1,
      smooth: 2,
      hybrid: 3,
      extended: 4,
    }
    const c = charOrder[a.character] - charOrder[b.character]
    if (c !== 0) return c
    if (a.rank !== b.rank) return a.rank - b.rank
    return a.length - b.length
  })

  return out.slice(0, opts.limit ?? 24)
}

/** Convenience: group suggestions by character (includes hybrid). */
export function suggestKeyChangesGrouped(opts: SuggestKeyChangesOpts): Record<
  ModulationCharacter,
  ModulationPath[]
> {
  const all = suggestKeyChanges({ ...opts, characters: undefined, limit: 64 })
  return {
    abrupt: all.filter((p) => p.character === 'abrupt'),
    direct: all.filter((p) => p.character === 'direct'),
    smooth: all.filter((p) => p.character === 'smooth'),
    hybrid: all.filter((p) => p.character === 'hybrid'),
    extended: all.filter((p) => p.character === 'extended'),
  }
}
