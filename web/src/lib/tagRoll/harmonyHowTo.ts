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
    title: 'Melody comes from Roles',
    body:
      'The melody part is set once under Toolbar → Roles (press M on a selected note). Harmonize, Detected, Coach, and sheet lyrics all use that same part — there is no melody picker in this panel.',
    steps: [
      '← / → (or [ / ]) step through melody notes and hear each one.',
      'Change which part is melody anytime in Roles without reopening Harmonize.',
      'Chord romans use the next Sketch chord when present (e.g. V7/V (II7), ii7/V).',
    ],
  },
  {
    title: 'Two apply modes',
    body: 'Sketch / Stack sits beside the Harmonize title:',
    steps: [
      'Sketch — pick/hold to preview; Apply writes the Sketch map only (no TTBB).',
      'Stack — Apply also realizes a TTBB stack for this melody note.',
    ],
  },
  {
    title: 'Pick vs Suggest',
    body: 'Tabs under the action row switch how you choose chords:',
    steps: [
      'Pick — MuseScore-style catalog (free choice).',
      'Suggest — Coach-ranked voicings for this melody note. Uses a pillar when present; otherwise Sketch, Detected, or implied harmony. Select a row, then Apply (or double-click).',
    ],
  },
  {
    title: 'Recommended workflow',
    body: 'Declare first, then realize — the same loop many arrangers use in MuseScore:',
    steps: [
      'Enter or import Lead melody (optional — you can also paint chords on the Sketch lane with no notes).',
      'Pick a full chord in one click (C, G7, Am…) from Valid chords — expand More for extra qualities/roots.',
      'In Stack mode, choose a stack by inversion (root / 1st / 2nd / 3rd), or Lock detections into Sketch then Realize there.',
      'Later passes: fill intermediary / passing chords the same way; use Hear (J) or Sketch in the mixer to check by ear.',
    ],
  },
  {
    title: 'Philosophy',
    body:
      'Sketch answers “what is the harmony?” Stacks answer “how do the parts sing it?” Keep those separate so you can audition a lead-sheet map before committing voicings. Undo is global (Ctrl+Z).',
  },
  {
    title: 'Harmonize vs Coach vs lanes',
    body: 'Three surfaces, one truth:',
    steps: [
      'Sketch / Detected lanes — project harmony map (toggle from the media bar next to W/H). Sketch is the locked map; Alt+click / ◆ marks pillars.',
      'Harmonize — Pick catalog or Suggest (Coach ranks); Sketch vs Stack chooses write depth. Melody comes from Toolbar → Roles.',
      'Coach — guided Check / Polish teaching. Suggest reuses the same ranking engine.',
    ],
  },
]

/** Alias used by TagRollHarmonizePanel. */
export const HARMONIZE_HOWTO = HARMONIZE_PANEL_HOWTO

/** Toolbar Melody roles (global Strong / Passing / melody part). */
export const ROLES_HOWTO: readonly HarmonyHowToSection[] = [
  {
    title: 'What Roles is for',
    body:
      'Melody roles are a top-level Tag Studio feature: pick which part carries the tune, and mark Strong vs Passing melody notes. Those labels persist with the project and feed Harmonize, Detected ranking, Coach, and sheet cues.',
  },
  {
    title: 'How to assign',
    body: 'Open Roles from the toolbar (next to Harmonize / Coach):',
    steps: [
      'Select a note → M sets that part as Melody (shared everywhere).',
      'On melody notes, S toggles Strong and P toggles Passing (press again to clear).',
      'Arrows move the selection (and audition); Shift+arrows nudge notes on the grid.',
      'Show: cycles Off / Melody / Roles / Both — Roles uses Strong (yellow) / Passing (green) borders; Melody adds an outer Lead border around that.',
      'Esc closes Roles mode (S returns to Stop, M to Harmonize).',
    ],
  },
  {
    title: 'How other tools use it',
    body: 'One definition, many consumers:',
    steps: [
      'Harmonize steps the Roles melody part — no separate picker.',
      'Detected hole-fills prefer home triads under Strong notes and color/sevenths under Passing.',
      'Sheet view outlines the melody voice; Strong/Passing use the same yellow/green border colors (no St/Pa text).',
    ],
  },
]

/** Sketch / Detected bottom lanes (toggled from the media bar). */
export const HARMONY_STRIP_HOWTO: readonly HarmonyHowToSection[] = [
  {
    title: 'Sketch vs Detected',
    body:
      'Sketch is your locked harmony map (authoritative) — independent of Coach. Detected fills holes with melody-based diatonic guesses (I/IV/V homes; light V7 color when the lead sits on 3 or 7) — Lock promotes into Sketch. Strong/Passing from Roles bias those guesses. In Number mode, dual labels appear when useful (e.g. V7/V (II7), ii7/V). Coach drafts stay in Coach until Lock.',
  },
  {
    title: 'Pillars on Sketch / Detected',
    body:
      'Pillars are structural home roots — phrase destinations Coach and Detected lean on. They live on the harmony lanes, not as a Coach page.',
    steps: [
      'On Sketch: Alt+click a chord or its ◆ badge to mark / clear a pillar (dock Pillar does the same).',
      'On Detected: ◆ / Alt+click locks that hole into Sketch as a pillar — no need to open Sketch first.',
      'Detected → Lock promotes all holes (as pillars). Keep color / passing chords locked but un-pillared when you only want them on the map.',
    ],
  },
  {
    title: 'Editing Sketch',
    body:
      'Open Sketch from the media bar (next to W/H). Drag on empty time to paint a span, then type the chord (or click a suggestion). After you commit, the new chord is selected and the Sketch dock opens for further editing. Drag across existing chords to select them (or click one). Delete / Backspace removes the selection; click a chord to open the dock editor. Drag edges to resize; drag a selected body to move. Ctrl/Cmd+C/X/V copy/paste at the playhead. No piano-roll notes required.',
    steps: [
      'Toggle Sketch (and optionally Detected) independently — multiple bottom lanes can stay open at once.',
      'Use the C / # gutter toggle on each lane for Chord / Number labels.',
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
      'Harmonize works mid-sketch: Pick/Suggest use Sketch, Detected, or implied harmony under the note. Pillars (◆) are optional structural home roots that improve Coach teaching and long-range ranking — not a ticket to open Suggest. Prefer one place to own phrase harmony — Sketch is the map; Harmonize is the fast pen; Coach is the lesson. Set melody/roles once under Toolbar → Roles.',
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
