/**
 * Segment per-part MIDI series into TTBB stacks + nature guesses.
 */
import { PITCH_EXTRACT_HOP, PITCH_EXTRACT_SR } from './yin'

export type VoicePart = 'lead' | 'tenor' | 'bari' | 'bass'
export const VOICE_PARTS: readonly VoicePart[] = ['lead', 'tenor', 'bari', 'bass']

export type PitchStack = {
  t0: number
  t1: number
  midi: Partial<Record<VoicePart, number>>
  natureId: string
  rootPc: number
  confidence: number
  pcs: number[]
}

const PART_HOME: Record<VoicePart, [number, number]> = {
  bass: [36, 55],
  bari: [45, 62],
  lead: [50, 67],
  tenor: [55, 74],
}

const NATURES: { id: string; offs: number[] }[] = [
  { id: 'ninth', offs: [0, 2, 4, 7, 10] },
  { id: 'seventh', offs: [0, 4, 7, 10] },
  { id: 'm7', offs: [0, 3, 7, 10] },
  { id: 'major', offs: [0, 4, 7] },
  { id: 'minor', offs: [0, 3, 7] },
  { id: 'sixth', offs: [0, 4, 7, 9] },
  { id: 'madd6', offs: [0, 3, 7, 9] },
  { id: 'dim7', offs: [0, 3, 6, 9] },
  { id: 'halfdim', offs: [0, 3, 6, 10] },
  { id: 'aug', offs: [0, 4, 8] },
]

function pc(m: number): number {
  return ((m % 12) + 12) % 12
}

function preferOctave(midi: number, part: VoicePart, leadMidi: number | null): number {
  const [lo, hi] = PART_HOME[part]
  let best = midi
  let bestScore = 1e9
  for (let k = -3; k <= 3; k++) {
    const c = midi + 12 * k
    if (c < 28 || c > 84) continue
    let score = 0
    if (c < lo) score += lo - c
    else if (c > hi) score += c - hi
    if (leadMidi != null) {
      if (part === 'tenor' && c < leadMidi) score += (leadMidi - c) * 1.5
      if (part === 'bass' && c > leadMidi) score += (c - leadMidi) * 1.2
      if (part === 'bari' && Math.abs(c - leadMidi) > 12) score += 2
    }
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

function correctOctaves(stack: Partial<Record<VoicePart, number>>): Partial<Record<VoicePart, number>> {
  const lead = stack.lead
  if (lead == null) return { ...stack }
  const out: Partial<Record<VoicePart, number>> = {
    lead: preferOctave(lead, 'lead', null),
  }
  const L = out.lead!
  for (const part of ['bass', 'bari', 'tenor'] as const) {
    if (stack[part] != null) out[part] = preferOctave(stack[part]!, part, L)
  }
  if (out.tenor != null && out.tenor < L && out.tenor + 12 <= 84) out.tenor += 12
  return out
}

function guessNature(
  midi: Partial<Record<VoicePart, number>>,
  tonality: number,
): { natureId: string; rootPc: number; confidence: number; pcs: number[] } {
  const pcs = [...new Set(Object.values(midi).map((m) => pc(m!)))].sort((a, b) => a - b)
  if (!pcs.length) return { natureId: 'unknown', rootPc: tonality, confidence: 0, pcs }
  let best: { score: number; natureId: string; rootPc: number; missing: number } | null = null
  for (const { id, offs } of NATURES) {
    for (let root = 0; root < 12; root++) {
      const tones = new Set(offs.map((o) => (root + o) % 12))
      if (!pcs.every((p) => tones.has(p))) continue
      let missing = 0
      for (const t of tones) if (!pcs.includes(t)) missing++
      let score = pcs.length / Math.max(1, tones.size) - 0.08 * missing
      if (root === tonality) score += 0.12
      if (root === (tonality + 7) % 12) score += 0.06
      if (pcs.length >= 4 && (id === 'seventh' || id === 'm7' || id === 'ninth')) score += 0.08
      if (pcs.length === 3 && (id === 'major' || id === 'minor')) score += 0.05
      if (!best || score > best.score) best = { score, natureId: id, rootPc: root, missing }
    }
  }
  if (!best) {
    return { natureId: 'unknown', rootPc: pc(midi.lead ?? tonality), confidence: 0, pcs }
  }
  return {
    natureId: best.natureId,
    rootPc: best.rootPc,
    confidence: Math.max(0, Math.min(1, best.score)),
    pcs,
  }
}

export type PartSeries = Record<VoicePart, Int16Array>

/**
 * Segment simultaneous voiced frames into pitch stacks.
 * Requires Lead + at least `minVoices` parts.
 */
export function segmentPitchStacks(
  series: PartSeries,
  tonality: number,
  opts?: { minHoldS?: number; minVoices?: number },
): PitchStack[] {
  const hopS = PITCH_EXTRACT_HOP / PITCH_EXTRACT_SR
  const minHoldS = opts?.minHoldS ?? 0.18
  const minVoices = opts?.minVoices ?? 3
  const minFrames = Math.max(2, Math.floor(minHoldS / hopS))
  const n = Math.min(...VOICE_PARTS.map((p) => series[p].length))
  const events: PitchStack[] = []

  const frameStack = (i: number): Partial<Record<VoicePart, number>> | null => {
    const raw: Partial<Record<VoicePart, number>> = {}
    for (const p of VOICE_PARTS) {
      const v = series[p][i]!
      if (v >= 0) raw[p] = v
    }
    if (raw.lead == null || Object.keys(raw).length < minVoices) return null
    return raw
  }

  const same = (
    a: Partial<Record<VoicePart, number>>,
    b: Partial<Record<VoicePart, number>>,
  ): boolean => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<VoicePart>
    if (keys.size < minVoices) return false
    for (const p of keys) {
      if (a[p] == null || b[p] == null || a[p] !== b[p]) return false
    }
    return true
  }

  let i = 0
  while (i < n) {
    const raw0 = frameStack(i)
    if (!raw0) {
      i++
      continue
    }
    let j = i + 1
    while (j < n) {
      const rawj = frameStack(j)
      if (!rawj || !same(raw0, rawj)) break
      j++
    }
    if (j - i >= minFrames) {
      const filled = { ...raw0 }
      for (const p of VOICE_PARTS) {
        if (filled[p] != null) continue
        for (let k = i; k < j; k++) {
          const v = series[p][k]!
          if (v >= 0) {
            filled[p] = v
            break
          }
        }
      }
      if (filled.lead == null || Object.keys(filled).length < minVoices) {
        i = Math.max(j, i + 1)
        continue
      }
      const midi = correctOctaves(filled)
      const g = guessNature(midi, tonality)
      events.push({
        t0: Math.round(i * hopS * 1000) / 1000,
        t1: Math.round(j * hopS * 1000) / 1000,
        midi,
        natureId: g.natureId,
        rootPc: g.rootPc,
        confidence: g.confidence,
        pcs: g.pcs,
      })
    }
    i = Math.max(j, i + 1)
  }

  return mergeSameHarmony(events)
}

function mergeSameHarmony(events: PitchStack[], gapS = 0.12): PitchStack[] {
  if (!events.length) return events
  const out: PitchStack[] = [events[0]!]
  for (let i = 1; i < events.length; i++) {
    const ev = events[i]!
    const prev = out[out.length - 1]!
    const same =
      prev.natureId === ev.natureId &&
      prev.rootPc === ev.rootPc &&
      prev.pcs.join() === ev.pcs.join() &&
      ev.t0 - prev.t1 <= gapS
    if (same) {
      out[out.length - 1] = {
        ...prev,
        t1: ev.t1,
        midi: ev.midi,
        confidence: Math.max(prev.confidence, ev.confidence),
      }
    } else out.push(ev)
  }
  return out.filter((e) => e.t1 - e.t0 >= 0.15)
}
