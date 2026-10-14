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

/** Alias used by TagRollHarmonizePanel. */
export const HARMONIZE_HOWTO = HARMONIZE_PANEL_HOWTO

/** Toolbar Melody roles (global Strong / Passing / melody part). */
export const ROLES_HOWTO: readonly HarmonyHowToSection[] = [
  {
    title: 'What Roles is for',
    body:
      'Choose which part carries the tune and mark Strong vs Passing melody notes. Those labels feed Harmonize, Detected, Coach, and Auto Path Optimize. Unlabeled notes get a duration / beat / phrase-edge default before Auto runs.',
  },
  {
    title: 'Strong',
    body:
      'A melody tone that carries a structural harmony (home). Longer, metrically strong, phrase start/end, or lyric stress. If you would write a chord-symbol change above that note → Strong. Gets its own chord decision.',
  },
  {
    title: 'Passing',
    body:
      'A melody tone that connects Strong tones. Shorter / weaker beat / stepwise filler. Does not invent a new home — the chord approaches or holds the neighboring Strong harmony.',
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
      'Paint chords on the timeline and edit spans in the dock. Enter on empty text leaves a blank (—) slot; Tab walks left-to-right to fill them. Strong vs passing melody roles guide Coach homes — Realize writes TTBB under the melody.',
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
