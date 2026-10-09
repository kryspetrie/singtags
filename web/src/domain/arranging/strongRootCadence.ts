/**
 * Strong-home sequence decode: emission (Lead + preferred) + transitions.
 * Exact Viterbi over diatonic homes (replaces width-3 beam).
 */
import { STRONG_ROOT_TRANSITIONS } from './strongRootTransitions.generated'

const HOMES = [0, 2, 5, 7, 9] as const

export type CadenceNote = {
  scaleDegree: number
  preferredDeg: number
  phraseEdge: 'start' | 'end' | null
}

export function leadFitsHome(sd: number, homeDeg: number): boolean {
  const rel = (((sd - homeDeg) % 12) + 12) % 12
  return rel === 0 || rel === 4 || rel === 7 || rel === 10 || rel === 3 || rel === 9
}

function empiricalTransition(prev: number, cur: number): number {
  const w = STRONG_ROOT_TRANSITIONS[`${prev}->${cur}`]
  if (w == null) return 0
  return w * 25
}

export function transitionScore(
  prev: number | null,
  cur: number,
  edge: 'start' | 'end' | null,
): number {
  if (prev == null) {
    if (edge === 'start') {
      if (cur === 7 || cur === 0) return 3
      return 1
    }
    return 1
  }
  let s = empiricalTransition(prev, cur)
  if (prev === 0 && cur === 5) s += 2
  if (prev === 0 && cur === 7) s += 1.5
  if (prev === 0 && cur === 9) s += 1.5
  if (prev === 5 && cur === 7) s += 2
  if (prev === 5 && cur === 0) s += 1.5
  if (prev === 7 && cur === 0) s += 3
  if (prev === 2 && cur === 7) s += 3
  if (prev === 9 && cur === 2) s += 2
  if (prev === 9 && cur === 7) s += 1.5
  if (prev === cur) s += 1.5
  if (cur === 4 || cur === 11 || cur === 1 || cur === 6 || cur === 8 || cur === 3) s -= 3
  return s
}

/** Per-note emission used inside Viterbi (preferred is prior, not hard lock). */
export function emissionScore(n: CadenceNote, cur: number, index: number): number {
  let s = 0
  if (cur === n.preferredDeg) s += 2.5
  if (leadFitsHome(n.scaleDegree, cur)) s += 1.5
  else s -= 2
  if (n.phraseEdge === 'end' && cur === 0) s += 2
  if (n.phraseEdge === 'start' && index === 0 && (cur === 7 || cur === 0)) s += 1.5
  if (n.phraseEdge == null && cur === 4) s -= 4
  return s
}

export function pathScore(notes: readonly CadenceNote[], degs: readonly number[]): number {
  let s = 0
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!
    const cur = degs[i]!
    const prev = i > 0 ? degs[i - 1]! : null
    s += emissionScore(n, cur, i)
    s += transitionScore(prev, cur, n.phraseEdge)
    if (n.phraseEdge === 'end' && prev === 7 && cur === 0) s += 2.5
  }
  return s
}

/**
 * Exact Viterbi over HOMES for a Strong chain.
 */
export function decodeStrongHomesViterbi(notes: readonly CadenceNote[]): number[] {
  if (!notes.length) return []
  const n = notes.length
  const states = HOMES.length
  const best: number[][] = Array.from({ length: n }, () => Array(states).fill(-Infinity))
  const back: number[][] = Array.from({ length: n }, () => Array(states).fill(-1))

  for (let s = 0; s < states; s++) {
    const cur = HOMES[s]!
    best[0]![s] =
      emissionScore(notes[0]!, cur, 0) + transitionScore(null, cur, notes[0]!.phraseEdge)
  }

  for (let i = 1; i < n; i++) {
    const note = notes[i]!
    for (let s = 0; s < states; s++) {
      const cur = HOMES[s]!
      const emit = emissionScore(note, cur, i)
      for (let p = 0; p < states; p++) {
        const prev = HOMES[p]!
        let sc = best[i - 1]![p]! + emit + transitionScore(prev, cur, note.phraseEdge)
        if (note.phraseEdge === 'end' && prev === 7 && cur === 0) sc += 2.5
        if (sc > best[i]![s]!) {
          best[i]![s] = sc
          back[i]![s] = p
        }
      }
    }
  }

  let endState = 0
  let endScore = -Infinity
  for (let s = 0; s < states; s++) {
    if (best[n - 1]![s]! > endScore) {
      endScore = best[n - 1]![s]!
      endState = s
    }
  }
  const out = Array(n).fill(0) as number[]
  let s = endState
  for (let i = n - 1; i >= 0; i--) {
    out[i] = HOMES[s]!
    if (i === 0) break
    s = back[i]![s]!
    if (s < 0) s = 0
  }
  return out
}

/** Alias — exact Viterbi (formerly width-3 beam). */
export function rerankStrongHomesCadence(notes: readonly CadenceNote[]): number[] {
  return decodeStrongHomesViterbi(notes)
}
