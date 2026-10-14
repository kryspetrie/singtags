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

export type CoachFocusTab = 'home' | 'now' | 'choose' | 'check' | 'auto' | 'polish'

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
    | 'resolve_passing'
    | 'fix_issues'
    | 'done'
}

export function resolveCoachNextAction(opts: {
  project: ArrangementProject | null
  mode: CoachUiMode
  lints: readonly ArrangementLint[]
  momentsLen?: number
  /**
   * Tag Studio already has locked Sketch and/or Detected spans —
   * skip “mark pillars first” and go to Choose chords.
   */
  hasSoftHarmonyMap?: boolean
  /**
   * Lead onsets under Sketch that are not chord tones (Approach One leftovers).
   */
  passingMismatchCount?: number
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
    if (opts.hasSoftHarmonyMap) {
      return {
        id: 'walk_choose',
        title: 'Choose chords',
        body: 'Sketch/Detected already map the phrase — step moments and Apply voicings. Strong vs passing Lead roles guide home roots.',
        cta: 'Choose chords',
        focus: 'choose',
        kind: 'walk_choose',
      }
    }
    return {
      id: 'suggest_pillars',
      title: 'Paint phrase chords on Sketch',
      body: repair
        ? 'Harmony is already on the roll. Lock phrase chords in Sketch (stacks stay put). Mark Strong vs passing Lead notes so Coach knows the homes.'
        : 'Open Sketch and lock phrase chords. Coach homes come from Strong vs passing Lead notes — not manual pillar tags.',
      cta: 'Open Sketch',
      focus: 'home',
      kind: 'suggest_pillars',
    }
  }

  const gaps = melodyGapsOutsidePillars(p.melody, p.pillars)
  if (gaps.length) {
    return {
      id: 'cover_gaps',
      title: 'Cover uncovered melody',
      body: `${gaps.length} Lead onset(s) sit before the first Sketch chord — extend Sketch earlier, or mark an earlier Strong melody note.`,
      cta: 'Open Sketch',
      focus: 'home',
      kind: 'cover_gaps',
    }
  }

  const unconfirmed = p.pillars.filter((x) => !x.confirmed).length
  if (unconfirmed) {
    return {
      id: 'lock_pillars',
      title: repair && known > 0 ? 'Confirm draft homes' : 'Confirm draft homes',
      body:
        repair && known > 0
          ? `${unconfirmed} draft home root(s) still on the Coach lane. Prefer Strong/passing roles + Sketch chords; Lock only if you used Propose.`
          : `${unconfirmed} draft home root(s) — paint Sketch chords and check Strong/passing roles, or Lock a Coach draft if you Proposed one.`,
      cta: 'Open Sketch',
      focus: 'home',
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

  const passingN = opts.passingMismatchCount ?? 0
  if (passingN > 0) {
    return {
      id: 'resolve_passing',
      title: 'Resolve passing tones',
      body: `${passingN} Lead note(s) don’t fit the covering Sketch chord — Apply carves short Sketch chords and stacks.`,
      cta: 'Resolve passing',
      focus: 'choose',
      kind: 'resolve_passing',
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
      ? 'No blockers — run Auto passes, then skim Polish.'
      : 'No blockers — keep walking or open Auto for whole-chart tools.',
    cta: 'Auto',
    focus: 'auto',
    kind: 'done',
  }
}

/** Default focus tab for a session mode. */
export function defaultFocusForMode(mode: CoachUiMode): CoachFocusTab {
  if (mode === 'review') return 'check'
  return 'home'
}
