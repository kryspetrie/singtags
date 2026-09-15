/**
 * CSV import for Sing Together repertoire rows.
 */
import { parseVoicing } from './normalize'
import {
  clampConfidence,
  newSongId,
  partsForVoicing,
  type Confidence,
  type RepertoireSong,
  type Voicing,
} from './types'

export type CsvImportResult = {
  songs: RepertoireSong[]
  skipped: number
  errors: string[]
}

/** Canonical header order for repertoire CSV import / template download. */
export const REPERTOIRE_CSV_COLUMNS = [
  'title',
  'arranger',
  'key',
  'voicing',
  'parts',
  'confidence',
] as const

/** Filename for {@link repertoireCsvTemplateText}. */
export const REPERTOIRE_CSV_TEMPLATE_FILENAME = 'sing-together-repertoire-template.csv'

/**
 * Sample CSV with header + one filled TTBB song (Heart of My Heart).
 * Arranger is quoted because it contains a comma. Confidence is per-part.
 */
export function repertoireCsvTemplateText(): string {
  const header = REPERTOIRE_CSV_COLUMNS.join(',')
  const row = [
    'Heart of My Heart',
    '"SPEBSQSA, Inc"',
    '',
    'TTBB',
    'tenor;lead;bari;bass',
    '"tenor:5;lead:5;bari:5;bass:5"',
  ].join(',')
  return `${header}\n${row}\n`
}

const PART_ALIASES: Record<string, string> = {
  t: 'tenor',
  tenor: 'tenor',
  l: 'lead',
  lead: 'lead',
  br: 'bari',
  bari: 'bari',
  baritone: 'bari',
  b: 'bass',
  bs: 'bass',
  bass: 'bass',
  s: 'soprano',
  sop: 'soprano',
  soprano: 'soprano',
  a: 'alto',
  alto: 'alto',
  s1: 's1',
  sop1: 's1',
  'soprano 1': 's1',
  s2: 's2',
  sop2: 's2',
  'soprano 2': 's2',
  a1: 'a1',
  alto1: 'a1',
  'alto 1': 'a1',
  a2: 'a2',
  alto2: 'a2',
  'alto 2': 'a2',
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells.map((c) => c.trim())
}

function headerIndex(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  headers.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/\s+/g, '_')
    map[key] = i
    if (key === 'song' || key === 'name') map.title = i
    if (key === 'arrange' || key === 'arr') map.arranger = i
    if (key === 'type' || key === 'range' || key === 'voice') map.voicing = i
    if (key === 'part' || key === 'voices') map.parts = i
    if (key === 'conf' || key === 'rating' || key === 'confidence') map.confidence = i
  })
  return map
}

function resolvePartId(raw: string, voicing: Voicing): string | null {
  const key = raw.trim().toLowerCase()
  if (!key) return null
  const aliased = PART_ALIASES[key] ?? key
  const allowed = partsForVoicing(voicing)
  if (allowed.includes(aliased)) return aliased
  // TTBB "t" already maps to tenor; SATB "t" should be tenor too
  if (voicing === 'SATB' && (key === 't' || key === 'ten')) return 'tenor'
  if (voicing === 'SATB' && (key === 'b' || key === 'bas')) return 'bass'
  return allowed.includes(key) ? key : null
}

function parsePartsField(
  partsRaw: string,
  confRaw: string,
  voicing: Voicing,
): Record<string, Confidence> {
  const parts: Record<string, Confidence> = {}
  const confTrim = confRaw.trim()
  const perPart = confTrim.includes(':')
  if (perPart) {
    for (const chunk of confTrim.split(/[;|]/)) {
      const [p, c] = chunk.split(':').map((s) => s.trim())
      if (!p) continue
      const id = resolvePartId(p, voicing)
      if (!id) continue
      parts[id] = clampConfidence(Number(c))
    }
  }
  const partTokens = partsRaw
    .split(/[;|,/\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const defaultConf = perPart ? 0 : clampConfidence(confTrim === '' ? 0 : Number(confTrim))
  for (const tok of partTokens) {
    if (tok.includes(':')) {
      const [p, c] = tok.split(':').map((s) => s.trim())
      if (!p) continue
      const id = resolvePartId(p, voicing)
      if (!id) continue
      parts[id] = clampConfidence(Number(c))
      continue
    }
    const id = resolvePartId(tok, voicing)
    if (!id) continue
    if (parts[id] == null) parts[id] = defaultConf
  }
  return parts
}

/** Parse CSV text into repertoire songs. */
export function parseRepertoireCsv(text: string): CsvImportResult {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
  if (!lines.length) return { songs: [], skipped: 0, errors: ['Empty CSV'] }

  const headerCells = splitCsvLine(lines[0]!)
  const looksLikeHeader = headerCells.some((c) => /title|arranger|song|voicing|parts/i.test(c))
  let start = 0
  let idx: Record<string, number>
  if (looksLikeHeader) {
    idx = headerIndex(headerCells)
    start = 1
  } else {
    idx = { title: 0, arranger: 1, key: 2, voicing: 3, parts: 4, confidence: 5 }
  }

  const songs: RepertoireSong[] = []
  let skipped = 0
  const errors: string[] = []

  for (let row = start; row < lines.length; row++) {
    const cells = splitCsvLine(lines[row]!)
    const get = (name: string) => {
      const i = idx[name]
      return i == null ? '' : (cells[i] ?? '').trim()
    }
    const title = get('title')
    if (!title) {
      skipped++
      errors.push(`Row ${row + 1}: missing title`)
      continue
    }
    const arranger = get('arranger')
    const key = get('key') || undefined
    const voicingRaw = get('voicing')
    const voicing = voicingRaw ? parseVoicing(voicingRaw) : undefined
    const parts = parsePartsField(get('parts'), get('confidence'), voicing ?? 'TTBB')
    if (!Object.keys(parts).length) {
      skipped++
      errors.push(`Row ${row + 1}: no valid parts`)
      continue
    }
    songs.push({
      id: newSongId(),
      title,
      arranger,
      key,
      voicing,
      parts,
    })
  }

  return { songs, skipped, errors: errors.slice(0, 12) }
}
