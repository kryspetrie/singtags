/**
 * Shared fine-detune / pay-the-key cents composition for Tag, My Library, and Sing Together.
 */

/** Absolute cents for a held tonic: semitone shift + fine detune. */
export function composePayKeyCents(opts: {
  shiftSemitones?: number
  fineCents?: number
}): number {
  return (opts.shiftSemitones ?? 0) * 100 + (opts.fineCents ?? 0)
}

/**
 * Fine detune (absolute cents vs A440) for Mix / pay-the-key.
 * Session/query detune wins when present; otherwise global (+ optional per-entry).
 */
export function resolveFineDetuneCents(opts: {
  queryDetuneCents?: number | null
  globalCents: number
  entryCents?: number
}): number {
  if (opts.queryDetuneCents != null && Number.isFinite(opts.queryDetuneCents)) {
    return opts.queryDetuneCents
  }
  return opts.globalCents + (opts.entryCents ?? 0)
}
