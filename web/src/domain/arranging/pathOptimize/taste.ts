/**
 * Path Optimize taste profiles — gold-safe presets over risk/cadence + candidate gates.
 *
 * Classic: readable Basic highway (default Coach).
 * Circle: freer mid-phrase sec-dom / strong cadence seeds.
 * Busy: more passing color; still closed Basic-ish allowlist until risk rises.
 */
export type PathOptimizeTaste = 'classic' | 'circle' | 'busy'

export type PathOptimizeTastePreset = {
  id: PathOptimizeTaste
  label: string
  title: string
  risk: number
  cadenceBias: 'off' | 'moderate' | 'strong'
}

export const PATH_OPTIMIZE_TASTE_PRESETS: readonly PathOptimizeTastePreset[] = [
  {
    id: 'classic',
    label: 'Classic',
    title:
      'Readable Basic highway: stay on pillars mid-phrase, I6 when Lead is 6, chromatic Mm7 approaches.',
    risk: 0,
    cadenceBias: 'moderate',
  },
  {
    id: 'circle',
    label: 'Circle',
    title:
      'Circle-of-fifths lean: allow mid-phrase II7/VI7 approaches and stronger cadence seeds.',
    risk: 0.15,
    cadenceBias: 'strong',
  },
  {
    id: 'busy',
    label: 'Busy',
    title:
      'Busier passing color between pillars; still closed voicings until you raise Adventure.',
    risk: 0.35,
    cadenceBias: 'moderate',
  },
] as const

export function clampTaste(raw: unknown): PathOptimizeTaste {
  if (raw === 'circle' || raw === 'busy' || raw === 'classic') return raw
  return 'classic'
}

export function tastePreset(id: PathOptimizeTaste): PathOptimizeTastePreset {
  return PATH_OPTIMIZE_TASTE_PRESETS.find((p) => p.id === id) ?? PATH_OPTIMIZE_TASTE_PRESETS[0]!
}
