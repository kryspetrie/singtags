/**
 * Educational DTOs — paraphrased teaching units with source citations.
 * Content mirrors knowledge/16-teachable-curriculum.md (no OCR verbatim).
 */
export type EducationSourceId = 'bam1980' | 'rylander' | 'szabo' | 'prietto' | 'feasibility'

export type SourceCitation = {
  sourceId: EducationSourceId
  label: string
  detail?: string
}

export type GlossaryEntry = {
  id: string
  term: string
  short: string
  citations: SourceCitation[]
}

export type LessonCard = {
  id: string
  title: string
  body: string
  glossaryIds: string[]
  citations: SourceCitation[]
  /** Optional bindings for lookup */
  wizardStep?: string
  ruleTag?: string
  lintRuleId?: string
  factorId?: string
  /** Pedagogical notation miniatures */
  exampleIds?: string[]
}

export type TeachableMoment = {
  headline: string
  body: string
  lesson?: LessonCard
  glossary: GlossaryEntry[]
  citations: SourceCitation[]
  /** Live ranking / score factors when explaining a candidate */
  factors?: { label: string; value: number; hint?: string }[]
  /** Notation miniatures (ABC + optional SVG from adapter) */
  notation?: import('./notation/types').NotationSnippet[]
  /** @deprecated use notation[].svg */
  notationSvgs?: { id: string; title: string; caption: string; svg: string }[]
}
