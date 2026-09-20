/**
 * Len-button note glyphs — light stroke notation (not filled icon blobs).
 * viewBox "0 0 14 22"; flags are thin hooked strokes like engraved ♪.
 */
export type DurationGlyphId =
  | 'whole'
  | 'half'
  | 'quarter'
  | 'eighth'
  | 'sixteenth'
  | 'thirty-second'

const SW = '0.75'

const HEAD_HOLLOW =
  `<ellipse cx="5" cy="16.5" rx="2.7" ry="1.95" transform="rotate(-32 5 16.5)" fill="none" stroke="currentColor" stroke-width="${SW}"/>`
const HEAD_FILL =
  `<ellipse cx="5" cy="16.5" rx="2.7" ry="1.95" transform="rotate(-32 5 16.5)" fill="currentColor"/>`
const STEM =
  `<path d="M7.5 16.25 V2.4" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>`

/**
 * Hooked flag: out from the stem tip, then curl under — open stroke, not a wedge.
 * tip y offsets: 2.4 / 5.35 / 8.3
 */
function flagAt(tipY: number): string {
  const mid = tipY + 3.1
  const end = tipY + 5.4
  return (
    `<path d="M7.5 ${tipY} C11.6 ${tipY + 0.35} 12.35 ${tipY + 3.4} 10.15 ${mid} ` +
    `C9.15 ${mid + 0.85} 8.15 ${end - 0.35} 7.85 ${end}" ` +
    `fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round"/>`
  )
}

export const DURATION_GLYPH_VIEWBOX = '0 0 14 22'

export const DURATION_GLYPH_SVG: Record<DurationGlyphId, string> = {
  whole:
    `<ellipse cx="7" cy="11" rx="3.45" ry="2.2" transform="rotate(-32 7 11)" fill="none" stroke="currentColor" stroke-width="${SW}"/>`,
  half: `${HEAD_HOLLOW}${STEM}`,
  quarter: `${HEAD_FILL}${STEM}`,
  eighth: `${HEAD_FILL}${STEM}${flagAt(2.4)}`,
  sixteenth: `${HEAD_FILL}${STEM}${flagAt(2.4)}${flagAt(5.35)}`,
  'thirty-second': `${HEAD_FILL}${STEM}${flagAt(2.4)}${flagAt(5.35)}${flagAt(8.3)}`,
}
