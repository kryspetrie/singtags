/**
 * Key-change apply façade — suggest, pack, Sketch patches, form gate (Phase K2+K3).
 */
import {
  preferredKeyChangeTemplate,
  signedKeyInterval,
  suggestKeyChanges,
  type ModulationPath,
  type SuggestKeyChangesOpts,
} from '../../domain/arranging/keyChange'
import {
  packModulationIntoSpan,
  type PackedModulationStep,
  type PackModulationOpts,
} from '../../domain/arranging/keyChangePack'
import {
  assessKeyChangeFormImpact,
  type FormImpactResult,
} from '../../domain/arranging/keyChangeForm'
import {
  melodySoftScore,
  type MelodySoftNote,
  type MelodySoftScoreResult,
} from '../../domain/arranging/keyChangeMelodyScore'
import { suggestPostKeyChanges } from '../../domain/arranging/keyChangePosts'
import {
  maxChordsForSpan,
  trimModulationPath,
} from '../../domain/arranging/keyChangeTrim'
import { enumerateHybridPairs } from '../../domain/arranging/keyChangeHybridsEnum'

export type ModulationSketchPatch = {
  startTick: number
  endTick: number
  rootPc: number
  quality: string
  source: 'coach'
  locked: boolean
  pillar: boolean
  romanTo?: string
  role: string
  stepIndex: number
}

export type PrepareModulationApplyOpts = SuggestKeyChangesOpts &
  PackModulationOpts & {
    pathId?: string
    templateId?: string
    beforeMeasureCount?: number
    afterMeasureCount?: number
    melodyNotes?: readonly MelodySoftNote[]
    /** Include post / common-tone paths (default true). */
    includePosts?: boolean
    /** Held PC for posts (default: fromTonality). */
    holdPc?: number
    /** Add beam-capped hybrid splices beyond built-in hybrids (default with includeHybrids). */
    enumerateHybrids?: boolean
  }

export type PrepareModulationApplyResult =
  | {
      ok: true
      path: ModulationPath
      packed: PackedModulationStep[]
      patches: ModulationSketchPatch[]
      form: FormImpactResult
      soft?: MelodySoftScoreResult
    }
  | {
      ok: false
      reason: string
      path?: ModulationPath
      form?: FormImpactResult
      neededMeasures?: number
    }

export type ModulationOption = {
  path: ModulationPath
  packOk: boolean
  reason?: string
  neededMeasures?: number
  packed?: PackedModulationStep[]
  patches?: ModulationSketchPatch[]
  soft?: MelodySoftScoreResult
  /** Other paths in the same family, hidden behind this row. */
  alts?: ModulationOption[]
}

const QUALITIES = new Set([
  'major',
  'seventh',
  'minor',
  'm7',
  'half-dim',
  'dim7',
  'dim',
  'aug',
  'ninth',
  'sixth',
  'maj7',
  'add9',
  'madd6',
])

function natureToQuality(natureId: string): string {
  if (QUALITIES.has(natureId)) return natureId
  return 'major'
}

type KeyChangeFamily = 'gold' | 'cadence' | 'pivot' | 'circle' | 'post' | 'hitch'

function stepKey(path: ModulationPath): string {
  return path.steps.map((s) => `${s.rootPc}:${s.natureId}`).join('|')
}

function goldFor(opts: SuggestKeyChangesOpts): string | null {
  return preferredKeyChangeTemplate(
    signedKeyInterval(opts.fromTonality, opts.toTonality, opts.preferUp !== false),
  )
}

function familyOf(path: ModulationPath, gold: string | null): KeyChangeFamily {
  if (
    path.templateId === 'hitch' ||
    (path.character === 'abrupt' && path.steps.length === 1 && path.steps[0]?.rootPc === path.toTonality)
  ) {
    return 'hitch'
  }
  if (gold && path.templateId === gold) return 'gold'
  if (path.templateId?.startsWith('post')) return 'post'
  if (path.id.includes('circle')) return 'circle'
  if (path.id.includes('pivot') || path.id.includes('IV-V')) return 'pivot'
  return 'cadence'
}

function compareOptions(
  a: ModulationOption,
  b: ModulationOption,
  opts: SuggestKeyChangesOpts,
): number {
  if (a.packOk !== b.packOk) return a.packOk ? -1 : 1
  const score = (b.soft?.score ?? 0) - (a.soft?.score ?? 0)
  if (score !== 0) return score
  const gold = goldFor(opts)
  const ga = a.path.templateId === gold ? 0 : 1
  const gb = b.path.templateId === gold ? 0 : 1
  if (ga !== gb) return ga - gb
  const ha = a.path.templateId === 'hitch' ? 1 : 0
  const hb = b.path.templateId === 'hitch' ? 1 : 0
  if (ha !== hb) return ha - hb
  if (a.path.rank !== b.path.rank) return a.path.rank - b.path.rank
  return a.path.length - b.path.length
}

const FAMILY_ORDER: KeyChangeFamily[] = ['gold', 'cadence', 'pivot', 'circle', 'post', 'hitch']

function presentFamilies(
  options: readonly ModulationOption[],
  opts: SuggestKeyChangesOpts,
): ModulationOption[] {
  const gold = goldFor(opts)
  const groups = new Map<KeyChangeFamily, ModulationOption[]>()
  for (const opt of options) {
    const family = familyOf(opt.path, gold)
    const list = groups.get(family) ?? []
    list.push(opt)
    groups.set(family, list)
  }
  const shown: ModulationOption[] = []
  const seen = new Set<string>()
  for (const family of FAMILY_ORDER) {
    const list = (groups.get(family) ?? []).filter((o) => o.packOk)
    if (!list.length) continue
    list.sort((a, b) => compareOptions(a, b, opts))
    const head = list[0]!
    const headKey = stepKey(head.path)
    if (seen.has(headKey)) continue
    seen.add(headKey)
    const alts = list.slice(1).filter((o) => {
      const key = stepKey(o.path)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 4)
    shown.push({ ...head, alts: alts.length ? alts : undefined })
  }
  if (shown.length) return shown
  const fallback = options.find((o) => !o.packOk)
  return fallback ? [fallback] : []
}

export function pickModulationPath(
  paths: readonly ModulationPath[],
  opts: { pathId?: string; templateId?: string },
): ModulationPath | undefined {
  if (opts.pathId) {
    const byId = paths.find((p) => p.id === opts.pathId)
    if (byId) return byId
  }
  if (opts.templateId) {
    const byT = paths.find((p) => p.templateId === opts.templateId)
    if (byT) return byT
  }
  return paths[0]
}

export function packedToSketchPatches(
  packed: readonly PackedModulationStep[],
): ModulationSketchPatch[] {
  const last = packed.length - 1
  return packed.map((s, i) => ({
    startTick: s.startTick,
    endTick: s.endTick,
    rootPc: s.rootPc,
    quality: natureToQuality(s.natureId),
    source: 'coach' as const,
    locked: true,
    pillar: i === last,
    romanTo: s.romanTo,
    role: s.role,
    stepIndex: s.stepIndex,
  }))
}

/** List packed options for the Keychange panel (soft-ranked when melody present). */
export function listModulationOptions(
  opts: PrepareModulationApplyOpts,
): ModulationOption[] {
  const budgetChords = maxChordsForSpan({
    startTick: opts.startTick,
    endTick: opts.endTick,
    ppq: opts.ppq,
    denominator: opts.denominator,
  })

  let paths: ModulationPath[] = [...suggestKeyChanges(opts)]

  if (opts.includePosts === true) {
    const hold = ((opts.holdPc ?? opts.fromTonality) % 12 + 12) % 12
    const sounding = (opts.melodyNotes ?? []).some((n) => ((n.midi % 12) + 12) % 12 === hold)
    if (sounding) {
      paths.push(
        ...suggestPostKeyChanges({
          fromTonality: opts.fromTonality,
          toTonality: opts.toTonality,
          fromMode: opts.fromMode,
          toMode: opts.toMode,
          holdPc: hold,
          preferUp: opts.preferUp,
          maxLength: Math.max(budgetChords, opts.maxLength ?? 5),
          limit: 8,
        }),
      )
    }
  }

  if (opts.includeHybrids !== false && opts.enumerateHybrids !== false) {
    const bases = paths.filter((p) => p.character !== 'hybrid')
    paths.push(
      ...enumerateHybridPairs(bases, {
        maxLength: Math.max(budgetChords, 6),
        beamWidth: 4,
        limit: 8,
      }),
    )
  }

  // Trim variants for paths that exceed beat budget
  const extras: ModulationPath[] = []
  for (const path of paths) {
    if (path.length > budgetChords) {
      extras.push(...trimModulationPath(path, { maxLength: budgetChords }))
    }
  }
  paths = [...paths, ...extras]

  // Dedupe by step sequence
  const seen = new Set<string>()
  paths = paths.filter((p) => {
    const key = p.steps.map((s) => `${s.rootPc}:${s.natureId}`).join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const out: ModulationOption[] = []
  for (const path of paths) {
    const packed = packModulationIntoSpan(path, opts)
    if (!packed.ok) {
      out.push({
        path,
        packOk: false,
        reason: packed.reason,
        neededMeasures: packed.neededMeasures,
        soft:
          opts.melodyNotes ?
            melodySoftScore(path, opts.melodyNotes, {
              startTick: opts.startTick,
              endTick: opts.endTick,
            })
          : undefined,
      })
      continue
    }
    const soft =
      opts.melodyNotes ?
        melodySoftScore(path, opts.melodyNotes, {
          startTick: opts.startTick,
          endTick: opts.endTick,
          packedStarts: packed.steps.map((s) => s.startTick),
          packedEnds: packed.steps.map((s) => s.endTick),
        })
      : undefined
    out.push({
      path,
      packOk: true,
      packed: packed.steps,
      patches: packedToSketchPatches(packed.steps),
      soft,
    })
  }
  out.sort((a, b) => compareOptions(a, b, opts))
  return presentFamilies(out, opts)
}

/**
 * Suggest paths, pick one, pack into span, gate on form preservation.
 */
export function prepareModulationApply(
  opts: PrepareModulationApplyOpts,
): PrepareModulationApplyResult {
  const paths = suggestKeyChanges(opts)
  if (!paths.length) {
    return { ok: false, reason: 'No modulation paths for these keys.' }
  }
  const path = pickModulationPath(paths, opts)
  if (!path) {
    return { ok: false, reason: 'Could not pick a modulation path.' }
  }
  const packed = packModulationIntoSpan(path, opts)
  if (!packed.ok) {
    return {
      ok: false,
      reason: packed.reason,
      path,
      neededMeasures: packed.neededMeasures,
    }
  }

  const beforeMeasures = opts.beforeMeasureCount ?? 0
  const afterMeasures = opts.afterMeasureCount ?? beforeMeasures
  const spanLen = opts.endTick - opts.startTick
  const form = assessKeyChangeFormImpact({
    beforeMeasureCount: beforeMeasures,
    afterMeasureCount: afterMeasures,
    beforeTickLength: spanLen,
    afterTickLength: spanLen,
  })
  if (!form.ok) {
    return { ok: false, reason: form.warnings.join(' '), path, form }
  }

  const soft =
    opts.melodyNotes ?
      melodySoftScore(path, opts.melodyNotes, {
        startTick: opts.startTick,
        endTick: opts.endTick,
        packedStarts: packed.steps.map((s) => s.startTick),
        packedEnds: packed.steps.map((s) => s.endTick),
      })
    : undefined

  return {
    ok: true,
    path,
    packed: packed.steps,
    patches: packedToSketchPatches(packed.steps),
    form,
    soft,
  }
}
