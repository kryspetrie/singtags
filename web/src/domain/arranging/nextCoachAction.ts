/**
 * Pure next-action resolver for Coach NextActionBanner.
 */
import { melodyGapsOutsidePillars } from './pillars'
import type { ArrangementLint } from './qa/types'
import type { ArrangementProject } from './types'
import type { CoachUiMode } from './coachTips'

export type CoachFocusTab = 'now' | 'choose' | 'check' | 'polish'

export type CoachNextAction = {
  id: string
  title: string
  body: string
  cta: string
  /** Suggested focus tab after taking the action (UI hint). */
  focus?: CoachFocusTab
  kind:
    | 'enter_melody'
    | 'suggest_pillars'
    | 'lock_pillars'
    | 'cover_gaps'
    | 'walk_choose'
    | 'fix_issues'
    | 'done'
}

export function resolveCoachNextAction(opts: {
  project: ArrangementProject | null
  mode: CoachUiMode
  lints: readonly ArrangementLint[]
}): CoachNextAction {
  const p = opts.project
  if (!p || !p.melody.length) {
    return {
      id: 'enter_melody',
      title: 'Start with the lead',
      body: 'Enter the Lead melody on the roll, then open Coach again.',
      cta: 'Close coach',
      kind: 'enter_melody',
    }
  }

  if (!p.pillars.length) {
    const hasStacks = p.stacks.length > 0
    return {
      id: 'suggest_pillars',
      title: hasStacks ? 'Add pillars under this chart' : 'Suggest pillars',
      body: hasStacks
        ? 'You already have harmony notes. Suggest pillars so Choose can rank chords — stacks stay put.'
        : 'Lock home chords under each phrase, then walk chord choices.',
      cta: 'Suggest pillars',
      focus: 'now',
      kind: 'suggest_pillars',
    }
  }

  const gaps = melodyGapsOutsidePillars(p.melody, p.pillars)
  if (gaps.length) {
    return {
      id: 'cover_gaps',
      title: 'Cover uncovered melody',
      body: `${gaps.length} lead onset(s) sit outside a pillar span.`,
      cta: 'Show gaps',
      focus: 'now',
      kind: 'cover_gaps',
    }
  }

  const unconfirmed = p.pillars.filter((x) => !x.confirmed).length
  if (unconfirmed && opts.mode !== 'review') {
    return {
      id: 'lock_pillars',
      title: 'Lock pillars',
      body: `${unconfirmed} pillar(s) still draft — Hear the root, then Lock.`,
      cta: 'Review pillars',
      focus: 'now',
      kind: 'lock_pillars',
    }
  }

  const errors = opts.lints.filter((l) => l.severity === 'error')
  if (opts.mode === 'review' && errors.length) {
    return {
      id: 'fix_issues',
      title: 'Fix chart issues',
      body: `${errors.length} error(s) need attention.`,
      cta: 'Open issues',
      focus: 'check',
      kind: 'fix_issues',
    }
  }

  const filled = p.melody.filter((m) => p.stacks.some((s) => s.startTick === m.startTick)).length
  if (filled < p.melody.length && opts.mode !== 'review') {
    return {
      id: 'walk_choose',
      title: 'Choose chords',
      body: `${filled}/${p.melody.length} lead onsets have a stack — step moments and Apply.`,
      cta: 'Choose chords',
      focus: 'choose',
      kind: 'walk_choose',
    }
  }

  if (opts.lints.some((l) => l.severity === 'error' || l.severity === 'warn')) {
    return {
      id: 'fix_issues',
      title: 'Review remaining issues',
      body: 'Harmony is in place — clear warnings when you are ready.',
      cta: 'Open issues',
      focus: 'check',
      kind: 'fix_issues',
    }
  }

  return {
    id: 'done',
    title: 'Looking good',
    body: 'No blockers — keep polishing or export when ready.',
    cta: 'Open issues',
    focus: 'check',
    kind: 'done',
  }
}

/** Default focus tab for a session mode. */
export function defaultFocusForMode(mode: CoachUiMode): CoachFocusTab {
  if (mode === 'review') return 'check'
  if (mode === 'guided') return 'now'
  return 'choose'
}
