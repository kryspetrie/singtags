/**
 * Name a library nature from sounding TTBB MIDI.
 * Inference from pitch classes stays in chordCompletion.ts.
 */
import {
  BARBERSHOP_CHORDS,
  leadRoleInChord,
  placeVoicing,
  VOICINGS_BY_CHORD,
  voicingFitsLead,
  type ChordToneRole,
  type VoicingPitches,
} from './chords'
import { isNatureAllowed, ringTier, type ContestProfile } from './contestProfile'
import { degreeOf } from './secondaryDominant'
import { isDominantNature } from './tensionRelease'
import type { TonalityMode } from './types'
import {
  inferNaturesFromPcs,
  majorKeyIncompleteAllows,
  pcsFitNature,
  structuralScore,
} from './chordCompletion'

function pc(m: number): number {
  return ((m % 12) + 12) % 12
}

function uniquePcs(midis: readonly number[]): number[] {
  return [...new Set(midis.map(pc))]
}

function minorThirdLower(pcs: readonly number[]): number | null {
  for (const lower of pcs) {
    for (const upper of pcs) {
      if (((upper - lower) % 12 + 12) % 12 === 3) return lower
    }
  }
  return null
}

const DIATONIC_ROOT_DEGREES = [0, 2, 4, 5, 7, 9, 11]

/** Major seventh or tritone with no fuller chord: still name something singable. */
function dissonantDyadChord(
  midi: Partial<VoicingPitches> & { lead: number },
  presentPcs: readonly number[],
  tonality: number,
  profile: ContestProfile,
): { natureId: string; rootPc: number; reason: string } | null {
  if (presentPcs.length !== 2) return null
  const sounding = [midi.tenor, midi.lead, midi.bari, midi.bass].filter((m): m is number => m != null)
  if (sounding.length !== 2) return null
  sounding.sort((a, b) => a - b)
  const interval = (sounding[1]! - sounding[0]!) % 12
  if (interval === 11) {
    const rootPc = pc(sounding[0]!)
    if (!DIATONIC_ROOT_DEGREES.includes(degreeOf(rootPc, tonality))) return null
    if (!isNatureAllowed(profile, 'maj7')) return null
    return {
      natureId: 'maj7',
      rootPc,
      reason: 'Major seventh dyad → major seventh on the lower note',
    }
  }
  if (interval === 6) {
    if (!isNatureAllowed(profile, 'dim7')) return null
    return {
      natureId: 'dim7',
      rootPc: pc(midi.lead),
      reason: 'Tritone dyad → diminished seventh from the lead',
    }
  }
  return null
}

function roleOfPc(
  rootPc: number,
  natureId: string,
  midi: number,
): ChordToneRole | null {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!chord) return null
  const p = pc(midi)
  for (const [role, off] of Object.entries(chord.offsets)) {
    if (off != null && pc(rootPc + off) === p) return Number(role) as ChordToneRole
  }
  return null
}

/** Best-effort voicing string bass→tenor from sounding MIDI. */
export function voicingStringFromMidi(
  midi: Partial<VoicingPitches> & { lead: number },
  rootPc: number,
  natureId: string,
): string {
  if (midi.bass == null || midi.bari == null || midi.tenor == null) return ''
  const roles = [midi.bass, midi.bari, midi.lead, midi.tenor].map((m) =>
    roleOfPc(rootPc, natureId, m),
  )
  if (roles.some((r) => r == null)) return ''
  return roles.join('')
}

/**
 * Identify a library nature (+ root / voicing) from sounding TTBB MIDI.
 * Prefers an exact (or octave-tolerant) match against the voicing catalogue so
 * omit-root / incomplete spellings still resolve to the intended library chord.
 */
export function identifyNatureFromMidi(opts: {
  midi: Partial<VoicingPitches> & { lead: number }
  profile: ContestProfile
  tonality: number
  /** Major-key arrangements reject out-of-vocabulary minors on incomplete stacks. */
  mode?: TonalityMode
}): { natureId: string; rootPc: number; voicing: string; confidence: number } | null {
  const lead = opts.midi.lead
  const presentMidi = [opts.midi.tenor, opts.midi.lead, opts.midi.bari, opts.midi.bass].filter(
    (m): m is number => m != null,
  )
  const presentPcs = uniquePcs(presentMidi)
  const bassPc = opts.midi.bass != null ? pc(opts.midi.bass) : null
  let best: {
    natureId: string
    rootPc: number
    voicing: string
    score: number
    tie: number
  } | null = null

  for (const nature of BARBERSHOP_CHORDS) {
    if (!isNatureAllowed(opts.profile, nature.id)) continue
    const voicings = VOICINGS_BY_CHORD[nature.id] ?? []
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const lr = leadRoleInChord(nature, rootPc, lead)
      if (lr == null) continue
      for (const voicing of voicings) {
        if (!voicingFitsLead(voicing, lr)) continue
        for (const spread of [false, true]) {
          const placed = placeVoicing({
            chord: nature,
            rootPc,
            leadMidi: lead,
            voicing,
            spread,
          })
          if (!placed) continue
          const score = voicingMatchScore(placed, opts.midi)
          if (score <= 0) continue
          const tie = catalogueTieBreak(nature.id, rootPc, presentPcs, bassPc)
          if (
            !best ||
            score > best.score ||
            (score === best.score && tie > best.tie)
          ) {
            best = { natureId: nature.id, rootPc, voicing, score, tie }
          }
        }
      }
    }
  }

  const partsPresent = (['bass', 'bari', 'lead', 'tenor'] as const).filter(
    (k) => opts.midi[k] != null,
  ).length

  // Full TTBB catalogue hits only — partial stacks are too ambiguous across natures.
  if (best && best.score >= 3.5 && partsPresent >= 4) {
    // Classic dual: omit-root Dom9 ≡ complete bass-rooted m6 (F+Ab+C+D = Fm6 / Bb9).
    if (
      bassPc != null &&
      best.rootPc !== bassPc &&
      (best.natureId === 'ninth' || best.natureId === 'seventh') &&
      !presentPcs.includes(best.rootPc)
    ) {
      const dual = inferNaturesFromPcs({
        presentMidi,
        profile: opts.profile,
        tonality: opts.tonality,
        pillarRoot: bassPc,
      }).find(
        (x) =>
          (x.natureId === 'madd6' || x.natureId === 'sixth') &&
          x.rootPc === bassPc &&
          x.missingRoles.length === 0,
      )
      if (dual) {
        return {
          natureId: dual.natureId,
          rootPc: dual.rootPc,
          voicing: voicingStringFromMidi(opts.midi, dual.rootPc, dual.natureId),
          confidence: Math.max(dual.confidence, 0.75),
        }
      }
    }
    return {
      natureId: best.natureId,
      rootPc: best.rootPc,
      voicing: best.voicing,
      confidence: Math.min(1, best.score / 4),
    }
  }

  // Fallback: PC-subset inference (incomplete / non-catalogue voicings).
  const inferred = inferNaturesFromPcs({
    presentMidi,
    profile: opts.profile,
    tonality: opts.tonality,
    pillarRoot: bassPc ?? undefined,
  })
  if (!inferred.length) {
    const dyad = dissonantDyadChord(opts.midi, presentPcs, opts.tonality, opts.profile)
    if (dyad) {
      return {
        natureId: dyad.natureId,
        rootPc: dyad.rootPc,
        voicing: voicingStringFromMidi(opts.midi, dyad.rootPc, dyad.natureId),
        confidence: 0.55,
      }
    }
    return null
  }
  const majorSparse = opts.mode === 'major' && partsPresent < 4
  const ranked = [...inferred].sort((a, b) => {
    if (majorSparse) {
      const aVocab = majorKeyIncompleteAllows(a.natureId, a.rootPc, presentPcs, opts.tonality)
        ? 1
        : 0
      const bVocab = majorKeyIncompleteAllows(b.natureId, b.rootPc, presentPcs, opts.tonality)
        ? 1
        : 0
      if (bVocab !== aVocab) return bVocab - aVocab
      // Two sung notes: the bass note is the root far more often than it is a
      // color tone of some other chord (stops Bb6 / Ebadd9 beating G7).
      if (bassPc != null) {
        const aBass = a.rootPc === bassPc ? 1 : 0
        const bBass = b.rootPc === bassPc ? 1 : 0
        if (bBass !== aBass) return bBass - aBass
      }
    }
    // Completeness first — never let a Dom9 missing root+3rd beat a complete triad
    // just because the 7th/9th pitch-classes happen to be present (Bonnie IV7(9)).
    const aComplete = a.missingRoles.length === 0 ? 1 : 0
    const bComplete = b.missingRoles.length === 0 ? 1 : 0
    if (bComplete !== aComplete) return bComplete - aComplete
    const aStruct = structuralScore(a.natureId, a.missingRoles)
    const bStruct = structuralScore(b.natureId, b.missingRoles)
    if (bStruct !== aStruct) return bStruct - aStruct
    // Prefer natures that explain extensions actually present (7/6/9) — stops
    // “Dm add6” winning over G7 when the sounding set is {B,D,F}.
    const aExt = extensionPresenceBonus(a.natureId, a.rootPc, presentPcs)
    const bExt = extensionPresenceBonus(b.natureId, b.rootPc, presentPcs)
    if (bExt !== aExt) return bExt - aExt
    const aRing = ringTier(a.natureId)
    const bRing = ringTier(b.natureId)
    if (aRing !== bRing) return aRing - bRing
    // Omit-root dominants are common; don't lose to bass=root of a weaker nature.
    const aOmitRoot =
      isDominantNature(a.natureId) && a.missingRoles.length === 1 && a.missingRoles[0] === 1
        ? 1
        : 0
    const bOmitRoot =
      isDominantNature(b.natureId) && b.missingRoles.length === 1 && b.missingRoles[0] === 1
        ? 1
        : 0
    if (bOmitRoot !== aOmitRoot) return bOmitRoot - aOmitRoot
    if (!majorSparse && bassPc != null) {
      const aBass = a.rootPc === bassPc ? 1 : 0
      const bBass = b.rootPc === bassPc ? 1 : 0
      if (bBass !== aBass) return bBass - aBass
    }
    return b.confidence - a.confidence
  })
  let top = ranked[0]!

  // Incomplete TTBB under Lead ^5: prefer functional V7 (Bonnie openings) unless
  // the stack already IDs as V / V7. Full 4-part stacks keep catalogue spelling.
  const leadDeg = degreeOf(lead, opts.tonality)
  const dominantPc = ((opts.tonality + 7) % 12 + 12) % 12
  const tonicPc = ((opts.tonality % 12) + 12) % 12
  const tonicTriad = [0, 4, 7].map((off) => pc(tonicPc + off))
  // Tenor or bass on the tonic, with every sung note inside the tonic triad
  // (Lead G + Tenor C), is I. Do not rename it V7 just because there is no bass.
  const tonicExplains =
    presentPcs.includes(tonicPc) && presentPcs.every((p) => tonicTriad.includes(p))
  if (partsPresent < 4 && tonicExplains) {
    top = {
      natureId: 'major',
      rootPc: tonicPc,
      confidence: Math.max(top.confidence, 0.55),
      missingRoles: [],
      reason: 'Sung tonic root with every note inside I → I triad',
    }
  }
  if (partsPresent < 4 && leadDeg === 7 && !tonicExplains) {
    const isAlreadyV =
      degreeOf(top.rootPc, opts.tonality) === 7 &&
      (isDominantNature(top.natureId) || top.natureId === 'major')
    // Bass on the root of a chord that already explains the notes (tonic fifth
    // in the lead) is that chord, not an automatic V7.
    const bassIsRoot = bassPc != null && bassPc === pc(top.rootPc)
    const v7Tones = [0, 4, 7, 10].map((off) => pc(dominantPc + off))
    const sungFitsV7 = presentPcs.every((p) => v7Tones.includes(p))
    // Bonnie: a complete parallel-minor / chromatic sixth under ^5 is still V7.
    // A diatonic chord that actually contains the tenor (iii, a bare fifth of I)
    // stays that chord, so Fill is not asked to write a V7 the tenor cannot sing.
    const outsideMajorVocab =
      top.missingRoles.length === 0 &&
      !majorKeyIncompleteAllows(top.natureId, top.rootPc, presentPcs, opts.tonality)
    if (!isAlreadyV && !bassIsRoot && (sungFitsV7 || outsideMajorVocab)) {
      top = {
        natureId: 'seventh',
        rootPc: dominantPc,
        confidence: Math.max(top.confidence, 0.55),
        missingRoles: [],
        reason: 'Lead ^5 incomplete stack → functional V7',
      }
    }
  }
  // Incomplete tonic Mm7 with Lead on ^3: prefer I triad (Bonnie authentic land).
  // A ♭7 in TBB alone should not force I7 as the Detected home after V7→I.
  if (
    partsPresent < 4 &&
    leadDeg === 4 &&
    pc(top.rootPc) === tonicPc &&
    isDominantNature(top.natureId)
  ) {
    top = {
      natureId: 'major',
      rootPc: tonicPc,
      confidence: Math.max(top.confidence, 0.55),
      missingRoles: [],
      reason: 'Lead ^3 incomplete tonic Mm7 → I triad (authentic land)',
    }
  }

  // No bass, and the sung notes are a minor third: those are the 5th and 7th of
  // the dominant a fifth below far more often than the root and 3rd of ii/iii/vi.
  // A sung bass on the minor root keeps the minor chord.
  if (opts.mode === 'major' && partsPresent < 4 && bassPc == null) {
    const lower = minorThirdLower(presentPcs)
    if (lower != null) {
      const domRoot = pc(lower + 5)
      const domTones = [0, 4, 7, 10].map((off) => pc(domRoot + off))
      if (
        presentPcs.every((p) => domTones.includes(p)) &&
        isNatureAllowed(opts.profile, 'seventh') &&
        majorKeyIncompleteAllows('seventh', domRoot, presentPcs, opts.tonality)
      ) {
        top = {
          natureId: 'seventh',
          rootPc: domRoot,
          confidence: Math.max(top.confidence, 0.55),
          missingRoles: [],
          reason: 'Minor third with no bass → dominant seventh on the fifth below',
        }
      }
    }
  }

  // Bass a major sixth under the lead, on a diatonic root, is that sixth chord
  // (G in the bass, E in the lead → G6), not the diminished seventh on E.
  if (opts.mode === 'major' && partsPresent < 4 && bassPc != null) {
    const leadPc = pc(lead)
    if (((leadPc - bassPc) % 12 + 12) % 12 === 9) {
      const sixthTones = [0, 4, 7, 9].map((off) => pc(bassPc + off))
      const degree = degreeOf(bassPc, opts.tonality)
      if (
        presentPcs.every((p) => sixthTones.includes(p)) &&
        [0, 2, 4, 5, 7, 9, 11].includes(degree) &&
        isNatureAllowed(opts.profile, 'sixth')
      ) {
        top = {
          natureId: 'sixth',
          rootPc: bassPc,
          confidence: Math.max(top.confidence, 0.55),
          missingRoles: [],
          reason: 'Bass a major sixth under the lead → sixth on the bass',
        }
      }
    }
  }

  // A sung root plus its major 6th (no bass pattern above) stays a sixth when
  // every sung note belongs to that chord, instead of a seventh that cannot
  // contain the 6th.
  if (
    opts.mode === 'major' &&
    partsPresent < 4 &&
    top.natureId !== 'sixth' &&
    bassPc == null
  ) {
    for (const rootPc of presentPcs) {
      const sixthPc = pc(rootPc + 9)
      if (!presentPcs.includes(sixthPc)) continue
      const sixthTones = [0, 4, 7, 9].map((off) => pc(rootPc + off))
      if (!presentPcs.every((p) => sixthTones.includes(p))) continue
      if (![0, 2, 4, 5, 7, 9, 11].includes(degreeOf(rootPc, opts.tonality))) continue
      if (!isNatureAllowed(opts.profile, 'sixth')) continue
      // A minor third already claimed as a dominant seventh stays that seventh.
      if (top.natureId === 'seventh' && presentPcs.every((p) => {
        const tones = [0, 4, 7, 10].map((off) => pc(top.rootPc + off))
        return tones.includes(p)
      })) {
        break
      }
      top = {
        natureId: 'sixth',
        rootPc,
        confidence: Math.max(top.confidence, 0.55),
        missingRoles: [],
        reason: 'Sung root and major 6th → sixth',
      }
      break
    }
  }

  // The 3rd and 5th of the key (E–G in C) are the tonic triad when no bass is
  // sung. With a bass, those same two pitch classes are a sixth on V.
  if (opts.mode === 'major' && partsPresent < 4 && bassPc == null) {
    const third = pc(tonicPc + 4)
    const fifth = pc(tonicPc + 7)
    if (
      presentPcs.includes(third) &&
      presentPcs.includes(fifth) &&
      presentPcs.every((p) => p === third || p === fifth)
    ) {
      top = {
        natureId: 'major',
        rootPc: tonicPc,
        confidence: Math.max(top.confidence, 0.55),
        missingRoles: [],
        reason: 'Sung 3rd and 5th of the key → tonic triad',
      }
    }
  }
  if (opts.mode === 'major' && partsPresent < 4 && bassPc != null) {
    const third = pc(tonicPc + 4)
    const fifth = pc(tonicPc + 7)
    if (
      presentPcs.includes(third) &&
      presentPcs.includes(fifth) &&
      presentPcs.every((p) => p === third || p === fifth) &&
      isNatureAllowed(opts.profile, 'sixth')
    ) {
      top = {
        natureId: 'sixth',
        rootPc: fifth,
        confidence: Math.max(top.confidence, 0.55),
        missingRoles: [],
        reason: 'Bass present on the 3rd and 5th of the key → sixth on V',
      }
    }
  }

  // Lead a perfect fourth above the bass is the root, and the bass is its
  // fifth (D over A). That is the dominant seventh on the lead. I and IV stay
  // triads until their flat 7th is actually sung.
  if (opts.mode === 'major' && partsPresent < 4 && bassPc != null) {
    const leadPc = pc(lead)
    const leadDeg = degreeOf(leadPc, opts.tonality)
    const flatSeventhSung = presentPcs.includes(pc(leadPc + 10))
    const fifthUnderLead = ((leadPc - bassPc) % 12 + 12) % 12 === 5
    const keepTriad = leadDeg === 0 || (leadDeg === 5 && !flatSeventhSung)
    const fitsTriad = presentPcs.every((p) => [0, 4, 7].some((off) => pc(leadPc + off) === p))
    const fitsSeventh = presentPcs.every((p) => [0, 4, 7, 10].some((off) => pc(leadPc + off) === p))
    if (fifthUnderLead && keepTriad && fitsTriad) {
      top = {
        natureId: 'major',
        rootPc: leadPc,
        confidence: Math.max(top.confidence, 0.55),
        missingRoles: [],
        reason: leadDeg === 5 ? 'IV fifth under the lead → major triad' : 'Tonic fifth under the lead → major triad',
      }
    } else if (
      fifthUnderLead &&
      !keepTriad &&
      fitsSeventh &&
      isNatureAllowed(opts.profile, 'seventh') &&
      majorKeyIncompleteAllows('seventh', leadPc, presentPcs, opts.tonality)
    ) {
      top = {
        natureId: 'seventh',
        rootPc: leadPc,
        confidence: Math.max(top.confidence, 0.55),
        missingRoles: [],
        reason: 'Bass on the fifth under the lead → dominant seventh on the lead',
      }
    }
  }

  // Barbershop spells non-tonic major chords as dominant sevenths. I stays a
  // triad, and so does IV unless the flat 7th is sung. Diminished color is the
  // fully diminished seventh.
  if (opts.mode === 'major' && partsPresent < 4) {
    const deg = degreeOf(top.rootPc, opts.tonality)
    const flatSeventhSung = presentPcs.includes(pc(top.rootPc + 10))
    const triadTones = [0, 4, 7].map((off) => pc(top.rootPc + off))
    const notesFitTriad = presentPcs.every((p) => triadTones.includes(p))
    if (deg === 5 && !flatSeventhSung && notesFitTriad && (top.natureId === 'seventh' || top.natureId === 'ninth' || top.natureId === 'major')) {
      top = {
        natureId: 'major',
        rootPc: top.rootPc,
        confidence: Math.max(top.confidence, 0.55),
        missingRoles: [],
        reason: 'IV without a sung flat 7th → major triad',
      }
    } else if (
      top.natureId === 'major' &&
      deg !== 0 &&
      deg !== 5 &&
      isNatureAllowed(opts.profile, 'seventh') &&
      majorKeyIncompleteAllows('seventh', top.rootPc, presentPcs, opts.tonality)
    ) {
      top = {
        ...top,
        natureId: 'seventh',
        confidence: Math.max(top.confidence, 0.55),
        reason: 'Non-tonic major-key incomplete stack → dominant seventh',
      }
    }
  }
  if (
    opts.mode === 'major' &&
    partsPresent < 4 &&
    (top.natureId === 'dim' || top.natureId === 'dim7') &&
    isNatureAllowed(opts.profile, 'dim7')
  ) {
    const leadPc = pc(lead)
    const tones = [0, 3, 6, 9].map((off) => pc(top.rootPc + off))
    top = {
      ...top,
      natureId: 'dim7',
      rootPc: tones.includes(leadPc) ? leadPc : top.rootPc,
      confidence: Math.max(top.confidence, 0.55),
      reason: 'Incomplete diminished stack → dim7 spelled from the melody',
    }
  }

  // Three voices on a minor triad (ii / iii / vi) are a minor add-6. The empty
  // voice sings the major 6th, rather than the relative major sixth.
  if (opts.mode === 'major' && partsPresent < 4 && presentPcs.length === 3) {
    const minorRoot = presentPcs.find((root) => {
      const rel = presentPcs.map((p) => (p - root + 12) % 12).sort((a, b) => a - b)
      return rel[0] === 0 && rel[1] === 3 && rel[2] === 7
    })
    if (
      minorRoot != null &&
      isNatureAllowed(opts.profile, 'madd6') &&
      majorKeyIncompleteAllows('madd6', minorRoot, presentPcs, opts.tonality)
    ) {
      top = {
        natureId: 'madd6',
        rootPc: minorRoot,
        confidence: Math.max(top.confidence, 0.55),
        missingRoles: [],
        reason: 'Minor triad → minor add-6, empty voice takes the 6th',
      }
    }
  }
  // Three voices on a diminished triad are a dim7. The empty voice sings the
  // remaining tone. Root is the note the other two sit a minor 3rd and a tritone above.
  if (opts.mode === 'major' && partsPresent < 4 && presentPcs.length === 3) {
    const dimRoot = presentPcs.find((root) => {
      const rel = presentPcs.map((p) => (p - root + 12) % 12).sort((a, b) => a - b)
      return rel[0] === 0 && rel[1] === 3 && rel[2] === 6
    })
    if (dimRoot != null && isNatureAllowed(opts.profile, 'dim7')) {
      top = {
        natureId: 'dim7',
        rootPc: dimRoot,
        confidence: Math.max(top.confidence, 0.55),
        missingRoles: [],
        reason: 'Diminished triad → dim7, empty voice takes the remaining tone',
      }
    }
  }

  if (
    opts.mode === 'major' &&
    partsPresent < 4 &&
    majorKeyIncompleteAllows(top.natureId, top.rootPc, presentPcs, opts.tonality)
  ) {
    top = { ...top, confidence: Math.max(top.confidence, 0.55) }
  }

  if (opts.mode === 'major' && partsPresent < 4) {
    const dyad = dissonantDyadChord(opts.midi, presentPcs, opts.tonality, opts.profile)
    const named = pcsFitNature(top.rootPc, top.natureId, presentPcs) && top.confidence >= 0.45
    if (dyad && !named) {
      top = {
        natureId: dyad.natureId,
        rootPc: dyad.rootPc,
        confidence: 0.55,
        missingRoles: [],
        reason: dyad.reason,
      }
    }
  }

  return {
    natureId: top.natureId,
    rootPc: top.rootPc,
    voicing: voicingStringFromMidi(opts.midi, top.rootPc, top.natureId),
    confidence: top.confidence,
  }
}

/** Higher = better when voicing-match scores tie (partial stacks). */
function catalogueTieBreak(
  natureId: string,
  rootPc: number,
  presentPcs: number[],
  bassPc: number | null,
): number {
  let t = extensionPresenceBonus(natureId, rootPc, presentPcs) * 10
  // Omit-root Dom9 (etc.) shares PCs with a bass-rooted m6/6 — prefer the bass root.
  if (!presentPcs.includes(pc(rootPc))) t -= 12
  if (bassPc != null && bassPc === rootPc) t += 15
  t += Math.max(0, 7 - ringTier(natureId))
  return t
}

function extensionPresenceBonus(natureId: string, rootPc: number, presentPcs: number[]): number {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!chord) return 0
  let n = 0
  for (const role of [6, 7, 9] as const) {
    const off = chord.offsets[role]
    if (off != null && presentPcs.includes(pc(rootPc + off))) n += 1
  }
  return n
}

function voicingMatchScore(
  placed: VoicingPitches,
  got: Partial<VoicingPitches>,
): number {
  let score = 0
  let compared = 0
  for (const k of ['bass', 'bari', 'lead', 'tenor'] as const) {
    if (got[k] == null) continue
    compared++
    if (got[k] === placed[k]) score += 1
    else if (pc(got[k]!) === pc(placed[k])) score += 0.5
    else return -1
  }
  return compared > 0 ? score : -1
}
