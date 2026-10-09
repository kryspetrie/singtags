/**
 * Classical part-writing soft costs (Hawley Ades *Choral Arranging* Ch.1),
 * adapted for TTBB / barbershop Path Optimize + candidate ranking.
 *
 * - Upper-trio close: bari/lead/tenor within an octave (Ades “close voicing”).
 * - Post-leap direction: after a leap > 3rd, prefer change of direction.
 * - Hazardous melodic leaps: ↑A4 / ↓d5 in non-melody parts (aug2 skipped in ET).
 */
import type { VoicingPitches } from './chords'

const HARMONY = ['bass', 'bari', 'tenor'] as const
type HarmonyVoice = (typeof HARMONY)[number]

function pc(m: number): number {
  return ((m % 12) + 12) % 12
}

/** Outer span of bari / lead / tenor (Ades close ≤ 12). */
export function upperTrioSpan(midi: VoicingPitches): number {
  const lo = Math.min(midi.bari, midi.lead, midi.tenor)
  const hi = Math.max(midi.bari, midi.lead, midi.tenor)
  return hi - lo
}

/**
 * Signed bias before weight: +1 close (≤ octave), mild open, demote wide.
 * Separate from bass–tenor outer span (`closedVoicing`).
 */
export function upperTrioCloseBias(midi: VoicingPitches): number {
  const span = upperTrioSpan(midi)
  if (span <= 12) return 1
  if (span <= 16) return 0.15
  if (span <= 21) return -0.45
  return -0.9
}

function targetSoundedElsewhere(
  midi: VoicingPitches,
  voice: HarmonyVoice,
  targetMidi: number,
): boolean {
  const t = pc(targetMidi)
  for (const v of ['bass', 'bari', 'lead', 'tenor'] as const) {
    if (v === voice) continue
    if (pc(midi[v]) === t) return true
  }
  return false
}

export type HazardousLeapOpts = {
  /** Same root+nature as previous stack (position shift within chord). */
  sameChord?: boolean
}

/**
 * Soft penalty for ↑augmented 4th (+6) / ↓diminished 5th (−6) in bass/bari/tenor.
 * Waived when another voice already sounds the arrival PC (Ades same-chord shift).
 * Lead/melody excluded — the tune may demand the leap.
 */
export function hazardousLeapPenalty(
  prev: VoicingPitches | null | undefined,
  next: VoicingPitches,
  opts: HazardousLeapOpts = {},
): number {
  if (!prev) return 0
  let pen = 0
  for (const v of HARMONY) {
    const delta = next[v] - prev[v]
    const tritoneLeap = delta === 6 || delta === -6
    if (!tritoneLeap) continue
    if (opts.sameChord && targetSoundedElsewhere(next, v, next[v])) continue
    if (targetSoundedElsewhere(next, v, next[v])) {
      pen += 0.25
      continue
    }
    pen += 1
  }
  return pen
}

export type PostLeapOpts = {
  sameChord?: boolean
}

/**
 * After a leap larger than a third into `prev`, continuing the same direction
 * into `next` is costly unless the follow-up is a step or a same-chord arpeggio.
 */
export function postLeapDirectionPenalty(
  prevPrev: VoicingPitches | null | undefined,
  prev: VoicingPitches | null | undefined,
  next: VoicingPitches,
  opts: PostLeapOpts = {},
): number {
  if (!prevPrev || !prev) return 0
  let pen = 0
  for (const v of HARMONY) {
    const leapIn = prev[v] - prevPrev[v]
    const leapOut = next[v] - prev[v]
    if (Math.abs(leapIn) <= 3) continue
    if (leapOut === 0) continue
    if (Math.sign(leapIn) !== Math.sign(leapOut)) continue
    // Ades: may continue if the following motion is diatonic (step).
    if (Math.abs(leapOut) === 1) continue
    // Ades: may continue within the same chord.
    if (opts.sameChord) continue
    // Wider continuation in the same direction — scale by how stubborn it is.
    pen += 0.55 + Math.min(4, Math.abs(leapOut) - 1) * 0.2
  }
  return pen
}

/** Mean upper-trio openness cost across stacks (higher = worse). */
export function pathUpperTrioOpenCost(seq: readonly VoicingPitches[]): number {
  if (!seq.length) return 0
  let sum = 0
  for (const m of seq) {
    const b = upperTrioCloseBias(m)
    sum += b >= 0 ? 0 : -b
  }
  return sum / seq.length
}

/** Mean hazardous-leap penalty across consecutive stacks. */
export function pathHazardousLeapCost(
  seq: readonly VoicingPitches[],
  sameChordAt?: (i: number) => boolean,
): number {
  if (seq.length < 2) return 0
  let sum = 0
  for (let i = 1; i < seq.length; i++) {
    sum += hazardousLeapPenalty(seq[i - 1], seq[i]!, {
      sameChord: sameChordAt?.(i) ?? false,
    })
  }
  return sum / (seq.length - 1)
}

/** Mean post-leap direction penalty across the path. */
export function pathPostLeapDirectionCost(
  seq: readonly VoicingPitches[],
  sameChordAt?: (i: number) => boolean,
): number {
  if (seq.length < 3) return 0
  let sum = 0
  let n = 0
  for (let i = 2; i < seq.length; i++) {
    sum += postLeapDirectionPenalty(seq[i - 2], seq[i - 1], seq[i]!, {
      sameChord: sameChordAt?.(i) ?? false,
    })
    n++
  }
  return n ? sum / n : 0
}
