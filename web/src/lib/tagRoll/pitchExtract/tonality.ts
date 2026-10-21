/** Parse catalog key / writ_key → root PC + mode. */

const NAME_TO_PC: Record<string, number> = {
  c: 0,
  'b#': 0,
  db: 1,
  'c#': 1,
  d: 2,
  eb: 3,
  'd#': 3,
  e: 4,
  fb: 4,
  f: 5,
  'e#': 5,
  gb: 6,
  'f#': 6,
  g: 7,
  ab: 8,
  'g#': 8,
  a: 9,
  bb: 10,
  'a#': 10,
  b: 11,
  cb: 11,
}

export function parseTonalityFromKey(
  writKey: string | null | undefined,
  key: string | null | undefined,
): { tonality: number; mode: 'major' | 'minor'; preferFlats: boolean } {
  const raw = (writKey || key || '').trim()
  let mode: 'major' | 'minor' = 'major'
  let name = raw
  if (raw.includes(':')) {
    const [modeS, rest] = raw.split(':', 2)
    mode = /min/i.test(modeS || '') ? 'minor' : 'major'
    name = (rest || '').trim()
  } else if (/min/i.test(raw)) {
    mode = 'minor'
    name = raw.replace(/minor/i, '').trim().split(/\s+/)[0] || raw
  } else {
    name = raw.replace(/major/i, '').trim().split(/\s+/)[0] || raw
  }
  const norm = name.toLowerCase().replace(/\s+/g, '').replace('♭', 'b').replace('♯', '#')
  for (const tok of [norm, norm.slice(0, 2), norm.slice(0, 1)]) {
    if (tok in NAME_TO_PC) {
      const tonality = NAME_TO_PC[tok]!
      const preferFlats = [1, 3, 5, 8, 10].includes(tonality)
      return { tonality, mode, preferFlats }
    }
  }
  return { tonality: 0, mode: 'major', preferFlats: false }
}
