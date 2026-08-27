/** Common learning-track part ids on barbershoptags.com. Tags may include extra parts. */

export const COMMON_AUDIO_PARTS = ['mix', 'lead', 'tenor', 'bari', 'bass'] as const

export type CommonAudioPart = (typeof COMMON_AUDIO_PARTS)[number]

export const AUDIO_PART_LABELS: Record<string, string> = {
  mix: 'Mix',
  lead: 'Lead',
  tenor: 'Tenor',
  bari: 'Baritone',
  bass: 'Bass',
}

export type LibraryAudioPartsMode = 'all' | 'mix' | 'custom'

export function partLabel(part: string): string {
  return AUDIO_PART_LABELS[part] ?? part
}

/**
 * Extract part name from media paths, including tier suffixes:
 * `lead.m4a`, `lead.playback.opus`, `lead.solo.opus`, `mix.ultra_mix.opus`.
 */
export function partFromMediaPath(path: string): string | null {
  const file = path.split('/').pop()?.replace(/\?.*$/, '')
  if (!file) return null
  const stem = file.replace(/\.(m4a|mp3|ogg|opus|webm|wav|aac)$/i, '')
  if (!stem) return null
  const part = stem.replace(
    /\.(playback|solo|downmix|ultra_mix|ultra_solo|ultra_downmix|ultra_stereo|ultra)$/i,
    '',
  )
  return part ? part.toLowerCase() : null
}

export function pathMatchesParts(
  path: string,
  mode: LibraryAudioPartsMode,
  customParts: string[],
): boolean {
  if (mode === 'all') return true
  const part = partFromMediaPath(path)
  if (!part) return true
  if (mode === 'mix') return part === 'mix'
  const wanted = new Set(customParts.map((p) => p.toLowerCase()))
  return wanted.has(part)
}

export function normalizeCustomParts(parts: string[]): string[] {
  const out = new Set<string>()
  for (const p of parts) {
    const k = p.trim().toLowerCase()
    if (k) out.add(k)
  }
  return [...out]
}
