/**
 * Full-arrangement harmonic analysis: Roman numerals, functions, progressions.
 * Considers V–I, V/V, passing chords, tritone subs, relatives, circle-of-fifths.
 * @see knowledge/17-general-theory-and-acappella.md · secondaryDominant.ts
 */
import { isDominantOf, pcOf, degreeOf, secondaryDominantRootOf } from './secondaryDominant'
import { counterpartRoot } from './counterpart'
import { isDominantNature } from './tensionRelease'
import type { ArrangementProject, ChordStack, TonalityMode } from './types'

export type ChordFunctionKind =
  | 'tonic'
  | 'subdominant'
  | 'dominant'
  | 'secondary_dominant'
  | 'tritone_sub'
  | 'passing'
  | 'neighbor'
  | 'relative'
  | 'counterpart'
  | 'modal_color'
  | 'other'

export type ProgressionKind =
  | 'authentic' // V(7) → I/i
  | 'plagal' // IV/iv → I/i
  | 'half_cadence' // … → V
  | 'deceptive' // V → vi/VI
  | 'secondary_resolution' // V7/X → X
  | 'circle_fifth' // root down P5
  | 'tritone_sub_resolve' // SubV / ♭II7 → tonic (or target)
  | 'counterpart_swap' // BS7 ↔ counterpart
  | 'chromatic_pass'
  | 'retrogression' // up P5 (non-IV→I)
  | 'same_harmony'
  | 'other'

export type StackHarmonicLabel = {
  stackId: string
  startTick: number
  rootPc: number
  natureId: string
  /** Scale degree 0–11 of root vs tonality. */
  degree: number
  /** Primary Roman numeral (may include V7/V, ♭II7, etc.). */
  roman: string
  /** Alternate readings when ambiguous. */
  alts: string[]
  functionKind: ChordFunctionKind
  /** Short teaching sentence. */
  role: string
  teachingId?: string
}

export type ProgressionLink = {
  id: string
  fromStackId: string
  toStackId: string
  kind: ProgressionKind
  label: string
  fromRoman: string
  toRoman: string
  teachingId?: string
  /** Confidence 0..1 */
  confidence: number
}

export type ProgressionPattern = {
  id: string
  kind: string
  label: string
  stackIds: string[]
  romans: string[]
  teachingId?: string
}

export type ArrangementHarmonicAnalysis = {
  tonality: number
  mode: TonalityMode
  stacks: StackHarmonicLabel[]
  links: ProgressionLink[]
  patterns: ProgressionPattern[]
  summary: string
  counts: {
    authentic: number
    secondaryResolutions: number
    tritoneSubs: number
    circleFifths: number
    passing: number
  }
}

function diatonicQuality(
  degree: number,
  mode: TonalityMode,
): 'major' | 'minor' | 'dim' | null {
  if (mode === 'minor') {
    // natural minor: i ii° III iv v VI VII — but barbershop often uses V major
    const map: Record<number, 'major' | 'minor' | 'dim'> = {
      0: 'minor',
      2: 'dim',
      3: 'major',
      5: 'minor',
      7: 'major', // V often major in minor
      8: 'major',
      10: 'major',
    }
    return map[degree] ?? null
  }
  const map: Record<number, 'major' | 'minor' | 'dim'> = {
    0: 'major',
    2: 'minor',
    4: 'minor',
    5: 'major',
    7: 'major',
    9: 'minor',
    11: 'dim',
  }
  return map[degree] ?? null
}

function natureQuality(
  natureId: string,
): 'major' | 'minor' | 'dim' | 'aug' | 'dom' | 'other' {
  switch (natureId) {
    case 'major':
    case 'sixth':
    case 'add9':
    case 'maj7':
      return 'major'
    case 'minor':
    case 'm7':
    case 'madd6':
      return 'minor'
    case 'dim':
    case 'dim7':
    case 'half-dim':
      return 'dim'
    case 'aug':
      return 'aug'
    case 'seventh':
    case 'ninth':
      return 'dom'
    default:
      return 'other'
  }
}

function baseDegreeRoman(degree: number, mode: TonalityMode, quality: string): string {
  if (mode === 'minor') {
    const names: Record<number, string> = {
      0: 'i',
      2: 'ii°',
      3: 'III',
      5: 'iv',
      7: 'V',
      8: 'VI',
      10: 'VII',
    }
    let r = names[degree]
    if (!r) {
      // Chromatic / non-natural minor degrees — never emit bare degN
      if (degree === 1) return '♯i/♭II'
      if (degree === 4) return '♯iii/♭IV'
      if (degree === 6) return '♯iv/♭V'
      if (degree === 9) return '♯vi/♭VII'
      if (degree === 11) return '♯vii/♮VII'
      return degree < 6 ? `♭deg${degree}` : `♯deg${degree}`
    }
    if (degree === 0 && quality === 'major') return 'I'
    if (degree === 5 && quality === 'major') return 'IV'
    if (degree === 7 && quality === 'minor') return 'v'
    if (degree === 2 && quality === 'minor') return 'ii'
    return r
  }
  const names: Record<number, string> = {
    0: 'I',
    2: 'ii',
    4: 'iii',
    5: 'IV',
    7: 'V',
    9: 'vi',
    11: 'vii°',
  }
  let r = names[degree]
  if (!r) {
    // Chromatic roots — common alterations (never V7/degN-style bare deg)
    if (degree === 1) return '♭II'
    if (degree === 3) return '♭III'
    if (degree === 6) return '♯IV/♭V'
    if (degree === 8) return '♭VI'
    if (degree === 10) return '♭VII'
    return degree < 6 ? `♭${degree}` : `♯${degree}`
  }
  if (degree === 11 && quality === 'dom') return 'VII'
  if (degree === 2 && quality === 'dom') return 'II'
  if (degree === 4 && quality === 'dom') return 'III'
  if (degree === 9 && quality === 'dom') return 'VI'
  if (degree === 0 && quality === 'minor') return 'i'
  if (degree === 5 && quality === 'minor') return 'iv'
  if (degree === 7 && quality === 'minor') return 'v'
  return r
}

function withSeventhSuffix(roman: string, natureId: string): string {
  if (natureId === 'ninth') {
    if (roman.endsWith('7')) return roman.replace(/7$/, '9')
    return `${roman}9`
  }
  if (natureId === 'maj7') return roman.includes('I') || roman === 'IV' ? `${roman}maj7` : `${roman}M7`
  if (natureId === 'm7') return roman.endsWith('7') ? roman : `${roman}7`
  if (natureId === 'half-dim') {
    if (roman.includes('°')) return roman.replace('°', 'ø7')
    return `${roman}ø7`
  }
  if (natureId === 'dim7') return roman.includes('°') ? `${roman}7` : `${roman}°7`
  if (natureId === 'seventh') {
    // Prefer II7 over ii7 for dominant-quality on scale degree 2
    if (roman === 'ii') return 'II7'
    if (roman === 'iii') return 'III7'
    if (roman === 'vi') return 'VI7'
    if (roman === 'vii°') return 'VII7'
    if (roman.endsWith('7')) return roman
    return `${roman}7`
  }
  if (natureId === 'sixth' || natureId === 'madd6') return `${roman}6`
  if (natureId === 'add9') return `${roman}add9`
  if (natureId === 'aug') return `${roman}+`
  return roman
}

function secondaryLabel(targetDegreeRoman: string): string {
  if (targetDegreeRoman === 'I' || targetDegreeRoman === 'i') return 'V7'
  if (targetDegreeRoman === 'V' || targetDegreeRoman === 'v') return 'V7/V'
  // Strip quality suffixes for /X
  const bare = targetDegreeRoman.replace(/(maj7|M7|add9|ø7|°7|7|9|6|\+|°)$/g, '')
  return `V7/${bare}`
}

function diatonicTargetRoman(
  rootPc: number,
  tonality: number,
  mode: TonalityMode,
  natureId: string,
): string {
  const deg = degreeOf(rootPc, tonality)
  const q = natureQuality(natureId)
  const base = baseDegreeRoman(deg, mode, q)
  return withSeventhSuffix(base, natureId)
}

/**
 * Label one stack using key + optional resolution target (usually next stack root).
 */
export function labelStackHarmony(opts: {
  stack: ChordStack
  tonality: number
  mode: TonalityMode
  nextRootPc?: number | null
  nextNatureId?: string | null
  prevRootPc?: number | null
  prevNatureId?: string | null
}): StackHarmonicLabel {
  const { stack, tonality, mode } = opts
  const degree = degreeOf(stack.rootPc, tonality)
  const q = natureQuality(stack.natureId)
  const alts: string[] = []
  let roman = diatonicTargetRoman(stack.rootPc, tonality, mode, stack.natureId)
  let functionKind: ChordFunctionKind = 'other'
  let role = 'Chord in the key.'
  let teachingId: string | undefined

  const next = opts.nextRootPc
  const isDom = isDominantNature(stack.natureId)

  // Secondary dominant looking ahead
  if (isDom && next != null && isDominantOf(stack.rootPc, next)) {
    const targetDeg = degreeOf(next, tonality)
    const targetQ = natureQuality(opts.nextNatureId ?? 'major')
    const targetBase = baseDegreeRoman(targetDeg, mode, targetQ)
    const diatonic = diatonicTargetRoman(stack.rootPc, tonality, mode, stack.natureId)
    // Szabo / secondaryDominant.ts: tonic Mm7 → I7 primary, alt V7/IV when driving IV
    if (degree === 0 && targetDeg === 5) {
      roman = mode === 'minor' ? 'i7' : 'I7'
      alts.push(secondaryLabel(targetBase))
      functionKind = 'secondary_dominant'
      role = 'Tonic seventh (I7) driving IV — also readable as V7/IV.'
      teachingId = 'secondary_dom'
    } else {
      roman = secondaryLabel(targetBase)
      functionKind = targetDeg === 0 ? 'dominant' : 'secondary_dominant'
      role =
        targetDeg === 0
          ? 'Dominant (V7) aiming at tonic — classic tension before release.'
          : `Secondary dominant (V7 of ${targetBase}) — tension toward that chord.`
      teachingId = targetDeg === 0 ? 'tension_release' : 'secondary_dom'
      alts.push(diatonic)
      if (roman === 'V7/V' && !alts.includes('II7')) alts.push('II7')
    }
  } else if (
    isDom &&
    next != null &&
    stack.rootPc === counterpartRoot(secondaryDominantRootOf(next))
  ) {
    // Tritone sub of V of next: root is tritone from expected dominant of next
    const expectedV = secondaryDominantRootOf(next)
    if (stack.rootPc === counterpartRoot(expectedV)) {
      const targetDeg = degreeOf(next, tonality)
      const targetBase = baseDegreeRoman(
        targetDeg,
        mode,
        natureQuality(opts.nextNatureId ?? 'major'),
      )
      roman = targetDeg === 0 ? '♭II7' : `SubV7/${targetBase.replace(/(7|9|6)$/, '')}`
      functionKind = 'tritone_sub'
      role = `Tritone substitute for V of ${targetBase} — shares 3↔7 with the expected dominant.`
      teachingId = 'counterpart'
      alts.push(diatonicTargetRoman(stack.rootPc, tonality, mode, stack.natureId))
      alts.push(`V7/${targetBase} counterpart`)
    }
  } else if (
    isDom &&
    opts.prevRootPc != null &&
    stack.rootPc === counterpartRoot(opts.prevRootPc) &&
    isDominantNature(opts.prevNatureId ?? '')
  ) {
    roman = `R3(${diatonicTargetRoman(opts.prevRootPc, tonality, mode, opts.prevNatureId!)})`
    functionKind = 'counterpart'
    role = 'Tritone counterpart of the previous BS7 — same 3↔7 tension, different bass.'
    teachingId = 'counterpart'
    alts.push(diatonicTargetRoman(stack.rootPc, tonality, mode, stack.natureId))
  } else {
    // Functional family from degree
    if (degree === 0) {
      functionKind = q === 'dom' ? 'modal_color' : 'tonic'
      role =
        q === 'dom'
          ? 'BS7 on tonic — barbershop color; still “home” root.'
          : 'Tonic-area harmony.'
      teachingId = 'pillar'
    } else if (degree === 5) {
      functionKind = 'subdominant'
      role = 'Subdominant (IV/iv) — often a springboard.'
      teachingId = 'springboard'
    } else if (degree === 7) {
      functionKind = isDom || q === 'major' ? 'dominant' : 'modal_color'
      role = 'Dominant-area harmony.'
      teachingId = 'tension_release'
    } else if (degree === 2 && isDom) {
      functionKind = 'secondary_dominant'
      role = 'II7 often functions as V7/V when it drives to V.'
      teachingId = 'secondary_dom'
      alts.push('V7/V')
    } else if (
      opts.prevRootPc != null &&
      (pcOf(stack.rootPc - opts.prevRootPc) === 1 ||
        pcOf(stack.rootPc - opts.prevRootPc) === 11)
    ) {
      functionKind = 'passing'
      role = 'Chromatic neighbor / passing root relative to the previous chord.'
      teachingId = 'scf'
    } else if (degree === 9 || degree === 4) {
      functionKind = 'relative'
      role = 'Relative / mediant color in the key.'
      teachingId = 'common_tone'
    } else if (diatonicQuality(degree, mode) == null) {
      functionKind = 'modal_color'
      role = 'Chromatic root outside the diatonic set — color or applied chord.'
    } else {
      functionKind = 'other'
      role = 'Diatonic or near-diatonic harmony.'
    }
  }

  return {
    stackId: stack.id,
    startTick: stack.startTick,
    rootPc: stack.rootPc,
    natureId: stack.natureId,
    degree,
    roman,
    alts,
    functionKind,
    role,
    teachingId,
  }
}

function linkProgression(
  from: StackHarmonicLabel,
  to: StackHarmonicLabel,
  fromStack: ChordStack,
  toStack: ChordStack,
): ProgressionLink | null {
  const rootDiff = pcOf(to.rootPc - from.rootPc)
  const id = `link-${from.stackId}-${to.stackId}`

  // Same harmony
  if (from.rootPc === to.rootPc && from.natureId === to.natureId) {
    return {
      id,
      fromStackId: from.stackId,
      toStackId: to.stackId,
      kind: 'same_harmony',
      label: 'Same harmony repeated',
      fromRoman: from.roman,
      toRoman: to.roman,
      confidence: 1,
    }
  }

  // Counterpart swap
  if (
    isDominantNature(from.natureId) &&
    isDominantNature(to.natureId) &&
    to.rootPc === counterpartRoot(from.rootPc)
  ) {
    return {
      id,
      fromStackId: from.stackId,
      toStackId: to.stackId,
      kind: 'counterpart_swap',
      label: `${from.roman} → ${to.roman} (tritone counterpart)`,
      fromRoman: from.roman,
      toRoman: to.roman,
      teachingId: 'counterpart',
      confidence: 0.95,
    }
  }

  // Tritone sub resolve: ♭II7 / SubV → tonic (or target a P5 below the “would-be” V)
  if (
    isDominantNature(from.natureId) &&
    from.functionKind === 'tritone_sub' &&
    isDominantOf(counterpartRoot(from.rootPc), to.rootPc)
  ) {
    return {
      id,
      fromStackId: from.stackId,
      toStackId: to.stackId,
      kind: 'tritone_sub_resolve',
      label: `${from.roman} → ${to.roman} (tritone-sub resolution)`,
      fromRoman: from.roman,
      toRoman: to.roman,
      teachingId: 'counterpart',
      confidence: 0.9,
    }
  }
  // Also: Db7 → C when C is tonic-ish even if not tagged yet
  if (
    isDominantNature(from.natureId) &&
    rootDiff === 11 && // down chromatic / up 11 = root motion of tritone-sub to tonic often
    (to.functionKind === 'tonic' || to.degree === 0)
  ) {
    // More precise: from root is tritone from V of to
    if (from.rootPc === counterpartRoot(secondaryDominantRootOf(to.rootPc))) {
      return {
        id,
        fromStackId: from.stackId,
        toStackId: to.stackId,
        kind: 'tritone_sub_resolve',
        label: `${from.roman} → ${to.roman} (tritone substitute resolves)`,
        fromRoman: from.roman,
        toRoman: to.roman,
        teachingId: 'counterpart',
        confidence: 0.88,
      }
    }
  }

  // Authentic: V(7) → I
  if (
    (from.degree === 7 || from.roman === 'V7' || from.roman.startsWith('V')) &&
    to.degree === 0 &&
    (isDominantNature(from.natureId) || from.natureId === 'major')
  ) {
    return {
      id,
      fromStackId: from.stackId,
      toStackId: to.stackId,
      kind: 'authentic',
      label: `${from.roman} → ${to.roman} (authentic cadence / 5–1)`,
      fromRoman: from.roman,
      toRoman: to.roman,
      teachingId: 'classic_cadences',
      confidence: isDominantNature(from.natureId) ? 0.98 : 0.85,
    }
  }

  // Secondary resolution: V7/X → X
  if (
    isDominantNature(from.natureId) &&
    isDominantOf(from.rootPc, to.rootPc) &&
    to.degree !== 0
  ) {
    return {
      id,
      fromStackId: from.stackId,
      toStackId: to.stackId,
      kind: 'secondary_resolution',
      label: `${from.roman} → ${to.roman} (secondary dominant resolves)`,
      fromRoman: from.roman,
      toRoman: to.roman,
      teachingId: 'secondary_dom',
      confidence: 0.95,
    }
  }
  if (isDominantNature(from.natureId) && isDominantOf(from.rootPc, to.rootPc) && to.degree === 0) {
    return {
      id,
      fromStackId: from.stackId,
      toStackId: to.stackId,
      kind: 'authentic',
      label: `${from.roman} → ${to.roman} (5–1 resolution)`,
      fromRoman: from.roman,
      toRoman: to.roman,
      teachingId: 'classic_cadences',
      confidence: 0.98,
    }
  }

  // Plagal IV → I
  if (from.degree === 5 && to.degree === 0) {
    return {
      id,
      fromStackId: from.stackId,
      toStackId: to.stackId,
      kind: 'plagal',
      label: `${from.roman} → ${to.roman} (plagal / amen)`,
      fromRoman: from.roman,
      toRoman: to.roman,
      teachingId: 'classic_cadences',
      confidence: 0.9,
    }
  }

  // Deceptive V → vi
  if (from.degree === 7 && to.degree === 9 && isDominantNature(from.natureId)) {
    return {
      id,
      fromStackId: from.stackId,
      toStackId: to.stackId,
      kind: 'deceptive',
      label: `${from.roman} → ${to.roman} (deceptive cadence)`,
      fromRoman: from.roman,
      toRoman: to.roman,
      teachingId: 'tension_release',
      confidence: 0.85,
    }
  }

  // Half cadence … → V
  if (to.degree === 7 && from.degree !== 7) {
    return {
      id,
      fromStackId: from.stackId,
      toStackId: to.stackId,
      kind: 'half_cadence',
      label: `${from.roman} → ${to.roman} (half cadence / open on V)`,
      fromRoman: from.roman,
      toRoman: to.roman,
      teachingId: 'tension_release',
      confidence: 0.7,
    }
  }

  // Circle of fifths (root down P5 = +5 semis)
  if (rootDiff === 5) {
    return {
      id,
      fromStackId: from.stackId,
      toStackId: to.stackId,
      kind: 'circle_fifth',
      label: `${from.roman} → ${to.roman} (descending fifth)`,
      fromRoman: from.roman,
      toRoman: to.roman,
      teachingId: 'circle_fifths',
      confidence: 0.8,
    }
  }

  // Retrogression up P5 (except IV→I already plagal)
  if (rootDiff === 7 && !(from.degree === 5 && to.degree === 0)) {
    return {
      id,
      fromStackId: from.stackId,
      toStackId: to.stackId,
      kind: 'retrogression',
      label: `${from.roman} → ${to.roman} (retrogression / up a fifth)`,
      fromRoman: from.roman,
      toRoman: to.roman,
      teachingId: 'circle_fifths',
      confidence: 0.75,
    }
  }

  // Chromatic passing
  if (rootDiff === 1 || rootDiff === 11) {
    return {
      id,
      fromStackId: from.stackId,
      toStackId: to.stackId,
      kind: 'chromatic_pass',
      label: `${from.roman} → ${to.roman} (chromatic root motion)`,
      fromRoman: from.roman,
      toRoman: to.roman,
      teachingId: 'scf',
      confidence: 0.7,
    }
  }

  void fromStack
  void toStack
  return {
    id,
    fromStackId: from.stackId,
    toStackId: to.stackId,
    kind: 'other',
    label: `${from.roman} → ${to.roman}`,
    fromRoman: from.roman,
    toRoman: to.roman,
    confidence: 0.4,
  }
}

function detectPatterns(
  labels: StackHarmonicLabel[],
  links: ProgressionLink[],
): ProgressionPattern[] {
  const patterns: ProgressionPattern[] = []
  // II7 → V7 → I
  for (let i = 0; i < labels.length - 2; i++) {
    const a = labels[i]!
    const b = labels[i + 1]!
    const c = labels[i + 2]!
    const ab = links.find((l) => l.fromStackId === a.stackId && l.toStackId === b.stackId)
    const bc = links.find((l) => l.fromStackId === b.stackId && l.toStackId === c.stackId)
    const aIsVofV =
      a.roman === 'V7/V' ||
      a.roman === 'II7' ||
      (isDominantNature(a.natureId) && isDominantOf(a.rootPc, b.rootPc) && b.degree === 7)
    const bIsV = b.degree === 7 || b.roman === 'V7' || b.roman === 'V'
    const cIsI = c.degree === 0
    if (aIsVofV && bIsV && cIsI) {
      const isIiHighway = a.roman === 'II7'
      patterns.push({
        id: `pat-vv-v-i-${a.stackId}`,
        kind: isIiHighway ? 'II7–V–I' : 'V7/V–V–I',
        label: isIiHighway
          ? `${a.roman} → ${b.roman} → ${c.roman} (II7→V7→I highway)`
          : `${a.roman} → ${b.roman} → ${c.roman} (five-of-five into 5–1)`,
        stackIds: [a.stackId, b.stackId, c.stackId],
        romans: [a.roman, b.roman, c.roman],
        teachingId: isIiHighway ? 'classic_cadences' : 'secondary_dom',
      })
    }
    // Circle chain of 3+ descending fifths
    if (ab?.kind === 'circle_fifth' && bc?.kind === 'circle_fifth') {
      patterns.push({
        id: `pat-circle-${a.stackId}`,
        kind: 'circle_chain',
        label: `${a.roman} → ${b.roman} → ${c.roman} (circle-of-fifths chain)`,
        stackIds: [a.stackId, b.stackId, c.stackId],
        romans: [a.roman, b.roman, c.roman],
        teachingId: 'circle_fifths',
      })
    }
  }
  return patterns
}

function summarize(analysis: Omit<ArrangementHarmonicAnalysis, 'summary'>): string {
  const parts: string[] = []
  const mode = analysis.mode === 'minor' ? 'minor' : 'major'
  parts.push(`Key center degree analysis in ${mode}.`)
  if (analysis.counts.authentic) {
    parts.push(`${analysis.counts.authentic} authentic 5–1 resolution(s).`)
  }
  if (analysis.counts.secondaryResolutions) {
    parts.push(`${analysis.counts.secondaryResolutions} secondary-dominant resolution(s).`)
  }
  if (analysis.counts.tritoneSubs) {
    parts.push(`${analysis.counts.tritoneSubs} tritone-substitute move(s).`)
  }
  if (analysis.patterns.some((p) => p.kind === 'V7/V–V–I' || p.kind === 'II7–V–I')) {
    parts.push('Includes a V7/V → V → I or II7→V7→I highway.')
  }
  if (analysis.counts.circleFifths) {
    parts.push(`${analysis.counts.circleFifths} descending-fifth link(s).`)
  }
  if (!analysis.stacks.length) return 'No stacks to analyze.'
  const romanLine = analysis.stacks.map((s) => s.roman).join(' – ')
  parts.push(`Progression: ${romanLine}.`)
  return parts.join(' ')
}

/**
 * Analyze all arrangement stacks in the project key.
 */
export function analyzeArrangementHarmony(
  project: ArrangementProject,
): ArrangementHarmonicAnalysis {
  const mode = project.tonalityMode ?? 'major'
  const tonality = project.tonality
  const sorted = [...project.stacks].sort((a, b) => a.startTick - b.startTick)

  const labels: StackHarmonicLabel[] = sorted.map((stack, i) => {
    const next = sorted[i + 1]
    const prev = sorted[i - 1]
    return labelStackHarmony({
      stack,
      tonality,
      mode,
      nextRootPc: next?.rootPc ?? null,
      nextNatureId: next?.natureId ?? null,
      prevRootPc: prev?.rootPc ?? null,
      prevNatureId: prev?.natureId ?? null,
    })
  })

  const links: ProgressionLink[] = []
  for (let i = 0; i < labels.length - 1; i++) {
    const link = linkProgression(labels[i]!, labels[i + 1]!, sorted[i]!, sorted[i + 1]!)
    if (link) links.push(link)
  }

  const patterns = detectPatterns(labels, links)
  const counts = {
    authentic: links.filter((l) => l.kind === 'authentic').length,
    secondaryResolutions: links.filter((l) => l.kind === 'secondary_resolution').length,
    tritoneSubs: links.filter(
      (l) => l.kind === 'tritone_sub_resolve' || l.kind === 'counterpart_swap',
    ).length,
    circleFifths: links.filter((l) => l.kind === 'circle_fifth').length,
    passing: links.filter((l) => l.kind === 'chromatic_pass').length,
  }

  const draft = {
    tonality,
    mode,
    stacks: labels,
    links,
    patterns,
    counts,
  }
  return { ...draft, summary: summarize(draft) }
}
