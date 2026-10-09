/** Collapsed chord-sequence gold from polecat pitch extracts (timing ignored). */

export type ChordRole = 'pillar' | 'passing' | 'mid'

export type GoldChordToken = {
  roman: string
  rootPc: number
  natureId: string
  dur: number
  role: ChordRole
  leadMidi: number | null
  confidence?: number
  medianDur?: number
}

export type PolecatGoldSequence = {
  tagId: number
  title?: string
  tonality: number
  mode: string
  bpm?: number
  sourceMethod?: string
  stackCountRaw?: number
  tokenCount: number
  pillarCount: number
  pillarRomans: string[]
  tokens: GoldChordToken[]
}

export type SequenceScore = {
  tagId: number
  title?: string
  pillarLcs: number
  pillarGoldLen: number
  /** Highway-key LCS (ninth≡seventh, I triad≡I7, …) — primary gate. */
  pillarNorm: number
  /** Exact natureId@rootPc LCS (no highway softening) — honesty metric. */
  strictPillarNorm: number
  natureMatch: number
  natureAligned: number
  softFullNorm: number
  predPillars: string[]
  goldPillars: string[]
  predAll: string[]
  goldAll: string[]
}
