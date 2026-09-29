/**
 * Build a deep Learn lesson: glossary detail + TTBB notation + hearable stacks (key of C).
 */
import {
  glossaryById,
  notationExampleToAbc,
  notationExamplesForGlossary,
  type GlossaryEntry,
  type NotationExample,
} from '../../domain/arranging/education'
import { GLOSSARY_DETAILS } from '../../domain/arranging/education/glossaryDetails'
import { pcName, type VoicingPitches } from '../../domain/arranging/chords/chords'
import type { NotationRenderer } from '../../ports/NotationRenderer'

export type TeachChordView = {
  label: string
  annotation?: string
  /** Bass · Bari · Lead · Tenor pitch names. */
  makeup: string
  midi: VoicingPitches
}

export type TeachExampleView = {
  id: string
  title: string
  caption: string
  cite: string
  abc: string
  svg: string | null
  chords: TeachChordView[]
}

export type TeachImageView = {
  src: string
  alt: string
  caption?: string
}

export type TeachTopicView = {
  id: string
  term: string
  short: string
  detail: string
  makeup?: string
  citations: string[]
  images: TeachImageView[]
}

export type TeachLessonView = {
  title: string
  intro?: string
  keyHint: string
  topics: TeachTopicView[]
  examples: TeachExampleView[]
}

function midiPitchName(midi: number, flats = false): string {
  const n = Math.round(midi)
  return `${pcName(((n % 12) + 12) % 12, flats)}${Math.floor(n / 12) - 1}`
}

function chordMakeup(midi: VoicingPitches): string {
  return [
    `Bass ${midiPitchName(midi.bass)}`,
    `Bari ${midiPitchName(midi.bari)}`,
    `Lead ${midiPitchName(midi.lead)}`,
    `Tenor ${midiPitchName(midi.tenor)}`,
  ].join(' · ')
}

/** Resolve a path under web/public for Vite BASE_URL. */
export function educationAssetUrl(path: string): string {
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('blob:')
  ) {
    return path
  }
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  const rel = path.replace(/^\//, '')
  return `${base}/${rel}`
}

function topicFromGlossary(g: GlossaryEntry): TeachTopicView {
  const extra = GLOSSARY_DETAILS[g.id]
  return {
    id: g.id,
    term: g.term,
    short: g.short,
    detail: extra?.detail ?? g.short,
    makeup: extra?.makeup,
    citations: g.citations.map((c) => (c.detail ? `${c.label} — ${c.detail}` : c.label)),
    images: (extra?.images ?? []).map((img) => ({
      src: educationAssetUrl(img.src),
      alt: img.alt,
      caption: img.caption,
    })),
  }
}

function exampleView(ex: NotationExample, renderer?: NotationRenderer): TeachExampleView {
  const abc = notationExampleToAbc(ex)
  let svg: string | null = null
  if (renderer) {
    try {
      svg = renderer.renderSvg(abc)
    } catch {
      svg = null
    }
  }
  return {
    id: ex.id,
    title: ex.title,
    caption: ex.caption,
    cite: ex.conceptCite,
    abc,
    svg,
    chords: ex.chords.map((ch) => ({
      label: ch.label,
      annotation: ch.annotation,
      makeup: chordMakeup(ch.midi),
      midi: { ...ch.midi },
    })),
  }
}

function collectExamples(glossaryIds: readonly string[]): NotationExample[] {
  const seen = new Set<string>()
  const out: NotationExample[] = []
  for (const id of glossaryIds) {
    for (const ex of notationExamplesForGlossary(id)) {
      if (seen.has(ex.id)) continue
      seen.add(ex.id)
      out.push(ex)
    }
  }
  return out
}

export function buildTeachLesson(opts: {
  title: string
  glossaryIds: readonly string[]
  intro?: string
  renderer?: NotationRenderer
}): TeachLessonView {
  const seen = new Set<string>()
  const topics: TeachTopicView[] = []
  for (const id of opts.glossaryIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const g = glossaryById(id)
    if (g) topics.push(topicFromGlossary(g))
  }
  const examples = collectExamples(opts.glossaryIds).map((ex) =>
    exampleView(ex, opts.renderer),
  )
  return {
    title: opts.title,
    intro: opts.intro,
    keyHint: 'Examples default to the key of C major.',
    topics,
    examples,
  }
}
