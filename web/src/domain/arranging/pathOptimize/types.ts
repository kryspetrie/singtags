/**
 * Path Optimizer — modes, scopes, weights, and report types.
 */
import defaults from '../defaultWeights.json'
import type { ArrangementProject } from '../types'
import { clampTaste, type PathOptimizeTaste } from './taste'

export type PathOptimizeMode = 'fill' | 'revoice' | 'rechord' | 'full'

export type PathOptimizeScope =
  | { kind: 'whole' }
  | { kind: 'range'; startTick: number; endTick: number }
  | { kind: 'current'; tick: number }

export type { PathOptimizeTaste }

/**
 * Path Optimize taste / search weights.
 * `risk` 0 = Basic (obvious triads/sevenths, smooth T/B); 1 = Risky (color, leaps).
 * `voiceLeading` / `ring` remain for scorePath blend (derived from risk when omitted).
 * `taste` selects Classic / Circle / Busy candidate-gate profile.
 */
export type PathOptimizeWeights = {
  /** 0 = Basic (simple/obvious), 1 = Risky (adventurous). */
  risk: number
  voiceLeading: number
  ring: number
  cadenceBias: 'off' | 'moderate' | 'strong'
  /** Soft penalty weight on error lint count (0 = ignore). */
  issuePenalty: number
  /** Prefer existing chord when candidate is clearly worse than current (margin). */
  stayPutEpsilon: number
  /** Classic = pillar-first; Circle = mid-phrase sec-dom; Busy = freer passing. */
  taste: PathOptimizeTaste
}

/** Edit numbers in `../defaultWeights.json` — this is just the typed view. */
export const DEFAULT_PATH_OPTIMIZE_WEIGHTS: PathOptimizeWeights = {
  ...defaults.pathOptimize,
  cadenceBias: defaults.pathOptimize.cadenceBias as PathOptimizeWeights['cadenceBias'],
  taste: clampTaste((defaults.pathOptimize as { taste?: string }).taste),
}

/** Clamp risk to [0, 1]. */
export function clampRisk(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_PATH_OPTIMIZE_WEIGHTS.risk
  return Math.min(1, Math.max(0, n))
}

/**
 * Expand a Basic→Risky slider (+ optional cadence) into full optimize weights.
 * Basic leans home triads / smooth tenor-bass; Risky opens color and leaps.
 */
export function weightsFromRisk(
  risk: number,
  partial?: Partial<PathOptimizeWeights>,
): PathOptimizeWeights {
  const r = clampRisk(risk)
  // Basic → more VL budget; Risky → more ring/color budget.
  const voiceLeading = 0.82 - r * 0.45
  const ring = 1 - voiceLeading
  return {
    ...DEFAULT_PATH_OPTIMIZE_WEIGHTS,
    ...partial,
    risk: r,
    voiceLeading: partial?.voiceLeading ?? voiceLeading,
    ring: partial?.ring ?? ring,
    cadenceBias: partial?.cadenceBias ?? DEFAULT_PATH_OPTIMIZE_WEIGHTS.cadenceBias,
    taste: clampTaste(partial?.taste ?? DEFAULT_PATH_OPTIMIZE_WEIGHTS.taste),
  }
}

/** Hard ceiling for overlapping-window passes (UI + prefs). */
export const PATH_OPTIMIZE_MAX_PASSES = 500

/** Default when the caller omits maxPasses. */
export const PATH_OPTIMIZE_DEFAULT_PASSES = 12

export function clampPathOptimizePasses(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : PATH_OPTIMIZE_DEFAULT_PASSES
  return Math.min(PATH_OPTIMIZE_MAX_PASSES, Math.max(1, n))
}

export type PathOptimizeReport = {
  mode: PathOptimizeMode
  scope: PathOptimizeScope
  applied: boolean
  rejected: boolean
  rejectReason?: string
  changedStackIds: string[]
  changedCount: number
  scoreBefore: number
  scoreAfter: number
  message: string
  passes: number
  /**
   * Modes that would still change the chart from the post-run state
   * (dry-run, no explore). Empty ⇒ only Try again / tweak weights may help.
   */
  viableModes: PathOptimizeMode[]
  /** True when explore with another seed can produce a different stack path. */
  canTryAgain: boolean
}

export type PathOptimizeProgress = {
  stage: 'fill' | 'rechord' | 'revoice' | 'probe'
  /** 0-based among stages this run will execute. */
  stageIndex: number
  stageCount: number
  /** 1-based within stage. */
  pass: number
  maxPasses: number
}

export type PathOptimizeOpts = {
  mode: PathOptimizeMode
  scope: PathOptimizeScope
  weights?: Partial<PathOptimizeWeights>
  /** Ranker top-K per moment (default 12). */
  topK?: number
  /** Stochastic alternate among near-best candidates. */
  explore?: boolean
  temperature?: number
  seed?: number
  /** Ensemble voicing profile for Revoice (ranges / pitch center / outer span). */
  voicingProfile?: import('../voicingProfile').VoicingProfile
  /** Multi-pass overlapping windows (default 12, max 500). */
  maxPasses?: number
  /** Window width in moments (default 8). */
  windowWidth?: number
  /** Window hop in moments (default 3). */
  windowHop?: number
  /** Stop multi-pass when score gain &lt; this (default 0.2). */
  improveEpsilon?: number
  /**
   * When true (default), stop a stage once pass-to-pass score gain is below
   * improveEpsilon. When false, run all maxPasses and keep the best path seen.
   */
  stopEarly?: boolean
  /**
   * When true, skip the reject gate so a path may apply even if jumpiness /
   * motion / lint worsen vs the baseline.
   */
  allowWorsen?: boolean
  /** Skip viableModes / canTryAgain probing (used internally). */
  skipProbe?: boolean
  /** Fired between passes so the UI can paint a progress bar. */
  onProgress?: (p: PathOptimizeProgress) => void
}

export type PathOptimizeResult = {
  project: ArrangementProject
  report: PathOptimizeReport
}
