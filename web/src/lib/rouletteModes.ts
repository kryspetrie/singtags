/**
 * Roulette modes: deal a batch, parse saved modes, and keep built-ins seeded.
 * Pool math stays in rouletteDraw.ts.
 */
import type { TagSummary } from '../types/tag'
import {
  allocateQuotas,
  defaultRng,
  drawWeightedUnique,
  filterTagsForRouletteMode,
  isRouletteBatchOrder,
  isRoulettePoolId,
  isRouletteScore,
  normalizeRouletteBatchSize,
  normalizeRouletteCurve,
  normalizeRouletteModeFilters,
  normalizeSliceWeights,
  poolLabel,
  rawScore,
  rouletteCurveEffect,
  shuffleInPlace,
  sliceEligible,
  weightsForSlice,
  DEFAULT_ROULETTE_MODE_FILTERS,
  ROULETTE_CURVE_OPTIONS,
  ROULETTE_ORDER_OPTIONS,
  ROULETTE_SCORE_OPTIONS,
  type DealFromModeResult,
  type Rng,
  type RouletteCurve,
  type RouletteFavoriteGroup,
  type RouletteMode,
  type RoulettePoolContext,
  type RouletteScore,
  type RouletteSlice,
} from './rouletteDraw'

/**
 * Deal a batch from a mode: mixture quotas, curve weights, spill to fill n.
 * Pass `ctx` when slices use Favorites or Favorites groups.
 */
export function dealFromMode(
  catalog: readonly TagSummary[],
  mode: RouletteMode,
  rng: Rng = defaultRng,
  ctx: RoulettePoolContext = {},
): DealFromModeResult {
  const filtered = filterTagsForRouletteMode(catalog, mode, ctx.cacheReadyByTag)
  const n = normalizeRouletteBatchSize(mode.batchSize)
  const slices =
    mode.slices.length > 0
      ? mode.slices
      : [{ weightPct: 100, pool: 'all' as const, score: 'uniform' as const, curve: 'equal' as const }]
  const groups = ctx.favoriteGroups ?? []

  const props = normalizeSliceWeights(slices)
  const quotas = allocateQuotas(
    props.map((p) => p * 100),
    n,
  )
  const chosen: TagSummary[] = []
  const chosenIds = new Set<number>()
  const sliceCounts = quotas.map(() => 0)
  const shortPools: string[] = []

  const pickFrom = (
    poolTags: TagSummary[],
    score: RouletteScore,
    curve: RouletteCurve,
    want: number,
  ): TagSummary[] => {
    const available = poolTags.filter((t) => !chosenIds.has(t.id))
    if (want <= 0 || !available.length) return []
    const w = weightsForSlice(available, score, curve)
    return drawWeightedUnique(available, want, w, rng)
  }

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i]!
    const want = quotas[i] ?? 0
    if (want <= 0) continue
    const pool = sliceEligible(filtered, slice.pool, ctx)
    const got = pickFrom(pool, slice.score, slice.curve, want)
    sliceCounts[i] = got.length
    if (got.length < want) {
      shortPools.push(`${poolLabel(slice.pool, groups)} (${got.length}/${want})`)
    }
    for (const t of got) {
      chosen.push(t)
      chosenIds.add(t.id)
    }
  }

  // Spill unmet slots: remaining slices by weight, then full library uniform.
  let need = n - chosen.length
  if (need > 0) {
    for (let i = 0; i < slices.length && need > 0; i++) {
      const slice = slices[i]!
      const pool = sliceEligible(filtered, slice.pool, ctx)
      const got = pickFrom(pool, slice.score, slice.curve, need)
      for (const t of got) {
        chosen.push(t)
        chosenIds.add(t.id)
      }
      need = n - chosen.length
    }
  }
  if (need > 0) {
    const fill = pickFrom(sliceEligible(filtered, 'all', ctx), 'uniform', 'equal', need)
    for (const t of fill) {
      chosen.push(t)
      chosenIds.add(t.id)
    }
  }

  let ordered = [...chosen]
  if (mode.batchOrder === 'random') {
    shuffleInPlace(ordered, rng)
  } else if (mode.batchOrder === 'byScore') {
    // Prefer first slice that isn't uniform/equal for sort key
    const scoreSlice =
      slices.find((s) => s.curve !== 'equal' && s.score !== 'uniform') ?? slices[0]!
    ordered.sort(
      (a, b) => rawScore(b, scoreSlice.score) - rawScore(a, scoreSlice.score),
    )
  }
  // bySlice: keep insertion order (slice groups already)

  ordered = ordered.slice(0, n)

  let status: string | null = null
  if (!filtered.length) {
    status = 'No tags match this mode’s filters — loosen Has sheet / Cached / Type and try again.'
  } else if (shortPools.length) {
    status = `Some pools were short (${shortPools.join(', ')}) — filled from other pools.`
  } else if (ordered.length < n && ordered.length > 0) {
    status = `Only ${ordered.length} tags available in the catalog for this deal.`
  }

  return { tags: ordered, status, sliceCounts }
}

export function slugifyModeLabel(label: string): string {
  const s = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'mode'
}

export function parseRouletteSlice(raw: unknown): RouletteSlice | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const curve = normalizeRouletteCurve(o.curve)
  if (!isRoulettePoolId(o.pool) || !curve) return null
  let score: RouletteScore = isRouletteScore(o.score) ? o.score : 'uniform'
  if (curve === 'equal') score = 'uniform'
  const weightPct =
    typeof o.weightPct === 'number' && Number.isFinite(o.weightPct)
      ? Math.max(0, o.weightPct)
      : 0
  return { weightPct, pool: o.pool, score, curve }
}

export function parseRouletteMode(raw: unknown): RouletteMode | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim() : null
  if (!label) return null
  const slicesIn = Array.isArray(o.slices) ? o.slices : []
  const slices = slicesIn
    .map((s) => parseRouletteSlice(s))
    .filter((s): s is RouletteSlice => !!s)
  if (!slices.length) return null
  const id =
    typeof o.id === 'string' && o.id.trim()
      ? o.id.trim()
      : slugifyModeLabel(label)
  const batchOrder = isRouletteBatchOrder(o.batchOrder) ? o.batchOrder : 'random'
  const filters = normalizeRouletteModeFilters({
    hasSheet: typeof o.hasSheet === 'boolean' ? o.hasSheet : undefined,
    hasAudio: typeof o.hasAudio === 'boolean' ? o.hasAudio : undefined,
    cachedOnDevice: typeof o.cachedOnDevice === 'boolean' ? o.cachedOnDevice : undefined,
    types: Array.isArray(o.types) ? (o.types as string[]) : undefined,
  })
  return {
    id,
    label,
    slices,
    batchSize: normalizeRouletteBatchSize(o.batchSize),
    batchOrder,
    ...filters,
  }
}

/** Normalize weights to sum 100 (proportional). Prefer {@link resolveSliceWeightPcts} for editor save. */
export function renormSlicesTo100(slices: RouletteSlice[]): RouletteSlice[] {
  const sum = slices.reduce((a, s) => a + Math.max(0, s.weightPct), 0)
  if (sum <= 0) {
    const even = 100 / Math.max(1, slices.length)
    return slices.map((s) => ({ ...s, weightPct: even }))
  }
  const scaled = slices.map((s) => ({
    ...s,
    weightPct: (Math.max(0, s.weightPct) / sum) * 100,
  }))
  // Fix rounding so sum ≈ 100
  const floors = scaled.map((s) => Math.round(s.weightPct * 10) / 10)
  const drift = 100 - floors.reduce((a, b) => a + b, 0)
  if (floors.length) floors[0] = Math.round((floors[0]! + drift) * 10) / 10
  return scaled.map((s, i) => ({ ...s, weightPct: floors[i]! }))
}

/**
 * Parse a Weight % draft field. Empty / whitespace → `null` (auto-fill leftover).
 * Non-finite or negative → `null`.
 */
export function parseWeightPctDraft(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export type ResolveSliceWeightsResult =
  | { ok: true; weights: number[] }
  | { ok: false; error: 'over_100' }

/**
 * Resolve weight drafts for save: blanks share the remaining % equally (integers;
 * leftover points go to the first blanks). Explicit weights are kept as entered.
 * Fails when the sum of explicit (non-blank) weights is over 100.
 */
export function resolveSliceWeightPcts(
  drafts: readonly (number | null)[],
): ResolveSliceWeightsResult {
  const n = drafts.length
  if (n === 0) return { ok: true, weights: [] }

  const explicit = drafts.map((w) => (w == null || !Number.isFinite(w) ? null : Math.max(0, w)))
  const filledSum = explicit.reduce<number>((sum, w) => sum + (w ?? 0), 0)
  if (filledSum > 100 + 1e-9) return { ok: false, error: 'over_100' }

  const blankIdx: number[] = []
  for (let i = 0; i < n; i++) {
    if (explicit[i] == null) blankIdx.push(i)
  }

  const out = explicit.map((w) => (w == null ? 0 : Math.round(w * 10) / 10))
  if (blankIdx.length === 0) return { ok: true, weights: out }

  const remaining = Math.max(0, 100 - filledSum)
  // Whole percentages; distribute remainder points one at a time.
  const totalPts = Math.round(remaining)
  const base = Math.floor(totalPts / blankIdx.length)
  let rem = totalPts - base * blankIdx.length
  for (let k = 0; k < blankIdx.length; k++) {
    const extra = rem > 0 ? 1 : 0
    if (rem > 0) rem--
    out[blankIdx[k]!] = base + extra
  }
  return { ok: true, weights: out }
}

/** Apply {@link resolveSliceWeightPcts} onto slice copies. */
export function resolveSliceWeights(
  slices: readonly RouletteSlice[],
  drafts: readonly (number | null)[],
): { ok: true; slices: RouletteSlice[] } | { ok: false; error: 'over_100' } {
  const resolved = resolveSliceWeightPcts(drafts)
  if (!resolved.ok) return resolved
  const weights = resolved.weights
  return {
    ok: true,
    slices: slices.map((s, i) => ({
      ...s,
      weightPct: weights[i] ?? 0,
    })),
  }
}

export function seedRouletteModes(): RouletteMode[] {
  const filters = { ...DEFAULT_ROULETTE_MODE_FILTERS, types: [] as string[] }
  return [
    {
      id: 'full-library-rating',
      label: 'All tags',
      batchSize: 10,
      batchOrder: 'random',
      ...filters,
      slices: [{ weightPct: 100, pool: 'all', score: 'rating', curve: 'leftSkew' }],
    },
    {
      id: 'classic-equal',
      label: 'Classic tags',
      batchSize: 10,
      batchOrder: 'random',
      ...filters,
      slices: [{ weightPct: 100, pool: 'classic', score: 'uniform', curve: 'equal' }],
    },
    {
      id: 'collections-heavy',
      label: 'Collections heavy',
      batchSize: 10,
      batchOrder: 'random',
      ...filters,
      slices: [
        { weightPct: 50, pool: 'classic', score: 'uniform', curve: 'equal' },
        { weightPct: 15, pool: 'days100', score: 'uniform', curve: 'equal' },
        { weightPct: 15, pool: 'easytags', score: 'uniform', curve: 'equal' },
        { weightPct: 20, pool: 'all', score: 'rating', curve: 'leftSkew' },
      ],
    },
  ]
}

/** Built-in modes that cannot be deleted; only curve + score are editable. */
export const ROULETTE_BUILTIN_MODE_IDS = [
  'full-library-rating',
  'classic-equal',
  'collections-heavy',
] as const

export function isRouletteBuiltinModeId(id: string): boolean {
  return (ROULETTE_BUILTIN_MODE_IDS as readonly string[]).includes(id)
}

/** Merge saved curve/score onto a seed slice; pools and weights stay locked from the seed. */
function mergeBuiltinSlice(
  seedSlice: RouletteSlice,
  existing: RouletteSlice | undefined,
): RouletteSlice {
  return {
    ...seedSlice,
    score: existing?.score ?? seedSlice.score,
    curve: existing?.curve ?? seedSlice.curve,
  }
}

/** Keep built-ins present and structurally locked; preserve curve/score/batch size/filters. */
export function ensureBuiltinRouletteModes(modes: readonly RouletteMode[]): RouletteMode[] {
  const seeds = seedRouletteModes()
  const byId = new Map(modes.map((m) => [m.id, m]))
  const out: RouletteMode[] = []
  for (const seed of seeds) {
    const existing = byId.get(seed.id)
    if (existing) {
      out.push({
        ...seed,
        batchSize: normalizeRouletteBatchSize(existing.batchSize),
        ...normalizeRouletteModeFilters(existing),
        slices: seed.slices.map((seedSlice, i) =>
          mergeBuiltinSlice(seedSlice, existing.slices[i]),
        ),
      })
      byId.delete(seed.id)
    } else {
      out.push({
        ...seed,
        types: [...seed.types],
        slices: seed.slices.map((s) => ({ ...s })),
      })
    }
  }
  for (const m of modes) {
    if (!isRouletteBuiltinModeId(m.id)) {
      out.push({
        ...m,
        ...normalizeRouletteModeFilters(m),
        types: [...normalizeRouletteModeFilters(m).types],
        slices: m.slices.map((s) => ({ ...s })),
      })
    }
  }
  return out
}

export function summarizeMode(
  mode: RouletteMode,
  groups: readonly RouletteFavoriteGroup[] = [],
): string {
  const parts = mode.slices.map((s) => {
    const pool = poolLabel(s.pool, groups)
    const curveOpt = ROULETTE_CURVE_OPTIONS.find((o) => o.value === s.curve)
    const curve = curveOpt
      ? `${curveOpt.label} · ${rouletteCurveEffect(s.curve, s.score)}`
      : s.curve
    const score =
      s.score === 'uniform'
        ? ''
        : ` / ${ROULETTE_SCORE_OPTIONS.find((o) => o.value === s.score)?.label ?? s.score}`
    return `${Math.round(s.weightPct)}% ${pool} · ${curve}${score}`
  })
  const order =
    ROULETTE_ORDER_OPTIONS.find((o) => o.value === mode.batchOrder)?.label ?? mode.batchOrder
  return `${parts.join(' · ')} · batch ${mode.batchSize} · ${order}`
}
