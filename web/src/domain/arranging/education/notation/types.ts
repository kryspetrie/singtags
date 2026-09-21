/**
 * Pedagogical notation miniatures — original illustrations of concepts we teach.
 * Not OCR reconstructions of copyrighted manual engravings.
 *
 * Rendering: convert to ABC (`toAbc`) then draw with abcjs adapter — do not
 * hand-roll engravers in domain.
 */
export type NotationVoice = 'bass' | 'bari' | 'lead' | 'tenor'

export type NotationChord = {
  /** Label above the staff (e.g. "V7", "I"). */
  label: string
  /** Duration in quarter-notes (1 = quarter). */
  quarters: number
  midi: Record<NotationVoice, number>
  /** Optional highlight (e.g. bad tenor). */
  highlight?: Partial<Record<NotationVoice, 'ok' | 'warn' | 'bad'>>
  annotation?: string
}

export type NotationExample = {
  id: string
  title: string
  caption: string
  /** Lessons / glossary this illustrates */
  lessonIds: string[]
  glossaryIds: string[]
  /** Conceptual citation (topic), not a facsimile of a manual figure */
  conceptCite: string
  /** Always TTBB: tenor staff + bass staff */
  clef: 'ttbb'
  chords: NotationChord[]
}

export type NotationSnippet = {
  id: string
  title: string
  caption: string
  /** ABC source — preferred for UI (render via NotationRenderer / abcjs) */
  abc: string
  /** Optional pre-rendered SVG if a renderer was injected */
  svg?: string
}

export type RenderStaffOptions = {
  width?: number
  height?: number
  showVoiceLabels?: boolean
}
