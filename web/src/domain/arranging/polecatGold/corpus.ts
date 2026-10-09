/**
 * Polecat sequence corpus: Tag Studio gold (CI gate) + holdout (advisory).
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const FIX_DIR = resolve(__dirname, 'fixtures')
const INDEX_PATH = resolve(FIX_DIR, 'index.json')

export type CorpusRole = 'gold' | 'holdout'

export type CorpusIndexEntry = {
  tagId: number
  role: CorpusRole
  file: string
  title?: string
  pillars: number
  tokens: number
  pillarRomans: string[]
}

export type CorpusIndex = {
  gold: number[]
  holdout: number[]
  fixtures: CorpusIndexEntry[]
}

/** Fallback if index.json is missing (pre-expansion). */
export const DEFAULT_GOLD_IDS = [90001, 90003, 90006, 90009] as const

export function loadCorpusIndex(): CorpusIndex {
  if (!existsSync(INDEX_PATH)) {
    return {
      gold: [...DEFAULT_GOLD_IDS],
      holdout: [],
      fixtures: DEFAULT_GOLD_IDS.map((tagId) => ({
        tagId,
        role: 'gold' as const,
        file: `${tagId}.json`,
        pillars: 0,
        tokens: 0,
        pillarRomans: [],
      })),
    }
  }
  const raw = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as CorpusIndex
  // Older index.json lacked role/holdout — infer.
  if (!raw.holdout) raw.holdout = []
  if (!raw.gold?.length) raw.gold = [...DEFAULT_GOLD_IDS]
  for (const f of raw.fixtures ?? []) {
    if (!f.role) {
      f.role = raw.gold.includes(f.tagId) ? 'gold' : 'holdout'
    }
  }
  return raw
}

export function corpusIds(role?: CorpusRole): number[] {
  const idx = loadCorpusIndex()
  if (role === 'gold') return idx.gold
  if (role === 'holdout') return idx.holdout
  return [...idx.gold, ...idx.holdout]
}
