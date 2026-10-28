/**
 * How-to copy for Tag Studio harmony tools (Chords panel + chord lanes).
 * Kept as data so UI stays thin and tips stay consistent.
 * Lane “i” tips stay short (overview only) — hover popovers are not manuals.
 */

export type HarmonyHowToSection = {
  title: string
  body: string
  steps?: readonly string[]
}

/** Chords panel: declare vs realize, vs Coach. */
export const HARMONIZE_PANEL_HOWTO: readonly HarmonyHowToSection[] = [
  {
    title: 'What this panel is for',
    body:
      'Chords is a hand tool for the current melody note or Sketch span — pick a root and chord quality, preview, and optionally place a TTBB stack.',
  },
  {
    title: 'Melody comes from the Melody tool',
    body:
      'Lead carries the tune. Toolbar → Melody, then M on a note, hands the melody to that part until the next change.',
  },
  {
    title: 'Sketch vs Stack',
    body:
      'Same chord list and layout. Sketch writes the harmony map only (inversion/spread disabled). Stack also places a TTBB voicing for this melody note.',
  },
  {
    title: 'Catalog vs Coach',
    body:
      'Catalog is the full chord list with no ranking. Coach is the same list with ranked highlights for the moment under the playhead. Apply always writes the chord and inversion you selected — not a different Coach MIDI stack.',
  },
  {
    title: 'Workflow',
    body:
      'Declare the map first (Sketch), audition by ear, then Realize or Stack when you want sung parts. Undo is global (Ctrl+Z).',
  },
]

/** Alias used by TagRollChordsPanel. */
export const HARMONIZE_HOWTO = HARMONIZE_PANEL_HOWTO
export const CHORDS_HOWTO = HARMONIZE_PANEL_HOWTO

/** Toolbar melody handoff (Lead until the tune moves to another part). */
export const ROLES_HOWTO: readonly HarmonyHowToSection[] = [
  {
    title: 'What Melody is for',
    body:
      'Lead carries the tune until you say otherwise. Select the note where the melody moves to another part and press M. That part stays the melody until the next handoff. The sheet draws a dashed line across the change.',
  },
  {
    title: 'Quick keys',
    body: 'M hands the melody to the selected note. Press M on that same note to undo. Arrows move the selection.',
  },
]

/** Sketch lane gutter (empty-state info). */
export const SKETCH_LANE_HOWTO: readonly HarmonyHowToSection[] = [
  {
    title: 'Sketch map',
    body:
      'Paint chords on the timeline and edit them in the Chords panel. Enter on empty text leaves a blank (—) slot; Tab walks left-to-right to fill them. Realize writes TTBB under the melody.',
  },
]

/**
 * Media-bar “i” for Lyrics / Detected / Coach / Sketch / Mods — short overviews only.
 */
export const HARMONY_STRIP_HOWTO: readonly HarmonyHowToSection[] = [
  {
    title: 'Sketch',
    body: 'Your locked harmony map on the timeline. Realize turns it into TTBB stacks under the melody.',
  },
  {
    title: 'Detected',
    body: 'Automatic chord guesses in map holes. Lock promotes them into Sketch.',
  },
  {
    title: 'Coach',
    body: 'Guided arranging lessons and ranked alternatives. Drafts stay here until you Lock into Sketch.',
  },
  {
    title: 'Lyrics',
    body: 'Type syllables on the active part; Space and Dash advance note to note.',
  },
  {
    title: 'Mods',
    body: 'Tempo changes, fermatas, and ramps that shape playback feel.',
  },
]

export function formatHowToPlain(sections: readonly HarmonyHowToSection[]): string {
  return sections
    .map((s) => {
      const steps = s.steps?.map((x, i) => `${i + 1}. ${x}`).join('\n') ?? ''
      return `${s.title}\n${s.body}${steps ? `\n${steps}` : ''}`
    })
    .join('\n\n')
}
