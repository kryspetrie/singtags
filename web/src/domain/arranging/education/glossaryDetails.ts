/**
 * Longer Learn-panel copy + chord makeup lines (paraphrase of curriculum sources).
 * Kept separate from short glossary blurbs so skim UI stays compact.
 */
export type GlossaryImage = {
  /** Path under web/public (e.g. education/circle-of-fifths.png). */
  src: string
  alt: string
  caption?: string
}

export type GlossaryDetail = {
  detail: string
  /** What pitch-classes / roles make the chord (key-of-C examples when useful). */
  makeup?: string
  /** Optional diagrams / handout pages shown in Learn. */
  images?: readonly GlossaryImage[]
}

export const GLOSSARY_DETAILS: Readonly<Record<string, GlossaryDetail>> = {
  pillar: {
    detail:
      'A pillar is a structural harmony under a phrase — typically I, IV, V7, or another “home” chord you would label on a lead sheet — not every passing color under an eighth note.\n\n>> Paint the chord the phrase is “about,” then fill decoration. | 1980 Arranging Manual · Approach Two\n\nApproach Two builds the chart around pillars first, then fills connective tones. In Tag Studio, paint roots on the Harmony strip and lock them as Coach pillars so ranked chords stay honest to the phrase.',
  },
  pmn: {
    detail:
      'Strong (home) Lead tones sit on the pillar story. Prefer primary-family chords under them so the ear hears the structural progression, not a constant parade of secondaries. Approach Two called these primary melody notes (PMN).',
  },
  smn: {
    detail:
      'Passing Lead tones connect Strong notes. They may wear secondary-family color (SCF) without overturning the pillar. Approach Two called these secondary melody notes (SMN).',
  },
  pcf: {
    detail:
      'Primary chord family (PCF) = chords built on the current pillar root (I major, I7, I6, etc.). Under Strong notes, stay in the PCF unless a classic cadence or deliberate secondary is driving somewhere.',
  },
  scf: {
    detail:
      'Secondary chord family (SCF) = related roots that color the pillar (Groups 1–6 in Approach Two). Useful under Passing notes and for circle-of-fifths drives into the next pillar.',
  },
  bs7: {
    detail:
      'The barbershop seventh is a dominant-quality tetrad: root, major 3rd, perfect 5th, and minor (flat) 7th. Just-tuned, those intervals ring; equal-tempered MIDI is an approximation. It is the style’s workhorse for tension that wants to resolve.',
    makeup:
      'In C: C7 = C (1) · E (3) · G (5) · Bb (♭7). Keep all four tones when you can — the ♭7 is what makes it “barbershop,” not a plain triad.',
  },
  lock_ring: {
    detail:
      'Lock and ring is overtone reinforcement when stacked intervals are just. Contest charts chase a continuous buzz from complete, well-spaced chords — especially BS7s — rather than thin or mistuned stacks.\n\n> Ring score rewards complete, well-spaced stacks that can buzz — thin Dom9s and missing 3rds/♭7s score lower.',
  },
  circle_fifths: {
    detail:
      'The circle is both a key map (sharps clockwise, flats counterclockwise from C) and a root-motion map.\n\n>> Roots prefer counterclockwise fifths — each BS7 is the dominant of the next (…A7→D7→G7→C). | Barbershop style · Co5 gravity\n\nHow to use it while arranging:\n1. Fix tonic as home. Distance = how many descending fifths back to I.\n2. From I or IV you may leap (springboard); afterward walk home by fifths on BS7s.\n3. Prefer tension on a BS7 → release down a fifth → land on a pillar on a strong beat.\n4. Secondary dominants are just more stations on the same highway (V7/X → X).\n\nDiagram below; Hear the II7→V7→I and homecoming chains in the examples.',
    makeup: 'C highway: D7 → G7 → C (II7 → V7 → I). Leap example: E7→A7→D7→G7→C (dist 4→0).',
    images: [
      {
        src: 'education/circle-of-fifths.png',
        alt: 'Circle of fifths diagram',
        caption: 'Key signatures around the circle — use the same wheel for root motion (counterclockwise = down a fifth).',
      },
    ],
  },
  eleven_chords: {
    detail:
      'Contest barbershop (SAI / Rylander / Flinn) stays on eleven ringing natures. Three supply most of the flavor: major triad, barbershop seventh, and barbershop ninth.\n\n>> Of the eleven, major / BS7 / Dom9 predominate. | Flinn · 11 BBS chords\n\nMajor family (6): major · BS7 · Dom9 (omit root or 5th) · maj6 · maj7 · add9 (no 7).\nMinor family (3): minor · m6 · m7.\nSymmetrical (2): augmented · dim7.\n\nBuild from a root with the formulas in Makeup; Hear each stack in C below. Use Dom9 only with one tone omitted so TTBB can sing it.',
    makeup:
      'In C: C · C7 · C9(omit 1 or 5) · C6 · CM7 · Cadd9 · Cm · Cm6 · Cm7 · C+ · Co7. Predominant flavor: major, BS7, Dom9.',
    images: [
      {
        src: 'education/eleven-chords-p1.png',
        alt: 'Flinn handout: six major-tonality barbershop chords',
        caption: 'Major tonalities — Flinn / Travel in Tune Region 17 handout (p. 1).',
      },
      {
        src: 'education/eleven-chords-p2.png',
        alt: 'Flinn handout: minor and symmetrical barbershop chords',
        caption: 'Minor + symmetrical — Flinn handout (p. 2).',
      },
    ],
  },
  springboard: {
    detail:
      'I and IV may leap to almost any next root (springboard). After that leap, normal progression rules resume — you do not get unlimited free leaps from every chord.',
  },
  secondary_dom: {
    detail:
      'A secondary dominant is a BS7 rooted a fifth above its target (V7/X → X). It temporarily borrows dominant function to drive into a pillar or another structural chord. Classic example in C: D7 → G (V7/V → V) or G7 → C (V7 → I).',
    makeup: 'V7 of C: G7 = G · B · D · F. V7 of G: D7 = D · F# · A · C.',
  },
  counterpart: {
    detail:
      'Two BS7s a tritone apart share the same 3rd↔7th pitch classes (swapped). Approach Three Rule 3 lets them exchange under the right melody tones when you want a backdoor or surprise color without losing the active tones.',
    makeup: 'C7 (C E G Bb) ↔ F#7 (F# A# C# E) — shared E/Bb(=A#) and swapped 3↔7.',
  },
  strong_voicing: {
    detail:
      'Strong voicing asks which chord tone the Lead sings. On dominants, Lead on 3 or ♭7 usually sings stronger than root or 5th. Prefer doubling the root on major triads; avoid doubling the third.',
  },
  ttbb: {
    detail:
      'TTBB stack: Tenor above Lead, Bass lowest, Bari filling. Bari may sit above Lead when the melody is low, but Tenor should not sit under Lead in the classic stack.',
  },
  ji: {
    detail:
      'Just intonation uses exact frequency ratios (e.g. 5:4 major third) instead of equal temperament. Ear coaching and MIDI cents bends approximate JI so chords lock; printed MIDI files stay ET unless bent.',
  },
  homophony: {
    detail:
      'Homophony means the four parts change together under the Lead — block chords — the default texture before embellishment, tags, or swipes.',
  },
  tension_release: {
    detail:
      'Unstable tones in a BS7 want to resolve by step: the leading tone (3rd of V7) rises; the active ♭7 falls. V7→I is the fundamental tension→release story of the style.',
    makeup: 'G7 → C: B (3 of G7) → C; F (♭7 of G7) → E (3 of C).',
  },
  harmonic_series_spacing: {
    detail:
      'Nature’s chord spaces wider at the bottom and tighter on top (harmonic series). Prefer larger bass–bari gaps and closer tenor–lead for easier lock.',
  },
  common_tone: {
    detail:
      'A common tone is a pitch shared by two consecutive chords — often held in the same voice while neighbors move. It smooths voice leading and keeps the stack locked.',
  },
  contrary_motion: {
    detail:
      'Contrary motion: outer parts move opposite directions. It keeps successions full and avoids the thinness of parallel perfect intervals.',
  },
  parallel_5_8: {
    detail:
      'Parallel perfect fifths or octaves between two parts can thin the texture. Prefer contrary or oblique motion when the ear notices a hollow slide.',
  },
  omit_5: {
    detail:
      'A dominant ninth has five pitch-classes; TTBB can only sing four.\n\n> Dom9 omit choice: Prietto/BAM often omit the root (bass on 5th); Rylander often omits the 5th (bass on root). Always keep 3, ♭7, and 9.\n\nHear the omit-root teaching stack in the Dom9 examples.',
    makeup: 'G9 tones: G · B · D · F · A. Omit-root voicing keeps B D F A; omit-5 keeps G B F A.',
  },
  leading_tone: {
    detail:
      'The leading tone is scale degree 7 — as the 3rd of V7 it wants to rise a half step into the tonic. In C: B → C.',
    makeup: 'In G7: B is the 3rd (leading tone) → resolves up to C.',
  },
  active_seventh: {
    detail:
      'The active (flat) seventh of a dominant wants to fall by step — typically to the 3rd of the next chord. In C: F of G7 → E of C.',
    makeup: 'In G7: F is the ♭7 → resolves down to E (3rd of I).',
  },
  incomplete_chord: {
    detail:
      'An incomplete chord is missing a structural tone (root, 3rd, or — on dominants — the ♭7). Repair helpers and “Fill empties” aim to restore those tones so the chord can lock.',
  },
  roman_analysis: {
    detail:
      'Roman numerals label function by key degree (I ii iii IV V vi vii°) plus applied dominants (V7/V, ♭II7, …). Coach and the Harmony strip use root + quality; Romans are the teaching map behind those labels.',
  },
  classic_cadences: {
    detail:
      'Classic barbershop closes and highways (examples in C):\n\n> Prefer a BS7 → release down a fifth → land on a pillar — the cadence highway that makes tags and phrases feel inevitable.\n\n• Authentic V7→I — G7→C when Lead ^5 resolves to ^1.\n• Circle II7→V7→I — D7→G7→C.\n• Primary dominant I7→IV — C7→F (springboard into the subdominant).\n• Plagal IV→I — F→C (“amen”).\n• Tag penultimate — often a strong V7 before the final I.\n• Half cadence — resting on V without immediate tonic arrival.\nUse Learn examples below to see TTBB stacks and hear each move.',
    makeup: 'Default teaching key: C major (no sharps/flats in the signature).',
  },
  melody_pass: {
    detail:
      'The Roles melody part (Toolbar → Roles) is the tune Coach and Detected treat as Lead. Strong/Passing marks and sheet outlines follow that voice.',
  },
  voicing_spread: {
    detail:
      'Ensemble spacing is often taught as close, medium, or wide — gender-agnostic labels for how far the outer voices sit.\n\n> Close spreads keep bari often above Lead with bass within about an octave of the stack; wide spreads sit bari below Lead and use fewer tight clusters.\n\n>> Music choice depends on the people who make up the ensemble. | Lloyd · Intro to Arranging (ranges & ensembles)\n\nMatch chart density to the voices you have: SSAA / TTBB / SATB share the same close–medium–wide idea with different absolute ranges.',
  },
}
