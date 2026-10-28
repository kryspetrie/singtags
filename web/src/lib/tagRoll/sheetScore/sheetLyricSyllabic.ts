/**
 * Lyric syllabic roles and melisma extenders from Tag Studio syllable text.
 *
 * Conventions (common in the roll editor):
 * - trailing `-` → syllable continues (begin / middle)
 * - `_` / `—` / `~` alone → extender only (no new text)
 * - otherwise → single or end (end if previous was open)
 */

export type LyricSyllabic = 'single' | 'begin' | 'middle' | 'end' | 'extend'

export type ParsedLyricSyllable = {
  /** Display text (hyphen stripped; empty for pure extenders). */
  text: string
  syllabic: LyricSyllabic
  /** Draw a melisma / extender line after this syllable. */
  extendAfter: boolean
}

/** True when the raw lyric is only an extender token. */
export function isLyricExtenderToken(raw: string): boolean {
  const t = raw.trim()
  return t === '_' || t === '__' || t === '—' || t === '–' || t === '~' || t === '~~'
}

/**
 * Parse one onset's lyric in sequence context.
 * @param prevOpen - previous syllable left a hyphenated word open
 */
export function parseLyricSyllable(
  raw: string | undefined | null,
  prevOpen: boolean,
): ParsedLyricSyllable | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (isLyricExtenderToken(trimmed)) {
    return { text: '', syllabic: 'extend', extendAfter: true }
  }
  const continues = /[-–—]$/.test(trimmed)
  const text = continues ? trimmed.replace(/[-–—]+$/, '').trim() : trimmed
  if (!text && continues) {
    return { text: '', syllabic: 'extend', extendAfter: true }
  }
  if (continues) {
    return {
      text,
      syllabic: prevOpen ? 'middle' : 'begin',
      extendAfter: true,
    }
  }
  if (prevOpen) {
    return { text, syllabic: 'end', extendAfter: false }
  }
  return { text, syllabic: 'single', extendAfter: false }
}

/** MusicXML `<syllabic>` value; omit for pure extend. */
export function musicXmlSyllabicName(s: LyricSyllabic): string | null {
  if (s === 'extend') return null
  return s
}
