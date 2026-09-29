/**
 * Suggest applyable multi-moment cadence plans for a phrase window.
 */
import { CADENCE_CATALOG } from './catalog'
import { materializeCadenceSteps } from './materialize'
import { scaleForBias } from './prefs'
import type { CadenceContext, CadenceBias, PhraseRole } from './types'
import type {
  CadencePlanMoment,
  CadencePlanPillar,
  CadencePlanSketchSpan,
  CadenceSuggestion,
  SuggestCadencesForPhraseOpts,
} from './planTypes'

function pc(n: number): number {
  return ((n % 12) + 12) % 12
}

function spanCovers(span: CadencePlanSketchSpan, tick: number): boolean {
  return tick >= span.startTick && tick < span.endTick
}

function sketchAt(
  spans: readonly CadencePlanSketchSpan[] | undefined,
  tick: number,
): CadencePlanSketchSpan | undefined {
  if (!spans?.length) return undefined
  return spans.find((s) => spanCovers(s, tick))
}

function pillarNear(
  pillars: readonly CadencePlanPillar[] | undefined,
  tick: number,
  ahead: boolean,
): number | null {
  if (!pillars?.length) return null
  if (ahead) {
    const next = pillars
      .filter((p) => p.startTick > tick)
      .sort((a, b) => a.startTick - b.startTick)[0]
    return next ? pc(next.rootPc) : null
  }
  const prev = pillars
    .filter((p) => p.startTick <= tick)
    .sort((a, b) => b.startTick - a.startTick)[0]
  return prev ? pc(prev.rootPc) : null
}

function buildContext(
  moments: readonly CadencePlanMoment[],
  i: number,
  opts: SuggestCadencesForPhraseOpts,
): CadenceContext {
  const m = moments[i]!
  const prev = i > 0 ? moments[i - 1] : undefined
  const next = i + 1 < moments.length ? moments[i + 1] : undefined
  const prevSketch = prev ? sketchAt(opts.sketchSpans, prev.startTick) : undefined
  const nextSketch = next ? sketchAt(opts.sketchSpans, next.startTick) : undefined
  const curSketch = sketchAt(opts.sketchSpans, m.startTick)
  const role: PhraseRole | undefined = opts.phraseRoles?.[i]

  return {
    tonality: opts.tonality,
    mode: opts.mode ?? 'major',
    melodyMidi: m.melodyMidi,
    nextMelodyMidi: next?.melodyMidi ?? null,
    prevMelodyMidi: prev?.melodyMidi ?? null,
    prevRootPc: prevSketch?.rootPc ?? null,
    prevNatureId: prevSketch?.natureId ?? null,
    nextPillarRoot: pillarNear(opts.pillars, m.startTick, true),
    pillarRoot: pillarNear(opts.pillars, m.startTick, false) ?? curSketch?.rootPc ?? null,
    phraseRole: role,
    lockedNeighbors: {
      before:
        prevSketch?.locked ?
          { rootPc: prevSketch.rootPc, natureId: prevSketch.natureId }
        : null,
      after:
        nextSketch?.locked ?
          { rootPc: nextSketch.rootPc, natureId: nextSketch.natureId }
        : null,
    },
  }
}

function conflictsFor(
  steps: CadenceSuggestion['steps'],
  startIndex: number,
  moments: readonly CadencePlanMoment[],
  sketchSpans: readonly CadencePlanSketchSpan[] | undefined,
): string[] {
  const out: string[] = []
  for (const st of steps) {
    const mi = startIndex + st.momentOffset
    if (mi >= moments.length) {
      out.push(`Needs moment +${st.momentOffset} (${st.label}) — phrase ends early`)
      continue
    }
    const tick = moments[mi]!.startTick
    const sk = sketchAt(sketchSpans, tick)
    if (sk?.locked && pc(sk.rootPc) !== pc(st.rootPc)) {
      out.push(
        `Locked Sketch ${sk.natureId} root ${sk.rootPc} conflicts with plan ${st.label}`,
      )
    }
  }
  return out
}

function allowPriority(bias: CadenceBias, priority: number): boolean {
  if (bias === 'off') return false
  if (bias === 'moderate' && priority >= 3) return false
  return true
}

/** Same chord sequence (e.g. V7→I from auth vs tag vs leading-tone) collapses together. */
export function cadencePlanFingerprint(plan: Pick<CadenceSuggestion, 'steps'>): string {
  return plan.steps.map((s) => `${pc(s.rootPc)}:${s.natureId}`).join('>')
}

function preferPlan(a: CadenceSuggestion, b: CadenceSuggestion): CadenceSuggestion {
  // Earlier start wins (closer to the selected moment when scanning forward).
  if (a.startMomentIndex !== b.startMomentIndex) {
    return a.startMomentIndex < b.startMomentIndex ? a : b
  }
  if (a.priority !== b.priority) return a.priority < b.priority ? a : b
  if (a.strength !== b.strength) return a.strength >= b.strength ? a : b
  return a
}

/**
 * Collapse catalog aliases / later repeats of the same chord path.
 * Keeps the earliest, highest-priority, strongest plan per fingerprint.
 */
export function dedupeCadencePlans(
  plans: readonly CadenceSuggestion[],
): CadenceSuggestion[] {
  const best = new Map<string, CadenceSuggestion>()
  for (const p of plans) {
    const key = cadencePlanFingerprint(p)
    const prev = best.get(key)
    best.set(key, prev ? preferPlan(prev, p) : p)
  }
  return [...best.values()]
}

/**
 * Ranked cadence plans for a Lead phrase (multi-moment, applyable steps).
 */
export function suggestCadencesForPhrase(
  opts: SuggestCadencesForPhraseOpts,
): CadenceSuggestion[] {
  const bias: CadenceBias = opts.bias ?? 'strong'
  if (bias === 'off' || !opts.moments.length) return []

  const from = Math.max(0, opts.fromIndex ?? 0)
  const limit = opts.limit ?? 12
  const out: CadenceSuggestion[] = []
  const seen = new Set<string>()

  for (let i = from; i < opts.moments.length; i++) {
    const ctx = buildContext(opts.moments, i, opts)
    for (const def of CADENCE_CATALOG) {
      if (!allowPriority(bias, def.priority)) continue
      const match = def.matchContext(ctx)
      if (!match.hit) continue
      const scaled = match.strength * scaleForBias(bias)
      if (scaled <= 0) continue
      const steps = materializeCadenceSteps(def, ctx)
      if (!steps?.length) continue
      const id = `${def.id}@${i}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push({
        id,
        cadenceId: def.id,
        label: def.label,
        teach: def.teachWhy(ctx),
        glossaryIds: def.glossaryIds,
        strength: scaled,
        priority: def.priority,
        startMomentIndex: i,
        steps,
        conflicts: conflictsFor(steps, i, opts.moments, opts.sketchSpans),
        evidence: def.shortTeach,
      })
    }
  }

  const deduped = dedupeCadencePlans(out)
  deduped.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    if (b.strength !== a.strength) return b.strength - a.strength
    return a.startMomentIndex - b.startMomentIndex
  })
  return deduped.slice(0, limit)
}
