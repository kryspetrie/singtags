/**
 * Ordered substitution / strengthen branches (Prietto + Approach One/Two).
 * Returns ranked alternative roots/natures for a lead tone under a pillar.
 */
import { BARBERSHOP_CHORDS, chordContainsLead } from './chords'
import { secondaryDominantRootOf } from './secondaryDominant'
import { scfRoots, type ScfGroup } from './scf'
import type { TonalityMode } from './types'

export type SubstitutionStrategy =
  | 'pillar_pcf'
  | 'secondary_dom'
  | 'subdominant_approach'
  | 'relative_minor'
  | 'scf_group'

export type SubstitutionBranch = {
  strategy: SubstitutionStrategy
  rootPc: number
  natureIds: readonly string[]
  /** Lower = try first. */
  rank: number
  label: string
  reason: string
}

function leadFits(rootPc: number, natureId: string, leadMidi: number): boolean {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!chord) return false
  return chordContainsLead(chord, rootPc, leadMidi)
}

function filterNatures(
  rootPc: number,
  natures: readonly string[],
  leadMidi: number,
): string[] {
  return natures.filter((n) => leadFits(rootPc, n, leadMidi))
}

/**
 * List substitution branches for a melody pitch under the active pillar.
 * Does not place voicings — callers feed roots into the candidate generator.
 */
export function listSubstitutionBranches(opts: {
  leadMidi: number
  pillarRoot: number
  tonality: number
  mode?: TonalityMode
  nextPillarRoot?: number | null
}): SubstitutionBranch[] {
  const mode = opts.mode ?? 'major'
  const { leadMidi, pillarRoot, tonality } = opts
  const out: SubstitutionBranch[] = []

  // 1) Plug melody into pillar chord (PCF)
  const pcfNatures = filterNatures(
    pillarRoot,
    ['seventh', 'major', 'minor', 'ninth', 'sixth', 'm7'],
    leadMidi,
  )
  if (pcfNatures.length) {
    out.push({
      strategy: 'pillar_pcf',
      rootPc: pillarRoot,
      natureIds: pcfNatures,
      rank: 1,
      label: `PCF @ ${pillarRoot}`,
      reason: 'Melody as chord tone of the primary pillar',
    })
  }

  // 2) BS7 a P5 above next pillar (or current pillar) — secondary dominant
  const target = opts.nextPillarRoot ?? pillarRoot
  const secRoot = secondaryDominantRootOf(target)
  const secNatures = filterNatures(secRoot, ['seventh', 'ninth'], leadMidi)
  if (secNatures.length) {
    out.push({
      strategy: 'secondary_dom',
      rootPc: secRoot,
      natureIds: secNatures,
      rank: 2,
      label: `V7 → root ${target}`,
      reason: 'Barbershop seventh a fifth above the target pillar',
    })
  }

  // 3) Approach into IV / iv (subdominant) via its V7
  const subdom = (((tonality + 5) % 12) + 12) % 12
  const subApproach = secondaryDominantRootOf(subdom)
  const subNatures = filterNatures(subApproach, ['seventh', 'ninth'], leadMidi)
  if (subNatures.length && subApproach !== secRoot) {
    out.push({
      strategy: 'subdominant_approach',
      rootPc: subApproach,
      natureIds: subNatures,
      rank: 3,
      label: mode === 'minor' ? `V7/iv` : `V7/IV`,
      reason: 'Secondary dominant into the subdominant springboard',
    })
  }

  // 4) Relative minor / major sixth substitute on pillar
  const rel =
    mode === 'minor'
      ? (((pillarRoot + 3) % 12) + 12) % 12 // relative major
      : (((pillarRoot + 9) % 12) + 12) % 12 // relative minor
  const relNatures = filterNatures(rel, ['minor', 'm7', 'major', 'sixth'], leadMidi)
  if (relNatures.length) {
    out.push({
      strategy: 'relative_minor',
      rootPc: rel,
      natureIds: relNatures,
      rank: 4,
      label: mode === 'minor' ? 'Relative major' : 'Relative / substitute-6th',
      reason: 'Color change via relative triad / sixth family',
    })
  }

  // 5) SCF group roots (1,3,4,5) as passing alts
  for (const g of [1, 3, 4, 5] as ScfGroup[]) {
    for (const rootPc of scfRoots(pillarRoot, g)) {
      const natures = filterNatures(
        rootPc,
        g === 5 ? ['seventh', 'ninth'] : ['seventh', 'm7', 'ninth', 'minor'],
        leadMidi,
      )
      if (!natures.length) continue
      if (out.some((b) => b.rootPc === rootPc && b.strategy !== 'scf_group')) continue
      out.push({
        strategy: 'scf_group',
        rootPc,
        natureIds: natures,
        rank: 5 + g,
        label: `SCF G${g} @ ${rootPc}`,
        reason: `Secondary chord family group ${g}`,
      })
    }
  }

  return out.sort((a, b) => a.rank - b.rank)
}
