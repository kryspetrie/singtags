/**
 * Piano dock visibility rules for Digital Tuner Detail.
 * Glance always hides piano; short landscape requires pianoPinned.
 */

export type TunerPianoLayoutMode = 'wide' | 'narrow-portrait' | 'narrow-landscape'

export function shouldShowTunerPiano(opts: {
  pianoVisible: boolean
  pianoPinned: boolean
  mode: TunerPianoLayoutMode
  glanceOpen: boolean
}): boolean {
  if (opts.glanceOpen) return false
  if (!opts.pianoVisible) return false
  if (opts.mode === 'narrow-landscape' && !opts.pianoPinned) return false
  return true
}
