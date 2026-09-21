/**
 * Dim7 → BS7 / m6 resolution hints (Approach Three R4 / Rylander).
 * Moving any dim7 chord tone by a half step yields an allowed chord:
 * down → BS7 (moved tone = new root); up → m6 (moved tone = 5th).
 */
import { pcOf } from './secondaryDominant'

/** Pitch classes of a dim7 built on `rootPc` (any enharmonic spelling of the set). */
export function dim7Pcs(rootPc: number): number[] {
  return [0, 3, 6, 9].map((d) => pcOf(rootPc + d))
}

/** BS7 roots obtained by dropping each dim7 tone a half step. */
export function bs7RootsFromDim7(dimRootPc: number): number[] {
  return dim7Pcs(dimRootPc).map((p) => pcOf(p - 1))
}

/**
 * Minor-sixth roots obtained by raising each dim7 tone a half step
 * (raised tone becomes the 5th of the m6 → root is that tone − 7 semitones).
 */
export function m6RootsFromDim7(dimRootPc: number): number[] {
  return dim7Pcs(dimRootPc).map((p) => pcOf(p + 1 - 7))
}
