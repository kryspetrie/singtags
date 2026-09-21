/**
 * Resolve teachable moments for wizard steps, lints, rule tags, candidates.
 * Notation: ABC from domain; SVG via optional NotationRenderer (abcjs adapter).
 */
import { explainRankingBreakdown } from '../harmonize/candidateRanker'
import type { HarmonizeCandidate, UnscoredCandidate } from '../harmonize/types'
import type { RankerDeps } from '../harmonize/candidateRanker'
import { explainCandidate } from '../coachCopy'
import type { NotationRenderer } from '../../../ports/NotationRenderer'
import {
  GLOSSARY,
  LESSONS,
  LINT_LESSON_ALIASES,
} from './catalog'
import type { GlossaryEntry, LessonCard, TeachableMoment } from './types'
import type { NotationSnippet } from './notation/types'
import {
  notationExampleById,
  notationExamplesForLesson,
} from './notation'
import { notationExampleToAbc } from './notation/toAbc'

export function glossaryById(id: string): GlossaryEntry | undefined {
  return GLOSSARY.find((g) => g.id === id)
}

export function lessonById(id: string): LessonCard | undefined {
  return LESSONS.find((l) => l.id === id)
}

export function lessonForWizardStep(step: string): LessonCard | undefined {
  return LESSONS.find((l) => l.wizardStep === step)
}

export function lessonForRuleTag(tag: string): LessonCard | undefined {
  return LESSONS.find((l) => l.ruleTag === tag)
}

export function lessonForLintRule(ruleId: string): LessonCard | undefined {
  const direct = LESSONS.find((l) => l.lintRuleId === ruleId)
  if (direct) return direct
  const alias = LINT_LESSON_ALIASES[ruleId]
  if (!alias) return undefined
  return (
    LESSONS.find((l) => l.lintRuleId === alias) ??
    LESSONS.find((l) => l.wizardStep === alias) ??
    LESSONS.find((l) => l.ruleTag === alias) ??
    LESSONS.find((l) => l.id === alias)
  )
}

export function lessonForFactor(factorId: string): LessonCard | undefined {
  return LESSONS.find((l) => l.factorId === factorId)
}

function attachNotation(
  lesson: LessonCard | undefined,
  renderer?: NotationRenderer,
): NotationSnippet[] | undefined {
  const examples = lesson
    ? [
        ...(lesson.exampleIds ?? []).map((id) => notationExampleById(id)).filter(Boolean),
        ...notationExamplesForLesson(lesson.id),
      ]
    : []
  const seen = new Set<string>()
  const out: NotationSnippet[] = []
  for (const ex of examples) {
    if (!ex || seen.has(ex.id)) continue
    seen.add(ex.id)
    const abc = notationExampleToAbc(ex)
    const snippet: NotationSnippet = {
      id: ex.id,
      title: ex.title,
      caption: ex.caption,
      abc,
    }
    if (renderer) {
      try {
        snippet.svg = renderer.renderSvg(abc)
      } catch {
        /* renderer unavailable in bare node */
      }
    }
    out.push(snippet)
  }
  return out.length ? out : undefined
}

function glossariesFor(lesson: LessonCard | undefined): GlossaryEntry[] {
  if (!lesson) return []
  return lesson.glossaryIds
    .map((id) => glossaryById(id))
    .filter((g): g is GlossaryEntry => g != null)
}

function momentFromLesson(
  lesson: LessonCard,
  renderer?: NotationRenderer,
): TeachableMoment {
  const notation = attachNotation(lesson, renderer)
  return {
    headline: lesson.title,
    body: lesson.body,
    lesson,
    glossary: glossariesFor(lesson),
    citations: [...lesson.citations],
    notation,
    notationSvgs: notation
      ?.filter((n) => n.svg)
      .map((n) => ({ id: n.id, title: n.title, caption: n.caption, svg: n.svg! })),
  }
}

/** Tip-strip / Learn panel for the current wizard step. */
export function teachWizardStep(
  step: string,
  renderer?: NotationRenderer,
): TeachableMoment | null {
  const lesson = lessonForWizardStep(step)
  return lesson ? momentFromLesson(lesson, renderer) : null
}

/** Learn panel when user opens a lint. */
export function teachLint(
  ruleId: string,
  lintMessage?: string,
  renderer?: NotationRenderer,
): TeachableMoment {
  const lesson = lessonForLintRule(ruleId)
  if (lesson) {
    return {
      ...momentFromLesson(lesson, renderer),
      body: lintMessage ? `${lesson.body} (${lintMessage})` : lesson.body,
    }
  }
  return {
    headline: 'Issue',
    body: lintMessage ?? 'Review this spot against contest style and voice leading.',
    glossary: [],
    citations: [],
  }
}

/** Why? for a ranked candidate — live factors + theory lessons. */
export function teachCandidate(
  candidate: HarmonizeCandidate,
  opts?: {
    unscored?: UnscoredCandidate
    rankerDeps?: RankerDeps
    renderer?: NotationRenderer
  },
): TeachableMoment {
  const why = explainCandidate(candidate)
  const tagLesson =
    candidate.ruleTags.map((t) => lessonForRuleTag(t)).find(Boolean) ??
    (candidate.layer === 'primary' ? lessonById('L-f-primary') : lessonById('L-step5'))

  const factors =
    opts?.unscored != null
      ? explainRankingBreakdown(opts.unscored, opts.rankerDeps).map((f) => ({
          label: f.label,
          value: Math.round(f.value * 100) / 100,
          hint: lessonForFactor(f.label)?.title,
        }))
      : undefined

  const glossary = [
    ...glossariesFor(tagLesson),
    ...why.ruleTags
      .map((t) => lessonForRuleTag(t))
      .flatMap((l) => glossariesFor(l)),
  ]
  const seen = new Set<string>()
  const uniqueGloss = glossary.filter((g) => {
    if (seen.has(g.id)) return false
    seen.add(g.id)
    return true
  })

  const notation = attachNotation(tagLesson, opts?.renderer)

  return {
    headline: tagLesson?.title ?? `${candidate.natureId} candidate`,
    body: tagLesson?.body ?? why.bullets[0] ?? 'Ranked under contest profile and Approach Three motion.',
    lesson: tagLesson,
    glossary: uniqueGloss,
    citations: tagLesson ? [...tagLesson.citations] : [],
    factors,
    notation,
    notationSvgs: notation
      ?.filter((n) => n.svg)
      .map((n) => ({ id: n.id, title: n.title, caption: n.caption, svg: n.svg! })),
  }
}

/** Short toast after a successful fix. */
export function teachAfterFix(ruleId: string): { title: string; body: string } {
  const lesson = lessonForLintRule(ruleId)
  return {
    title: lesson?.title ?? 'Fixed',
    body: lesson?.body ?? 'Applied a style-aware repair. Undo if you preferred the previous take.',
  }
}

export function allGlossary(): readonly GlossaryEntry[] {
  return GLOSSARY
}

export function allLessons(): readonly LessonCard[] {
  return LESSONS
}
