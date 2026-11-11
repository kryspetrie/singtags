/**
 * Short cents / MIDI history for chord-row sparklines.
 */

export type ToneTrace = {
  /** Newest last; signed cents vs JI (or ET). */
  cents: number[]
  /** Newest last; MIDI float for pitch wiggle. */
  midi: number[]
  cap: number
}

export function createToneTrace(cap = 48): ToneTrace {
  return { cents: [], midi: [], cap: Math.max(8, cap) }
}

export function pushToneTrace(trace: ToneTrace, cents: number, midi: number): void {
  if (!Number.isFinite(cents) || !Number.isFinite(midi)) return
  trace.cents.push(cents)
  trace.midi.push(midi)
  while (trace.cents.length > trace.cap) {
    trace.cents.shift()
    trace.midi.shift()
  }
}

export function clearToneTrace(trace: ToneTrace): void {
  trace.cents.length = 0
  trace.midi.length = 0
}
