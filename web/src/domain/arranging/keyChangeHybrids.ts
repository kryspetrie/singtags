/**
 * Mid-style hybrid key-change recipes and path splicing.
 */
import { pcOf, secondaryDominantRootOf } from './secondaryDominant'
import {
  findPivotChords,
  keyLabel,
  signedKeyInterval,
  type CombineKeyChangeOpts,
  type ModulationChord,
  type ModulationPath,
  type StyleShift,
  type TonalityModeLike,
  modulationChord as chord,
  modulationPathId as pathId,
} from './keyChangeShared'

export type HybridPushCtx = {
  push: (
    p: Omit<
      ModulationPath,
      'fromTonality' | 'toTonality' | 'fromMode' | 'toMode' | 'intervalSemis'
    >,
  ) => void
  fromTonality: number
  toTonality: number
  fromMode: TonalityModeLike
  toMode: TonalityModeLike
  fromL: string
  toL: string
  fromINature: string
  fromIRoman: string
  arrivalNature: string
  arrivalRoman: string
  vNew: number
  vOfVNew: number
  subV: number
  interval: number
}

/** Built-in recipes that change modulation character mid-path. */
export function pushHybridKeyChanges(ctx: HybridPushCtx) {
  const {
    push,
    fromTonality,
    toTonality,
    fromINature,
    fromIRoman,
    arrivalNature,
    arrivalRoman,
    vNew,
    vOfVNew,
    subV,
    fromL,
    toL,
    interval,
  } = ctx

  const pushHybrid = (
    kind: string,
    fromStyle: StyleShift['from'],
    toStyle: StyleShift['to'],
    atStep: number,
    steps: ModulationChord[],
    label: string,
    reason: string,
    teachingId: string,
    rank: number,
  ) => {
    push({
      id: pathId('hybrid', kind, fromTonality, toTonality, steps),
      character: 'hybrid',
      length: steps.length,
      steps,
      label,
      reason,
      teachingId,
      rank,
      styleShift: { from: fromStyle, to: toStyle, atStep },
    })
  }

  // Smooth pivot setup → abrupt hard cut (skip V7)
  {
    const pivots = findPivotChords(
      fromTonality,
      toTonality,
      ctx.fromMode,
      ctx.toMode,
    ).filter((p) => p.rootPc !== fromTonality && p.rootPc !== toTonality)
    const piv = pivots[0]
    if (piv) {
      const steps = [
        chord(fromTonality, fromINature, 'Depart (smooth setup)', fromIRoman, undefined),
        chord(
          piv.rootPc,
          piv.natureId === 'dim' ? 'dim' : piv.natureId,
          `Pivot (${piv.fromRoman} = ${piv.toRoman})`,
          piv.fromRoman,
          piv.toRoman,
        ),
        chord(toTonality, arrivalNature, 'Abrupt arrival (style shift)', undefined, arrivalRoman),
      ]
      pushHybrid(
        `smooth-abrupt-pivot-${piv.rootPc}`,
        'smooth',
        'abrupt',
        2,
        steps,
        `Smooth pivot → abrupt ${arrivalRoman}/${toL}`,
        `Ease in via shared ${piv.fromRoman}=${piv.toRoman}, then hard-cut to the new tonic — style shifts at the arrival.`,
        'roman_analysis',
        2,
      )
    }
  }

  // Smooth pivot → direct V7–I
  {
    const pivots = findPivotChords(
      fromTonality,
      toTonality,
      ctx.fromMode,
      ctx.toMode,
    ).filter((p) => p.rootPc !== fromTonality)
    const piv = pivots.find((p) => p.rootPc !== vNew) ?? pivots[0]
    if (piv) {
      const steps = [
        chord(fromTonality, fromINature, 'Depart (smooth setup)', fromIRoman, undefined),
        chord(
          piv.rootPc,
          piv.natureId === 'dim' ? 'dim' : piv.natureId,
          `Pivot (${piv.fromRoman} = ${piv.toRoman})`,
          piv.fromRoman,
          piv.toRoman,
        ),
        chord(vNew, 'seventh', 'Direct V7 (style shift)', undefined, 'V7'),
        chord(toTonality, arrivalNature, 'Arrival tonic', undefined, arrivalRoman),
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
      const atStep = Math.max(
        1,
        compact.findIndex((s) => /style shift/i.test(s.role)),
      )
      pushHybrid(
        `smooth-direct-pivot-${piv.rootPc}`,
        'smooth',
        'direct',
        atStep,
        compact,
        `Smooth pivot → direct V7–${arrivalRoman}`,
        `Pivot eases the ear; the cadence snaps into a textbook V7–${arrivalRoman}.`,
        'tension_release',
        1,
      )
    }
  }

  // Extended circle stones → abrupt cut
  {
    const stones: ModulationChord[] = [
      chord(fromTonality, 'seventh', 'Launch BS7 (extended setup)', `${fromIRoman}7`, undefined),
    ]
    let root = fromTonality
    for (let i = 0; i < 2; i++) {
      root = pcOf(root + 5)
      if (root === toTonality || root === vNew) break
      stones.push(
        chord(root, 'seventh', 'Circle stone (extended setup)', undefined, undefined),
      )
    }
    const atStep = stones.length
    stones.push(
      chord(toTonality, arrivalNature, 'Abrupt abandon-walk arrival', undefined, arrivalRoman),
    )
    if (stones.length >= 3) {
      pushHybrid(
        'extended-abrupt-abandon',
        'extended',
        'abrupt',
        atStep,
        stones,
        `Circle tease → abrupt ${toL}`,
        'Start a fifths walk, then abandon it and land hard on the new tonic.',
        'circle_fifths',
        4,
      )
    }
  }

  // Extended scenic → direct V7–I
  if (Math.abs(interval) >= 1) {
    const mid = pcOf(fromTonality + (interval > 0 ? 1 : 11))
    const steps = [
      chord(fromTonality, 'seventh', 'Old tonic BS7 (extended setup)', `${fromIRoman}7`, undefined),
      chord(mid, 'seventh', 'Chromatic connector (extended setup)', undefined, undefined),
      chord(vNew, 'seventh', 'Direct V7 (style shift)', undefined, 'V7'),
      chord(toTonality, arrivalNature, 'Arrival tonic', undefined, arrivalRoman),
    ]
    pushHybrid(
      'extended-direct-scenic',
      'extended',
      'direct',
      2,
      steps,
      `Scenic color → direct V7–${arrivalRoman}`,
      'Wander chromatically, then commit with a clean dominant cadence.',
      'circle_fifths',
      3,
    )
  }

  // Direct V7 → smooth IV detour
  {
    const ivNew = pcOf(toTonality + 5)
    const steps = [
      chord(vNew, 'seventh', 'Plant V7 (direct setup)', undefined, 'V7'),
      chord(
        ivNew,
        ctx.toMode === 'minor' ? 'minor' : 'major',
        'IV/iv detour (smooth release)',
        undefined,
        ctx.toMode === 'minor' ? 'iv' : 'IV',
      ),
      chord(vNew, 'seventh', 'Return to V7', undefined, 'V7'),
      chord(toTonality, arrivalNature, 'Soft arrival', undefined, arrivalRoman),
    ]
    pushHybrid(
      'direct-smooth-iv',
      'direct',
      'smooth',
      1,
      steps,
      `Direct V7 → smooth ${ctx.toMode === 'minor' ? 'iv' : 'IV'}–V7–${arrivalRoman}`,
      'Announce the new dominant early, then soften the landing with a subdominant visit.',
      'springboard',
      5,
    )
  }

  // Smooth old-V → abrupt ♭II7 punch
  if (secondaryDominantRootOf(fromTonality) !== vNew) {
    const vOld = secondaryDominantRootOf(fromTonality)
    const steps = [
      chord(vOld, 'seventh', `V7/${fromL} (smooth setup)`, 'V7', undefined),
      chord(subV, 'seventh', '♭II7 punch (abrupt shift)', undefined, '♭II7'),
      chord(toTonality, arrivalNature, 'Arrival tonic', undefined, arrivalRoman),
    ]
    pushHybrid(
      'smooth-abrupt-subV',
      'smooth',
      'abrupt',
      1,
      steps,
      `Smooth re-aim → ♭II7–${arrivalRoman}`,
      'Start with continuous dominant tension, then punch the arrival with a tritone substitute.',
      'counterpart',
      3,
    )
  }

  // Direct V7/V → extended plateau delay
  {
    const steps = [
      chord(vOfVNew, 'seventh', 'V7/V (direct setup)', undefined, 'V7/V'),
      chord(vNew, 'seventh', 'V7 of new', undefined, 'V7'),
      chord(
        pcOf(toTonality + 5),
        ctx.toMode === 'minor' ? 'minor' : 'major',
        'IV/iv plateau (extended delay)',
        undefined,
        ctx.toMode === 'minor' ? 'iv' : 'IV',
      ),
      chord(vNew, 'seventh', 'V7 again', undefined, 'V7'),
      chord(toTonality, arrivalNature, 'Arrival tonic', undefined, arrivalRoman),
    ]
    pushHybrid(
      'direct-extended-delay',
      'direct',
      'extended',
      2,
      steps,
      `Direct V7/V → extended plateau → ${arrivalRoman}`,
      'Open with a clear five-of-five, then stretch the story with a subdominant plateau.',
      'secondary_dom',
      6,
    )
  }
}

/**
 * Join two modulation paths end-to-end with a mid-path style change.
 *
 * - Same from/to: splice a setup style into a finish style (hybrid narrative).
 * - Multi-hop (first.to === second.from): chain keys and mark the junction.
 */
export function combineKeyChangePaths(
  first: ModulationPath,
  second: ModulationPath,
  opts: CombineKeyChangeOpts = {},
): ModulationPath | null {
  if (first.steps.length === 0 || second.steps.length === 0) return null

  const multiHop =
    first.toTonality === second.fromTonality &&
    first.fromTonality !== second.toTonality &&
    !(first.fromTonality === second.fromTonality && first.toTonality === second.toTonality)

  const sameTrip =
    first.fromTonality === second.fromTonality && first.toTonality === second.toTonality

  if (!multiHop && !sameTrip) return null

  const dropFirstArrival = opts.dropFirstArrival !== false
  let hingeExclusive =
    opts.hingeExclusive ??
    (dropFirstArrival
      ? Math.max(1, first.steps.length - (sameTrip || multiHop ? 1 : 0))
      : first.steps.length)

  if (sameTrip) {
    hingeExclusive = Math.min(hingeExclusive, first.steps.length)
    hingeExclusive = Math.max(1, hingeExclusive)
  }

  const head = first.steps.slice(0, hingeExclusive).map((s) => ({
    ...s,
    role: `${s.role} (${first.character} setup)`,
  }))
  let tail = second.steps.map((s) => ({
    ...s,
    role: /style shift/i.test(s.role) ? s.role : `${s.role} (${second.character} finish)`,
  }))

  const lastHead = head[head.length - 1]
  const firstTail = tail[0]
  if (
    lastHead &&
    firstTail &&
    lastHead.rootPc === firstTail.rootPc &&
    lastHead.natureId === firstTail.natureId
  ) {
    tail = tail.slice(1)
  }
  if (tail.length === 0) return null

  const steps = [...head, ...tail]
  const fromStyle = (
    first.character === 'hybrid' ? first.styleShift?.from : first.character
  ) as StyleShift['from'] | undefined
  const toStyle = (
    second.character === 'hybrid' ? second.styleShift?.to : second.character
  ) as StyleShift['to'] | undefined
  if (!fromStyle || !toStyle) return null

  const fromTonality = first.fromTonality
  const toTonality = multiHop ? second.toTonality : first.toTonality
  const fromMode = first.fromMode
  const toMode = multiHop ? second.toMode : first.toMode
  const interval = signedKeyInterval(fromTonality, toTonality)
  const atStep = head.length
  const fromL = keyLabel(fromTonality, fromMode)
  const toL = keyLabel(toTonality, toMode)
  const midL = multiHop ? keyLabel(first.toTonality, first.toMode) : null

  return {
    id: pathId(
      'hybrid',
      `combine-${first.character}-${second.character}`,
      fromTonality,
      toTonality,
      steps,
    ),
    fromTonality,
    toTonality,
    fromMode,
    toMode,
    intervalSemis: interval,
    character: 'hybrid',
    length: steps.length,
    steps,
    label: multiHop
      ? `${fromL} → ${midL} (${first.character}) → ${toL} (${second.character})`
      : `${first.character} → ${second.character} into ${toL}`,
    reason: multiHop
      ? `Two-hop key change with a style shift at ${midL}: ${first.character} then ${second.character}.`
      : `Combined path: ${first.character} setup spliced into a ${second.character} finish.`,
    teachingId: 'roman_analysis',
    rank: 8,
    styleShift: { from: fromStyle, to: toStyle, atStep },
  }
}
