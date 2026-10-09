/**
 * Classic Tags sequence corpus (catalog collection `classic`).
 * All tags are advisory until explicitly promoted to gold.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const FIX_DIR = resolve(__dirname, 'fixtures')
const INDEX_PATH = resolve(FIX_DIR, 'index.json')

export type ClassicFixtureEntry = {
  tagId: number
  classic?: string | number
  role: 'corpus' | 'gold' | 'holdout'
  file: string
  title?: string
  pillars: number
  tokens: number
  pillarRomans: string[]
}

export type ClassicCorpusIndex = {
  collection: string
  corpus: number[]
  gold: number[]
  holdout: number[]
  fixtures: ClassicFixtureEntry[]
  skipped?: { tagId: number; reason: string }[]
}

export function loadClassicIndex(): ClassicCorpusIndex {
  if (!existsSync(INDEX_PATH)) {
    return {
      collection: 'classic',
      corpus: [],
      gold: [],
      holdout: [],
      fixtures: [],
    }
  }
  return JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as ClassicCorpusIndex
}

export function classicCorpusIds(): number[] {
  const idx = loadClassicIndex()
  return idx.corpus.length ? idx.corpus : idx.holdout
}
