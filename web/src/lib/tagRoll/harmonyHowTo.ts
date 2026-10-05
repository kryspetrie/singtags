/**
 * How-to copy for Tag Studio harmony tools (Harmonize panel + chord lanes).
 * Kept as data so UI stays thin and tips stay consistent.
 * Lane “i” tips stay short (overview only) — hover popovers are not manuals.
 */

export type HarmonyHowToSection = {
  title: string
  body: string
  steps?: readonly string[]
}

/** MuseScore-like Harmonize panel: declare vs realize, vs Coach. */
export const HARMONIZE_PANEL_HOWTO: readonly HarmonyHowToSection[] = [
  {
    title: 'What this panel is for',
    body:
      'Harmonize is a hand tool at the current melody note — pick a root and chord quality, preview, and optionally place a TTBB stack.',
  },
  {
    title: 'Melody comes from Roles',
    body:
      'The melody part is set under Toolbar → Roles (M on a selected note). Harmonize, Detected, Coach, and sheet lyrics all use that same part.',
  },
  {
    title: 'Sketch vs Stack',
    body:
      'Sketch writes the harmony map only. Stack also realizes a TTBB voicing for this melody note.',
  },
  {
    title: 'Pick vs Suggest',
    body:
      'Pick is a free chord catalog. Suggest ranks the same chips with Coach for the moment under the playhead.',
  },
  {
    title: 'Workflow',
    body:
      'Declare the map first (Sketch), audition by ear, then Realize or Stack when you want sung parts. Undo is global (Ctrl+Z).',
  },
]

/** Alias used by TagRollHarmonizePanel. */
export const HARMONIZE_HOWTO = HARMONIZE_PANEL_HOWTO

/** Toolbar Melody roles (global Strong / Passing / melody part). */
export const ROLES_HOWTO: readonly HarmonyHowToSection[] = [
  {
    title: 'What Roles is for',
    body:
      'Choose which part carries the tune and mark Strong vs Passing melody notes. Those labels feed Harmonize, Detected, Coach, and sheet cues.',
  },
  {
    title: 'Quick keys',
    body:
      'M sets Melody part · S Strong · P Passing · C clear role · arrows move selection · Show cycles Off / Melody / Roles / Both.',
  },
]

/** Sketch lane gutter (empty-state info). */
export const SKETCH_LANE_HOWTO: readonly HarmonyHowToSection[] = [
  {
    title: 'Sketch map',
    body:
      'Paint chords on the timeline, edit spans in the dock, mark pillars with Alt+click or ◆. Realize writes TTBB under the melody.',
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
