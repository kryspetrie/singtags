/** Default voice part ids and library download filter helpers. */

export const COMMON_AUDIO_PARTS = ['mix', 'lead', 'tenor', 'bari', 'bass'] as const

/** Subset of {@link COMMON_AUDIO_PARTS} as a union type. */
export type CommonAudioPart = (typeof COMMON_AUDIO_PARTS)[number]

/** UI labels for standard learning-track part ids. */
export const AUDIO_PART_LABELS: Record<string, string> = {
  mix: 'Mix',
  lead: 'Lead',
  tenor: 'Tenor',
  bari: 'Baritone',
  bass: 'Bass',
}

/** Which voice parts to include when downloading the full library audio pack. */
export type LibraryAudioPartsMode = 'all' | 'mix' | 'custom'

/** Human-readable label for a part id (falls back to the raw id). */
export function partLabel(part: string): string {
  return AUDIO_PART_LABELS[part] ?? part
}

/**
 * Extract part name from media paths, including tier suffixes:
 * `lead.m4a`, `lead.playback.opus`, `lead.solo.opus`, `mix.ultra_mix.opus`,
 * and library titles like `Song (C) - Arranger - Lead - Solo.opus`.
 */
export function partFromMediaPath(path: string): string | null {
  let file = path.split('/').pop()?.replace(/\?.*$/, '') || ''
  try {
    file = decodeURIComponent(file)
  } catch {
    /* keep raw */
  }
  if (!file) return null
  let stem = file.replace(/\.(m4a|mp3|ogg|opus|webm|wav|aac)$/i, '')
  if (!stem) return null
  stem = stem.replace(
    /\.(playback|solo|downmix|ultra_mix|ultra_solo|ultra_downmix|ultra_stereo|ultra)$/i,
    '',
  )
  stem = stem.replace(/\s*-\s*(playback|solo|downmix|ultra\s*mix|ultra)\s*$/i, '')
  const lower = stem.toLowerCase()
  if ((COMMON_AUDIO_PARTS as readonly string[]).includes(lower)) return lower
  const m = stem.match(/\b(mix|lead|tenor|bari|bass|baritone)\b/i)
  if (m) {
    const p = m[1].toLowerCase()
    return p === 'baritone' ? 'bari' : p
  }
  return lower || null
}

/**
 * True when a media path should be downloaded for the current parts mode.
 * Unknown paths pass through (`true`) so new tier filenames are not dropped.
 */
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

/** Dedupe and lowercase custom part ids for set membership checks. */
export function normalizeCustomParts(parts: string[]): string[] {
  const out = new Set<string>()
  for (const p of parts) {
    const k = p.trim().toLowerCase()
    if (k) out.add(k)
  }
  return [...out]
}
