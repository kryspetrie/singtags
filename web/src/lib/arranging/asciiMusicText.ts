/**
 * Normalize fancy music / UI punctuation for fonts that only ship Latin glyphs
 * (IBM Plex latin subset + Linux system fallbacks often miss arrows, flats, diamonds).
 */
export function asciiMusicText(s: string): string {
  return s
    .replace(/\u2192|\u2794|\u279C/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u2197|\u2924/g, '')
    .replace(/\u266D/g, 'b')
    .replace(/\u266F/g, '#')
    .replace(/\u2014|\u2013/g, ' - ')
    .replace(/\u2026/g, '...')
    .replace(/\u00B7|\u2022/g, ' | ')
    .replace(/\u25C6|\u25C7/g, '*')
    .replace(/\u2713|\u2714/g, 'OK')
    .replace(/\u2699/g, '')
    .replace(/\u21C4/g, '<->')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
