/**
 * Pure next-action resolver for Coach NextActionBanner.
 */
import { melodyGapsOutsidePillars } from './pillars'
import type { ArrangementLint } from './qa/types'
import type { ArrangementProject } from './types'
import type { CoachUiMode } from './coachTips'
import {
  detectCoachEntryMode,
  knownStackCoverage,
  knownStackCount,
} from './coachEntryMode'

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
  momentsLen?: number
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

  const entry = detectCoachEntryMode(p, opts.momentsLen)
  const repair = entry === 'repair'
  const coverage = knownStackCoverage(p, opts.momentsLen)
  const known = knownStackCount(p)
  const unrecognized = p.stacks.filter((s) => s.midi && (!s.natureId || s.natureId === 'unknown'))
    .length

  if (!p.pillars.length) {
    return {
      id: 'suggest_pillars',
      title: repair ? 'Add pillars under this chart' : 'Suggest pillars',
      body: repair
        ? 'Harmony is already on the roll. Suggest pillars so Check and Strengthen can rank fixes — stacks stay put.'
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
  if (unconfirmed) {
    return {
      id: 'lock_pillars',
      title: repair && known > 0 ? 'Lock pillars (for Strengthen)' : 'Lock pillars',
      body:
        repair && known > 0
          ? `${unconfirmed} draft pillar(s). Lock when you want Strengthen; issues can wait.`
          : `${unconfirmed} pillar(s) still draft — Hear the root, then Lock.`,
      cta: 'Review pillars',
      focus: 'now',
      kind: 'lock_pillars',
    }
  }

  const errors = opts.lints.filter((l) => l.severity === 'error')
  const triageLints = opts.lints.filter(
    (l) =>
      l.severity === 'error' ||
      l.severity === 'warn' ||
      l.ruleId === 'unrecognized-nature',
  )

  if (repair && (errors.length || unrecognized > 0 || triageLints.length)) {
    return {
      id: 'fix_issues',
      title: unrecognized ? 'Identify or fix chords' : 'Fix chart issues',
      body: unrecognized
        ? `${unrecognized} unrecognized chord(s)${errors.length ? ` · ${errors.length} error(s)` : ''}.`
        : `${triageLints.length} issue(s) need attention.`,
      cta: 'Open issues',
      focus: 'check',
      kind: 'fix_issues',
    }
  }

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

  if (coverage < 1 && (!repair || coverage < 0.85)) {
    return {
      id: 'walk_choose',
      title: repair ? 'Fill remaining gaps' : 'Choose chords',
      body: `${known}/${Math.max(1, opts.momentsLen ?? p.melody.length)} moments have a known chord — step and Apply.`,
      cta: repair ? 'Fill gaps' : 'Choose chords',
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
    body: repair
      ? 'No blockers — Strengthen or export when ready.'
      : 'No blockers — keep polishing or export when ready.',
    cta: 'Polish',
    focus: 'polish',
    kind: 'done',
  }
}

/** Default focus tab for a session mode. */
export function defaultFocusForMode(mode: CoachUiMode): CoachFocusTab {
  if (mode === 'review') return 'check'
  return 'now'
}
