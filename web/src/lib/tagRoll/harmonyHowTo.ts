/**
 * How-to copy for Tag Studio harmony tools (Harmonize panel + chord lanes).
 * Kept as data so UI stays thin and tips stay consistent.
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
      'Harmonize is a hand tool at the current melody note — like MuseScore’s Barbershop Harmonizer. Walk note by note, pick a root and chord quality, and optionally place a TTBB stack.',
  },
  {
    title: 'Two apply modes',
    body: 'Use the toggle at the top of the panel:',
    steps: [
      'Chord — pick/hold to preview a Sketch chord (same as Apply / Lock once you confirm). No Tenor/Bari/Bass notes until Apply.',
      'Chord + stack — preview then Apply declares that sketch and realizes a TTBB stack for this note (same idea as Realize on the Sketch lane).',
    ],
  },
  {
    title: 'Recommended workflow',
    body: 'Declare first, then realize — the same loop many arrangers use in MuseScore:',
    steps: [
      'Enter or import Lead melody (optional — you can also paint chords on the Sketch lane with no notes).',
      'Pick a full chord in one click (C, G7, Am…) from Valid chords — expand More for extra qualities/roots.',
      'In Chord + stack, choose a stack by inversion (root / 1st / 2nd / 3rd), or Lock detections into Sketch then Realize there.',
      'Later passes: fill intermediary / passing chords the same way; use Hear (J) or Sketch in the mixer to check by ear.',
    ],
  },
  {
    title: 'Philosophy',
    body:
      'Sketch answers “what is the harmony?” Stacks answer “how do the parts sing it?” Keep those separate so you can audition a lead-sheet map before committing voicings.',
  },
  {
    title: 'Harmonize vs Coach vs lanes',
    body: 'Three surfaces, one truth:',
    steps: [
      'Sketch / Detected lanes — project harmony map (toggle from the media bar next to W/H). Exists with or without Coach. Sketch is the locked map.',
      'Harmonize — fast local tool for experienced users who know what they want at this note.',
      'Coach — guided teaching (propose, coverage, ranked Apply, QA). Lock commits into Sketch; Coach lane is coverage/overview, not chord entry.',
    ],
  },
]

/** Alias used by TagRollHarmonizePanel. */
export const HARMONIZE_HOWTO = HARMONIZE_PANEL_HOWTO

/** Sketch / Detected bottom lanes (toggled from the media bar). */
export const HARMONY_STRIP_HOWTO: readonly HarmonyHowToSection[] = [
  {
    title: 'Sketch vs Detected',
    body:
      'Sketch is your locked harmony map (authoritative) — independent of Coach. Detected fills holes with melody-based diatonic guesses (I/IV/V homes; light V7 color when the lead sits on 3 or 7) — Lock promotes into Sketch. Coach drafts stay in Coach until Lock.',
  },
  {
    title: 'Editing Sketch',
    body:
      'Open Sketch from the media bar (next to W/H). Drag on empty time to paint a span, then type the chord. Drag across existing chords to select them (or click one). Delete / Backspace removes the selection; click a chord to open the dock editor. Drag edges to resize; drag a selected body to move. Ctrl/Cmd+click multi-select; Ctrl/Cmd+C/X/V copy/paste at the playhead. No piano-roll notes required.',
    steps: [
      'Toggle Sketch (and optionally Detected) independently — multiple bottom lanes can stay open at once.',
      'Use View on each lane to switch Chord / Number labels independently.',
      'Detected → Lock declares detections into Sketch. Sketch → Realize writes TTBB stacks under Lead notes (selection only when spans are selected; otherwise all locked). Apply in the chord picker also declares.',
    ],
  },
  {
    title: 'Hearing the map',
    body:
      'Open a Sketch or Detected cell → hold a chord to hear, then ✓ to Apply/declare (↺ resets to the original; ✕ cancels). The Sketch lane shows a dashed preview before Apply; Play hears that preview. Press J for the sketch chord at the playhead. Mixer Sketch plays locked Sketch under Lead; mixer Detected (muted by default — solo it) plays hole-fill guesses.',
  },
  {
    title: 'With Harmonize / Coach',
    body:
      'Harmonize Chord only writes into Sketch. Coach Propose drafts appear on the Coach lane; Lock commits them into Sketch. Prefer one place to own phrase harmony — Sketch is the map; Harmonize is the fast pen; Coach is the lesson.',
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
