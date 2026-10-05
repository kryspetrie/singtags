/**
 * Coach Ideas (mini theory lessons) + Help (how-to) for the current workflow.
 * Use ASCII music punctuation so Latin-subset fonts render on Linux.
 */
import type { GuidedStepId } from './GuidedSteps'

export type CoachIdeaCard = {
  title: string
  /** Mini-lesson body (theory first; not UI chrome). */
  body: string
  /** Glossary ids for the Learn teaching popup. */
  glossaryIds?: readonly string[]
}

export type CoachHelpSection = {
  title: string
  body: string
}

export type CoachIdeasHelp = {
  ideasIntro: string
  ideas: readonly CoachIdeaCard[]
  helpIntro: string
  help: readonly CoachHelpSection[]
}

const BY_STEP: Record<GuidedStepId, CoachIdeasHelp> = {
  home: {
    ideasIntro:
      'Before you walk chords, know what the phrase map is asking for - structural homes, then motion between them.',
    ideas: [
      {
        title: 'Pillars are the phrase skeleton',
        body:
          'A pillar is a structural harmony under a phrase - usually I, IV, or V7 - not every connective color. In barbershop arranging (Approach Two), you lock those homes first so later chords answer a clear question: "which home are we serving right now?" Sketch owns that map; Coach ranks under it.',
        glossaryIds: ['pillar', 'homophony'],
      },
      {
        title: 'Moments and posts',
        body:
          'Each Lead onset is a harmonic moment - a place to choose one voicing. A post is when Lead holds while the other parts may change underneath. Posts are legal and common; they keep the tune singing while harmony walks a short path.',
        glossaryIds: ['common_tone', 'homophony'],
      },
      {
        title: 'Classic cadence highways',
        body:
          'Barbershop loves descending-fifth closes. The textbook stories are V7->I (authentic), II7->V7->I (two-five into tonic), and I7->IV (tonic treated as V of IV). When Lead supports those shapes, prefer them - they ring and resolve.',
        glossaryIds: ['classic_cadences', 'circle_fifths', 'tension_release'],
      },
      {
        title: 'The eleven chords of barbershop',
        body:
          'Contest charts stay inside eleven ringing natures. Major, BS7, and Dom9 carry most of the flavor; maj6/M7/add9, the three minors, aug, and dim7 fill color and connections. Learn shows the Flinn handout pages plus TTBB stacks you can Hear in C.',
        glossaryIds: ['eleven_chords', 'bs7', 'omit_5', 'lock_ring'],
      },
      {
        title: 'Circle of fifths - how to use it',
        body:
          'Read the circle as a key map and a root-motion map. From I or IV you may leap (springboard); afterward walk home counterclockwise on BS7s so distance-from-home shrinks by one each step. Diagram + Hearable chains live in Learn.',
        glossaryIds: ['circle_fifths', 'springboard', 'secondary_dom', 'bs7'],
      },
    ],
    helpIntro: 'Get oriented, then jump to Chords.',
    help: [
      {
        title: 'Before Coach',
        body: 'Enter Lead on the roll. Optionally label Strong/Passing on the toolbar, and lock Sketch chords for the phrase homes.',
      },
      {
        title: 'Open Coach',
        body: 'Use the Coach control or click the Coach lane. The roll bar (Prev / Next | Apply best | Hear | Next empty) drives the walk while the dock shows ranked choices.',
      },
      {
        title: 'Coverage lane',
        body: 'The Coach lane toggles Ring, Voice-leading (VL), and Issues. Press [i] for what the bars mean. Full issue text lives under Potential issues in Chords/Check.',
      },
    ],
  },
  chords: {
    ideasIntro:
      'At each moment, the Lead and the current home decide which chord family is honest - then you choose a voicing that rings and leads.',
    ideas: [
      {
        title: 'Primary family vs passing color',
        body:
          'Under a locked home, Strong Lead tones usually want the primary chord family (PCF): chords built on that pillar root. Passing Lead tones may borrow secondary-family color (SCF) that still points back at the home. Color is spice; it should not silently rewrite a locked Sketch root.',
        glossaryIds: ['pcf', 'scf', 'pmn', 'smn'],
      },
      {
        title: 'Why V7 and BS7 feel like home',
        body:
          'A barbershop seventh (BS7) is a dominant-quality seventh with a flat 7th tuned to ring. The 3rd (leading tone) wants to rise; the flat 7th wants to fall. That tension-release is why V7->I feels inevitable when Lead is set up for it.',
        glossaryIds: ['bs7', 'leading_tone', 'active_seventh', 'tension_release'],
      },
      {
        title: 'Cadence highways at work',
        body:
          'When the melody outlines a close, Coach biases textbook moves: V7->I, leading-tone V7, II7->V7->I, I7->IV. Read the Cadence teach block when it appears - it names the story so you can keep or reject it by ear.',
        glossaryIds: ['classic_cadences', 'circle_fifths'],
      },
      {
        title: 'Secondary dominants and counterparts',
        body:
          'A secondary dominant is a BS7 a fifth above its target - it strengthens the approach into the next home. Tritone counterparts share 3 and 7 and can swap under the right Lead tones. Treat both as insights into the same ranked list, not a separate mode.',
        glossaryIds: ['secondary_dom', 'counterpart', 'bs7'],
      },
      {
        title: 'Stay inside the eleven',
        body:
          'When ranking feels exotic, check whether the nature is in the contest eleven. Dom9 needs an omit (root or 5th); maj7 is sparingly for melody on ti; dim7 and aug are connectors, not long pillars. Learn lists every nature with Hear.',
        glossaryIds: ['eleven_chords', 'omit_5', 'bs7'],
      },
    ],
    helpIntro: 'How to choose chords with the roll bar and dock together.',
    help: [
      {
        title: 'Select a moment',
        body: '← / → on the roll bar, click a Lead note, click the Coach lane, or use the moments transport. Selection is Coach focus — it does not steal the L/R playback cursor.',
      },
      {
        title: 'Hear and apply',
        body: 'Hold a chord (or theory alternate) to hear; ✓ applies/replaces. Apply best on the roll bar commits the top-ranked row for the current moment.',
      },
      {
        title: 'Play while deciding',
        body: 'The selected chord stays as a preview so Space can audition the phrase. Move the playhead freely; Coach selection does not clamp playback to a slice.',
      },
      {
        title: 'Next empty',
        body: 'Jumps to the next moment without a known chord. Use it after Apply best to keep walking gaps.',
      },
      {
        title: 'Color-coded families',
        body: 'Home family, passing colors, and sevenths use green / amber / blue tints on the grid. Chips above the list filter without changing ranking.',
      },
      {
        title: 'Potential issues',
        body: 'When QA flags this moment, a Potential issues group lists them under the chord grid — jump or Fix from there, or open Check for the full board.',
      },
    ],
  },
  check: {
    ideasIntro:
      'Check is craft QA: clear what the style expects, then leave taste calls for your ear.',
    ideas: [
      {
        title: 'Cadence misses',
        body:
          'If Lead walks ^5 to ^1 (or a similar close) under a plain tonic, you often skipped the dominant highway. Prefer V7 (or II7->V7) into I so the active tones resolve - then the tonic lands as a release, not a soft thud.',
        glossaryIds: ['classic_cadences', 'tension_release', 'leading_tone'],
      },
      {
        title: 'Lock, ring, and spacing',
        body:
          'Barbershop chases lock and ring: just intervals that reinforce overtones. Issues often point at doubles, awkward spacing (too tight low, too wide high), or motion that dulls the buzz. Series spacing - wider gaps at the bottom - helps parts lock.',
        glossaryIds: ['lock_ring', 'harmonic_series_spacing', 'ttbb'],
      },
      {
        title: 'Homophony first',
        body:
          'Default texture is homophonic: parts change together under the Lead. Embellishment (swipes, tags, posts) comes after the block path is solid. Many "style" warnings are really "parts are not telling one story yet."',
        glossaryIds: ['homophony', 'pillar'],
      },
    ],
    helpIntro: 'Clear potential issues, then return to Chords or Polish.',
    help: [
      {
        title: 'Potential issues board',
        body: 'Check groups craft flags under Potential issues (Blockers / Improve / Info). Pick Check on the step rail anytime.',
      },
      {
        title: 'Jump an issue',
        body: 'Click a row to focus that moment and open a teaching note on Chords. Fix when the note makes sense.',
      },
      {
        title: 'Next problem',
        body: 'On the roll bar in Check, Next problem advances through QA hits, unrecognized chords, and empties.',
      },
    ],
  },
  auto: {
    ideasIntro:
      'Auto is path thinking across the whole chart: one inversion story and safer approaches, not a greedy pick per chord.',
    ideas: [
      {
        title: 'Bass on 1 or 5 at openings',
        body:
          'Strong phrase openings often want bass on the root or fifth (I or V feeling). That sets a clear floor so the upper parts can ring. Local "prettier" inversions sometimes fight that global path.',
        glossaryIds: ['strong_voicing', 'ttbb'],
      },
      {
        title: 'Voice leading as a highway',
        body:
          'Prefer stepwise inner motion, contrary outer motion when you can, and keep common tones when they help. Parallel 5ths/8ves can thin the texture - not always illegal in style, but worth hearing.',
        glossaryIds: ['contrary_motion', 'common_tone', 'parallel_5_8'],
      },
      {
        title: 'Strengthen approaches',
        body:
          'Strengthening looks for weak approaches into the next home and may insert or prefer secondary-dominant BS7 drive when safe. Still audition - software suggests highways; your ear keeps the lyric story.',
        glossaryIds: ['secondary_dom', 'bs7', 'circle_fifths'],
      },
      {
        title: 'Swipe seeds',
        body:
          'A swipe is a short embellishment stacked near the end of a long hold. Try swipe seed only when a held melody note already has a TTBB stack.',
        glossaryIds: ['strong_voicing'],
      },
    ],
    helpIntro: 'Whole-chart tools — then audition before you call it done.',
    help: [
      {
        title: 'Strengthen / Polish inversions',
        body: 'These rewrite many stacks at once. Polish keeps your current register and only moves when voice leading improves — if a pass leaves stacks unchanged, the path was already smooth.',
      },
      {
        title: 'Try swipe seed',
        body: 'Needs a long held Lead note with a stack. If the button is disabled, there is no eligible hold yet.',
      },
    ],
  },
  polish: {
    ideasIntro:
      'Polish is the final craft skim: checklist and style factors after Auto passes.',
    ideas: [
      {
        title: 'Checklist is a reminder, not a gate',
        body:
          'Contest-minded items help you notice residuals. They do not block export — your ear still owns the tag.',
        glossaryIds: ['classic_cadences', 'lock_ring'],
      },
      {
        title: 'Close / medium / wide spacing',
        body:
          'Think gender-agnostic spreads: close keeps bari often above Lead with bass near the stack; wide sits bari below Lead and uses fewer tight clusters. Match density to the ensemble you have.',
        glossaryIds: ['voicing_spread', 'ttbb', 'harmonic_series_spacing'],
      },
    ],
    helpIntro: 'Finish the walk — export from the main toolbar.',
    help: [
      {
        title: 'Checklist',
        body: 'Expand items when you want a final craft skim. Residuals often mean return to Chords or Auto.',
      },
      {
        title: 'Back to Auto / Chords',
        body: 'Whole-chart tools are on Auto. Local voicing fixes stay on Chords.',
      },
    ],
  },
}

export function coachIdeasHelpForStep(id: GuidedStepId): CoachIdeasHelp {
  return BY_STEP[id]
}
