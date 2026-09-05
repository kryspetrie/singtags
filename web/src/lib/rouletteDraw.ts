/**
 * Tag Roulette draw: pools, score curves, mixture quotas, spill fill.
 */

import {
  is100DaysCollection,
  isClassicCollection,
  normalizeCollectionId,
} from './collections'
import type { TagSummary } from '../types/tag'

export type Rng = () => number

export function defaultRng(): number {
  return Math.random()
}

export const ROULETTE_BATCH_SIZES = [1, 3, 5, 10] as const
export type RouletteBatchSize = (typeof ROULETTE_BATCH_SIZES)[number]

export type RouletteCurve = 'equal' | 'leftSkew' | 'rightSkew' | 'bell'
export type RouletteScore = 'uniform' | 'rating' | 'downloads' | 'year'
/** Built-in catalog pools + Favorites (+ per-group `favgroup:<id>`). */
export type RoulettePoolId = string
export type RouletteBatchOrder = 'random' | 'bySlice' | 'byScore'

export const ROULETTE_FAVGROUP_PREFIX = 'favgroup:' as const

export type RouletteFavoriteGroup = {
  id: string
  name: string
  tagIds: readonly number[]
}

/** Extra pools for Favorites / user collections when dealing. */
export type RoulettePoolContext = {
  favoriteIds?: ReadonlySet<number>
  favoriteGroups?: readonly RouletteFavoriteGroup[]
}

export type RouletteSlice = {
  weightPct: number
  pool: RoulettePoolId
  score: RouletteScore
  curve: RouletteCurve
}

export type RouletteMode = {
  id: string
  label: string
  slices: RouletteSlice[]
  batchSize: RouletteBatchSize
  batchOrder: RouletteBatchOrder
}

const CATALOG_POOL_IDS = ['all', 'classic', 'days100', 'easytags', 'other'] as const

export const ROULETTE_POOL_OPTIONS: Array<{ value: RoulettePoolId; label: string }> = [
  { value: 'all', label: 'All tags' },
  { value: 'classic', label: 'Classic' },
  { value: 'days100', label: '100 Days: 100 Tags' },
  { value: 'easytags', label: 'Easy Tags' },
  { value: 'other', label: 'Other tags' },
  { value: 'favorites', label: 'Favorites' },
]

export function favGroupPoolId(collectionId: string): RoulettePoolId {
  return `${ROULETTE_FAVGROUP_PREFIX}${collectionId}`
}

export function parseFavGroupPoolId(pool: string): string | null {
  if (!pool.startsWith(ROULETTE_FAVGROUP_PREFIX)) return null
  const id = pool.slice(ROULETTE_FAVGROUP_PREFIX.length).trim()
  return id || null
}

/** Catalog + Favorites + each Favorites group for the pool dropdown. */
export function buildRoulettePoolOptions(
  groups: readonly RouletteFavoriteGroup[] = [],
): Array<{ value: RoulettePoolId; label: string }> {
  const out = [...ROULETTE_POOL_OPTIONS]
  for (const g of groups) {
    out.push({ value: favGroupPoolId(g.id), label: `★ ${g.name}` })
  }
  return out
}

export function poolLabel(
  pool: RoulettePoolId,
  groups: readonly RouletteFavoriteGroup[] = [],
): string {
  const known = ROULETTE_POOL_OPTIONS.find((o) => o.value === pool)
  if (known) return known.label
  const gid = parseFavGroupPoolId(pool)
  if (gid) {
    const g = groups.find((c) => c.id === gid)
    return g ? `★ ${g.name}` : `★ Missing group`
  }
  return pool
}

export const ROULETTE_CURVE_OPTIONS: Array<{
  value: RouletteCurve
  label: string
  hint: string
}> = [
  {
    value: 'equal',
    label: 'Equal',
    hint: 'Flat — every tag in the pool has the same chance',
  },
  {
    value: 'leftSkew',
    label: 'Left skew',
    hint: 'Prefer higher Score-by values (higher rating, more downloads, more recent)',
  },
  {
    value: 'rightSkew',
    label: 'Right skew',
    hint: 'Prefer lower Score-by values (lower rating, fewer downloads, older)',
  },
  {
    value: 'bell',
    label: 'Bell',
    hint: 'Prefer scores near the middle of the pool’s range',
  },
]

/** Short effect line under a curve glyph; depends on Score by. */
export function rouletteCurveEffect(curve: RouletteCurve, score: RouletteScore): string {
  switch (curve) {
    case 'equal':
      return 'Same odds'
    case 'leftSkew':
      switch (score) {
        case 'rating':
          return 'Higher rating'
        case 'downloads':
          return 'More downloads'
        case 'year':
          return 'More recent'
        default:
          return 'Higher scores'
      }
    case 'rightSkew':
      switch (score) {
        case 'rating':
          return 'Lower rating'
        case 'downloads':
          return 'Fewer downloads'
        case 'year':
          return 'Older'
        default:
          return 'Lower scores'
      }
    case 'bell':
      switch (score) {
        case 'rating':
          return 'Mid ratings'
        case 'downloads':
          return 'Mid downloads'
        case 'year':
          return 'Mid years'
        default:
          return 'Mid range'
      }
    default:
      return ''
  }
}

export const ROULETTE_SCORE_OPTIONS: Array<{ value: RouletteScore; label: string }> = [
  { value: 'uniform', label: '—' },
  { value: 'rating', label: 'Rating' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'year', label: 'Year' },
]

export const ROULETTE_ORDER_OPTIONS: Array<{ value: RouletteBatchOrder; label: string }> = [
  { value: 'random', label: 'Random order' },
  { value: 'bySlice', label: 'By slice groups' },
  { value: 'byScore', label: 'By score (high → low)' },
]

const CURVE_ALPHA = 1.75
const BELL_SIGMA = 0.2
const RATING_FLOOR = 2.5

export function normalizeRouletteBatchSize(v: unknown): RouletteBatchSize {
  const n = typeof v === 'number' ? v : Number(v)
  if ((ROULETTE_BATCH_SIZES as readonly number[]).includes(n)) return n as RouletteBatchSize
  return 10
}

export function isRoulettePoolId(v: unknown): v is RoulettePoolId {
  if (typeof v !== 'string' || !v) return false
  if ((CATALOG_POOL_IDS as readonly string[]).includes(v) || v === 'favorites') return true
  return parseFavGroupPoolId(v) != null
}

export function isRouletteCurve(v: unknown): v is RouletteCurve {
  return v === 'equal' || v === 'leftSkew' || v === 'rightSkew' || v === 'bell'
}

/** Accept legacy `reverseJ` id from saved modes. */
export function normalizeRouletteCurve(v: unknown): RouletteCurve | null {
  if (v === 'reverseJ') return 'rightSkew'
  return isRouletteCurve(v) ? v : null
}

export function isRouletteScore(v: unknown): v is RouletteScore {
  return v === 'uniform' || v === 'rating' || v === 'downloads' || v === 'year'
}

export function isRouletteBatchOrder(v: unknown): v is RouletteBatchOrder {
  return v === 'random' || v === 'bySlice' || v === 'byScore'
}

/** Catalog rows that can appear in roulette (valid numeric id). */
export function rouletteEligibleTags(tags: readonly TagSummary[]): TagSummary[] {
  return tags.filter((t) => Number.isFinite(t.id) && t.id > 0)
}

export function sliceEligible(
  tags: readonly TagSummary[],
  pool: RoulettePoolId,
  ctx: RoulettePoolContext = {},
): TagSummary[] {
  const base = rouletteEligibleTags(tags)
  const favGroupId = parseFavGroupPoolId(pool)
  if (favGroupId) {
    const group = ctx.favoriteGroups?.find((g) => g.id === favGroupId)
    if (!group?.tagIds.length) return []
    const allow = new Set(group.tagIds)
    return base.filter((t) => allow.has(t.id))
  }
  switch (pool) {
    case 'all':
      return base
    case 'classic':
      return base.filter((t) => isClassicCollection(t.collection))
    case 'days100':
      return base.filter((t) => is100DaysCollection(t.collection))
    case 'easytags':
      return base.filter((t) => normalizeCollectionId(t.collection) === 'easytags')
    case 'other':
      return base.filter((t) => {
        const id = normalizeCollectionId(t.collection)
        return id !== 'classic' && id !== '100' && id !== 'easytags'
      })
    case 'favorites': {
      const ids = ctx.favoriteIds
      if (!ids?.size) return []
      return base.filter((t) => ids.has(t.id))
    }
    default:
      return []
  }
}

/** Raw score before 0–1 normalize (higher = “more” for reverse-J). */
export function rawScore(tag: TagSummary, score: RouletteScore): number {
  switch (score) {
    case 'uniform':
      return 1
    case 'rating': {
      const r = tag.rating
      return typeof r === 'number' && Number.isFinite(r) ? r : RATING_FLOOR
    }
    case 'downloads': {
      const d = tag.downloads
      const n = typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : 0
      return Math.log1p(n)
    }
    case 'year': {
      const y = Number(tag.year)
      return Number.isFinite(y) ? y : Number.NaN
    }
    default:
      return 1
  }
}

export function curveWeight(u: number, curve: RouletteCurve): number {
  const x = Math.min(1, Math.max(0, u))
  const eps = 1e-3
  switch (curve) {
    case 'equal':
      return 1
    case 'leftSkew':
      // Prefer higher unit scores (mass toward the high end).
      return (x + eps) ** CURVE_ALPHA
    case 'rightSkew':
      // Prefer lower unit scores (mass toward the low end).
      return (1 - x + eps) ** CURVE_ALPHA
    case 'bell': {
      const z = (x - 0.5) / BELL_SIGMA
      return Math.exp(-0.5 * z * z)
    }
    default:
      return 1
  }
}

/** Map raw scores in a pool to unit interval; flat pool → all 0.5. */
export function unitScores(
  tags: readonly TagSummary[],
  score: RouletteScore,
): number[] {
  if (score === 'uniform') return tags.map(() => 0.5)
  const raw = tags.map((t) => rawScore(t, score))
  const finite = raw.filter((v) => Number.isFinite(v))
  if (!finite.length) return tags.map(() => 0.5)
  const lo = Math.min(...finite)
  const hi = Math.max(...finite)
  if (hi <= lo) return tags.map(() => 0.5)
  const mid = (lo + hi) / 2
  return raw.map((v) => {
    const s = Number.isFinite(v) ? v : mid
    return (s - lo) / (hi - lo)
  })
}

export function weightsForSlice(
  tags: readonly TagSummary[],
  score: RouletteScore,
  curve: RouletteCurve,
): number[] {
  if (curve === 'equal' || score === 'uniform') return tags.map(() => 1)
  const units = unitScores(tags, score)
  return units.map((u) => curveWeight(u, curve))
}

/**
 * Largest-remainder quotas so Σ q = n and q_i ≈ p_i · n.
 */
export function allocateQuotas(weights: number[], n: number): number[] {
  const m = weights.length
  if (m === 0 || n <= 0) return []
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0)
  if (sum <= 0) {
    const base = Math.floor(n / m)
    const out = Array.from({ length: m }, () => base)
    let rem = n - base * m
    for (let i = 0; rem > 0; i++, rem--) out[i % m]!++
    return out
  }
  const exact = weights.map((w) => (Math.max(0, w) / sum) * n)
  const floors = exact.map((x) => Math.floor(x))
  let rem = n - floors.reduce((a, b) => a + b, 0)
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac)
  const out = [...floors]
  for (let k = 0; k < rem; k++) out[order[k % order.length]!.i]!++
  return out
}

export function normalizeSliceWeights(slices: readonly RouletteSlice[]): number[] {
  const raw = slices.map((s) => Math.max(0, s.weightPct))
  const sum = raw.reduce((a, b) => a + b, 0)
  if (sum <= 0) return slices.map(() => 1 / Math.max(1, slices.length))
  return raw.map((w) => w / sum)
}

/**
 * Weighted sample without replacement (Efraimidis–Spirakis keys).
 */
export function drawWeightedUnique(
  tags: readonly TagSummary[],
  n: number,
  weights: readonly number[],
  rng: Rng = defaultRng,
): TagSummary[] {
  if (n <= 0 || tags.length === 0) return []
  const take = Math.min(Math.floor(n), tags.length)
  const keyed = tags.map((tag, i) => {
    const w = Math.max(1e-12, weights[i] ?? 1)
    const u = Math.min(1 - 1e-12, Math.max(1e-12, rng()))
    return { tag, key: u ** (1 / w) }
  })
  keyed.sort((a, b) => b.key - a.key)
  return keyed.slice(0, take).map((k) => k.tag)
}

export function drawUniformUnique(
  tags: readonly TagSummary[],
  n: number,
  rng: Rng = defaultRng,
): TagSummary[] {
  const pool = [...rouletteEligibleTags(tags)]
  if (n <= 0 || pool.length === 0) return []
  const take = Math.min(Math.floor(n), pool.length)
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (pool.length - i))
    const a = pool[i]!
    pool[i] = pool[j]!
    pool[j] = a
  }
  return pool.slice(0, take)
}

export type DealFromModeResult = {
  tags: TagSummary[]
  /** Human status when spill or short catalog happened. */
  status: string | null
  /** Per-slice how many were taken from that pool before spill. */
  sliceCounts: number[]
}

function shuffleInPlace<T>(arr: T[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = arr[i]!
    arr[i] = arr[j]!
    arr[j] = t
  }
}

/**
 * Pick one unused batch id for the reel (uniform among remaining).
 */
export function pickWheelWinner(
  batchIds: readonly number[],
  wheelUsedIds: readonly number[],
  rng: Rng = defaultRng,
): number | null {
  const used = new Set(wheelUsedIds)
  const eligible = batchIds.filter((id) => !used.has(id))
  if (!eligible.length) return null
  const i = Math.min(eligible.length - 1, Math.floor(rng() * eligible.length))
  return eligible[i] ?? null
}

/**
 * Odd row count ≤5 so the ticker centers; never larger than the pool (avoids
 * duplicate titles in the visible reel window).
 */
export function visibleRouletteReelRows(poolSize: number): number {
  if (poolSize <= 1) return 1
  const capped = Math.min(5, poolSize)
  return capped % 2 === 1 ? capped : capped - 1
}

export type RouletteStripItem = { id: number; title: string }

/**
 * Build a long spin strip by repeating the eligible pool in order.
 * Because each cycle is unique ids and `visible ≤ poolSize`, every contiguous
 * window of `visible` rows stays duplicate-free — including the landing frame
 * (unlike appending the winner after a full cycle, which could repeat it).
 */
export function buildRouletteSpinStrip(
  pool: readonly RouletteStripItem[],
  winnerId: number,
  visible: number,
  center: number,
): { labels: string[]; finalIndex: number } {
  if (!pool.length) {
    return { labels: [`Tag #${winnerId}`], finalIndex: 0 }
  }
  const labelFor = (id: number) =>
    pool.find((it) => it.id === id)?.title ?? `Tag #${id}`
  const order = pool.map((it) => it.id)
  if (!order.includes(winnerId)) order.push(winnerId)

  const afterNeed = Math.max(0, visible - center - 1)
  const trailingPad = center + 2
  const cycles = Math.max(4, Math.ceil(24 / Math.max(1, order.length)))
  const ids: number[] = []
  for (let c = 0; c < cycles; c++) ids.push(...order)

  const pickFinalIndex = (): number => {
    for (let i = ids.length - 1; i >= 0; i--) {
      if (ids[i] !== winnerId) continue
      if (i >= center && ids.length - 1 - i >= afterNeed) return i
    }
    return -1
  }

  let finalIndex = pickFinalIndex()
  while (finalIndex < 0) {
    ids.push(...order)
    finalIndex = pickFinalIndex()
  }
  while (ids.length - 1 - finalIndex < Math.max(afterNeed, trailingPad)) {
    ids.push(...order)
  }

  return { labels: ids.map(labelFor), finalIndex }
}

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
    const pool = sliceEligible(catalog, slice.pool, ctx)
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
      const pool = sliceEligible(catalog, slice.pool, ctx)
      const got = pickFrom(pool, slice.score, slice.curve, need)
      for (const t of got) {
        chosen.push(t)
        chosenIds.add(t.id)
      }
      need = n - chosen.length
    }
  }
  if (need > 0) {
    const fill = pickFrom(sliceEligible(catalog, 'all', ctx), 'uniform', 'equal', need)
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
  if (shortPools.length) {
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
  return {
    id,
    label,
    slices,
    batchSize: normalizeRouletteBatchSize(o.batchSize),
    batchOrder,
  }
}

/** Normalize weights to sum 100 for display/save. */
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

export function seedRouletteModes(): RouletteMode[] {
  return [
    {
      id: 'full-library-rating',
      label: 'All tags',
      batchSize: 10,
      batchOrder: 'random',
      slices: [{ weightPct: 100, pool: 'all', score: 'rating', curve: 'leftSkew' }],
    },
    {
      id: 'classic-equal',
      label: 'Classic tags',
      batchSize: 10,
      batchOrder: 'random',
      slices: [{ weightPct: 100, pool: 'classic', score: 'uniform', curve: 'equal' }],
    },
  ]
}

/** Built-in modes that cannot be deleted; only curve + score are editable. */
export const ROULETTE_BUILTIN_MODE_IDS = ['full-library-rating', 'classic-equal'] as const

export function isRouletteBuiltinModeId(id: string): boolean {
  return (ROULETTE_BUILTIN_MODE_IDS as readonly string[]).includes(id)
}

/** Keep built-ins present and structurally locked; preserve curve/score/batch size. */
export function ensureBuiltinRouletteModes(modes: readonly RouletteMode[]): RouletteMode[] {
  const seeds = seedRouletteModes()
  const byId = new Map(modes.map((m) => [m.id, m]))
  const out: RouletteMode[] = []
  for (const seed of seeds) {
    const existing = byId.get(seed.id)
    if (existing) {
      const slice = existing.slices[0] ?? seed.slices[0]!
      out.push({
        ...seed,
        batchSize: normalizeRouletteBatchSize(existing.batchSize),
        slices: [
          {
            weightPct: 100,
            pool: seed.slices[0]!.pool,
            score: slice.score,
            curve: slice.curve,
          },
        ],
      })
      byId.delete(seed.id)
    } else {
      out.push({
        ...seed,
        slices: seed.slices.map((s) => ({ ...s })),
      })
    }
  }
  for (const m of modes) {
    if (!isRouletteBuiltinModeId(m.id)) {
      out.push({
        ...m,
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
