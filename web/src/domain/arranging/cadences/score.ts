/**
 * Aggregate cadence scoring for Detected + Coach.
 */
import { CADENCE_CATALOG } from './catalog'
import { scaleForBias } from './prefs'
import type {
  CadenceBias,
  CadenceCandidate,
  CadenceContext,
  CadenceHint,
  CadencePriority,
} from './types'

export type CadenceScoreOpts = {
  /** Include priority-3 color cadences (default false for Detected). */
  includeColor?: boolean
  /** Max priority included (default 2 for Detected, 3 when includeColor). */
  maxPriority?: CadencePriority
  bias?: CadenceBias
}

export type CadenceScoreResult = {
  /** Sum of scaled boosts from matching cadences. */
  boost: number
  /** Best matching hint for UI / Why? (highest |boost| among hits). */
  hint: CadenceHint | null
  /** Per-cadence contributions (non-zero only). */
  parts: { id: string; label: string; value: number; teach: string }[]
}

function biasScale(bias: CadenceBias | undefined): number {
  // Default Strong; UI/application passes loadCadenceBias() when wiring RankerDeps.
  return scaleForBias(bias ?? 'strong')
}

/**
 * Score how well a candidate fits classic cadence patterns in context.
 */
export function scoreCadenceFit(
  cand: CadenceCandidate,
  ctx: CadenceContext,
  opts: CadenceScoreOpts = {},
): CadenceScoreResult {
  const scale = biasScale(opts.bias)
  if (scale <= 0) {
    return { boost: 0, hint: null, parts: [] }
  }
  const maxP: CadencePriority = opts.maxPriority ?? (opts.includeColor ? 3 : 2)
  let boost = 0
  let best: { abs: number; hint: CadenceHint; value: number } | null = null
  const parts: CadenceScoreResult['parts'] = []

  for (const def of CADENCE_CATALOG) {
    if (def.priority > maxP) continue
    const m = def.matchContext(ctx)
    if (!m.hit) continue
    const raw = def.boostCandidate(cand, ctx)
    if (raw === 0) continue
    const value = raw * scale
    boost += value
    parts.push({
      id: def.id,
      label: def.label,
      value,
      teach: def.teachWhy(ctx),
    })
    const abs = Math.abs(value)
    if (!best || abs > best.abs) {
      best = {
        abs,
        value,
        hint: {
          id: def.id,
          label: def.label,
          teach: def.teachWhy(ctx),
          glossaryIds: def.glossaryIds,
          priority: def.priority,
        },
      }
    }
  }

  return { boost, hint: best?.hint ?? null, parts }
}

/**
 * Best cadence hint for this moment (any matching pattern), independent of a specific chord.
 * Used for Coach tips when focus melody implies a classic move.
 */
export function cadenceHintForContext(
  ctx: CadenceContext,
  opts: CadenceScoreOpts = {},
): CadenceHint | null {
  const scale = biasScale(opts.bias)
  if (scale <= 0) return null
  const maxP: CadencePriority = opts.maxPriority ?? 2
  let best: { strength: number; hint: CadenceHint } | null = null
  for (const def of CADENCE_CATALOG) {
    if (def.priority > maxP) continue
    const m = def.matchContext(ctx)
    if (!m.hit) continue
    if (!best || m.strength > best.strength) {
      best = {
        strength: m.strength,
        hint: {
          id: def.id,
          label: def.label,
          teach: def.teachWhy(ctx),
          glossaryIds: def.glossaryIds,
          priority: def.priority,
        },
      }
    }
  }
  return best?.hint ?? null
}

/**
 * Soft Check/Review nudge when a locked stack breaks an obvious authentic cadence.
 * Returns a short message or null.
 */
export function cadenceMissMessage(
  locked: CadenceCandidate,
  ctx: CadenceContext,
): { id: string; message: string; teachingId: string; suggest?: CadenceCandidate } | null {
  const auth = CADENCE_CATALOG.find((c) => c.id === 'auth_v7_i')
  if (!auth) return null
  const m = auth.matchContext(ctx)
  if (!m.hit || melIsFiveToOne(ctx) === false) return null
  const deg = ((locked.rootPc - ctx.tonality) % 12 + 12) % 12
  // Locked I / I7 under ^5→^1 is the classic miss.
  if (deg === 0) {
    return {
      id: 'cadence-miss-auth-v7-i',
      message: 'Lead ^5→^1 usually wants V7→I — try V7 under this tone instead of I.',
      teachingId: 'classic_cadences',
      suggest: { rootPc: ((ctx.tonality + 7) % 12 + 12) % 12, natureId: 'seventh' },
    }
  }
  return null
}

function melIsFiveToOne(ctx: CadenceContext): boolean {
  if (ctx.nextMelodyMidi == null) return false
  const mel = ((ctx.melodyMidi - ctx.tonality) % 12 + 12) % 12
  const next = ((ctx.nextMelodyMidi - ctx.tonality) % 12 + 12) % 12
  return mel === 7 && next === 0
}
