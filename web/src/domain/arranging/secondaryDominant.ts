/**
 * Secondary-dominant / Roman-numeral helpers (Szabo + Approach Three R1).
 * A BS7 whose root is a P5 above a target functions as V7 of that target.
 *
 * Labeling policy (theory-correctness plan):
 * - Prefer I7 on tonic Mm7 (alt V7/IV when it drives IV)
 * - Prefer V7/V with alt II7 when degree-2 Mm7 drives V
 * - Never emit V7/degN; use chromatic degree names
 * - m7 is never labeled as V7 / V7/X
 */
import type { TonalityMode } from './types'

export function pcOf(n: number): number {
  return ((n % 12) + 12) % 12
}

/** True when `dominantRoot` is a perfect fifth above `targetRoot` (V of target). */
export function isDominantOf(dominantRoot: number, targetRoot: number): boolean {
  return pcOf(dominantRoot - targetRoot) === 7
}

/** Root of the secondary dominant of `targetRoot` (target + P5). */
export function secondaryDominantRootOf(targetRoot: number): number {
  return pcOf(targetRoot + 7)
}

/** Scale degree 0..11 of root relative to tonality. */
export function degreeOf(rootPc: number, tonality: number): number {
  return pcOf(rootPc - tonality)
}

const MAJOR_RN: Record<number, string> = {
  0: 'I',
  2: 'ii',
  4: 'iii',
  5: 'IV',
  7: 'V',
  9: 'vi',
  11: 'vii',
}

const MINOR_RN: Record<number, string> = {
  0: 'i',
  2: 'ii',
  3: 'III',
  5: 'iv',
  7: 'V',
  8: 'VI',
  10: 'VII',
}

/** Chromatic degree names — never fall through to degN. */
const CHROMATIC_MAJOR: Record<number, string> = {
  0: 'I',
  1: '♭II',
  2: 'ii',
  3: '♭III',
  4: 'iii',
  5: 'IV',
  6: '♯IV',
  7: 'V',
  8: '♭VI',
  9: 'vi',
  10: '♭VII',
  11: 'vii',
}

const CHROMATIC_MINOR: Record<number, string> = {
  0: 'i',
  1: '♭II',
  2: 'ii',
  3: 'III',
  4: '♯iii',
  5: 'iv',
  6: '♯iv',
  7: 'V',
  8: 'VI',
  9: '♯vi',
  10: 'VII',
  11: 'vii',
}

function chromaticDegree(rootPc: number, tonality: number, mode: TonalityMode): string {
  const deg = degreeOf(rootPc, tonality)
  const table = mode === 'minor' ? CHROMATIC_MINOR : CHROMATIC_MAJOR
  return table[deg] ?? `♭${deg}`
}

function baseRoman(rootPc: number, tonality: number, mode: TonalityMode): string {
  const deg = degreeOf(rootPc, tonality)
  const table = mode === 'minor' ? MINOR_RN : MAJOR_RN
  return table[deg] ?? chromaticDegree(rootPc, tonality, mode)
}

function secondaryOfLabel(targetRoot: number, tonality: number, mode: TonalityMode): string {
  const deg = degreeOf(targetRoot, tonality)
  if (deg === 0) return mode === 'minor' ? 'i' : 'I'
  if (deg === 5) return mode === 'minor' ? 'iv' : 'IV'
  if (deg === 7) return 'V'
  if (deg === 2) return 'ii'
  if (deg === 9) return mode === 'minor' ? 'VI' : 'vi'
  if (deg === 4) return mode === 'minor' ? 'III' : 'iii'
  if (deg === 3 && mode === 'major') return '♭III'
  if (deg === 8 && mode === 'major') return '♭VI'
  if (deg === 10 && mode === 'major') return '♭VII'
  if (deg === 1) return '♭II'
  return chromaticDegree(targetRoot, tonality, mode)
}

/** Dominant-quality natures eligible for V7 / V7/X labeling. */
function isMmSeventh(natureId: string): boolean {
  return natureId === 'seventh' || natureId === 'ninth'
}

export type RomanLabelOpts = {
  rootPc: number
  natureId: string
  tonality: number
  mode?: TonalityMode
  /** Resolution target (often next pillar). Enables V7/X labeling. */
  resolvesToRoot?: number | null
}

export type RomanLabelResult = {
  roman: string
  /** Dual display when classical and barbershop labels disagree. */
  altRoman?: string
}

/**
 * Detailed Roman numeral (primary + optional alt).
 */
export function romanForChordDetailed(opts: RomanLabelOpts): RomanLabelResult {
  const mode = opts.mode ?? 'major'
  const target = opts.resolvesToRoot
  const rootDeg = degreeOf(opts.rootPc, opts.tonality)
  const tonicRoman = mode === 'minor' ? 'i' : 'I'

  // Mm7 that dominates a target
  if (isMmSeventh(opts.natureId) && target != null && isDominantOf(opts.rootPc, target)) {
    const of = secondaryOfLabel(target, opts.tonality, mode)
    // Tonic Mm7 driving IV: Szabo prefers I7; classical alt V7/IV
    if (rootDeg === 0 && (of === 'IV' || of === 'iv')) {
      return { roman: `${tonicRoman}7`, altRoman: `V7/${of}` }
    }
    if (of === 'I' || of === 'i') return { roman: 'V7' }
    if (of === 'V') return { roman: 'V7/V', altRoman: 'II7' }
    // Never V7/degN — secondaryOfLabel always returns a named degree
    if (of.startsWith('deg')) {
      const chrom = chromaticDegree(target, opts.tonality, mode)
      return { roman: `V7/${chrom}` }
    }
    return { roman: `V7/${of}` }
  }

  const base = baseRoman(opts.rootPc, opts.tonality, mode)

  if (isMmSeventh(opts.natureId)) {
    // Tonic Mm7 without (or with non-IV) functional target → I7
    if (rootDeg === 0) return { roman: `${tonicRoman}7` }
    // IV7 is never a secondary of a diatonic triad by itself
    if (rootDeg === 5) return { roman: `${mode === 'minor' ? 'iv' : 'IV'}7` }
    let roman = `${base}7`
    if (roman === 'ii7') roman = 'II7'
    if (roman === 'II7') return { roman: 'II7', altRoman: 'V7/V' }
    return { roman }
  }

  // m7 and other natures: quality on degree — never V7
  if (opts.natureId === 'm7') return { roman: `${base}7`.replace(/^I7$/, 'i7').replace(/^IV7$/, 'iv7') }
  if (opts.natureId === 'major' && mode === 'major') return { roman: base }
  if (opts.natureId === 'minor') {
    return { roman: base.toLowerCase() === base ? base : base.toLowerCase() }
  }
  return { roman: base }
}

/**
 * Roman numeral for a stack (primary label only).
 */
export function romanForChord(opts: RomanLabelOpts): string {
  return romanForChordDetailed(opts).roman
}

/** True when this seventh is a secondary dominant of the given target (or diatonic V7). */
export function isSecondaryDominantSeventh(opts: {
  rootPc: number
  natureId: string
  targetRoot: number
}): boolean {
  if (opts.natureId !== 'seventh' && opts.natureId !== 'ninth') return false
  return isDominantOf(opts.rootPc, opts.targetRoot)
}
