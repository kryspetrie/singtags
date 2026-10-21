/**
 * Locked per-onset chord gold for MusicXML mixed polecat seeds.
 * Seeds own TTBB notes; this file owns verified chord labels.
 */
import type { ContestProfile } from '../contestProfile'
import type { TonalityMode } from '../types'

export const MIXED_CHART_GOLD_SCHEMA = 'mixedChartGold.v1' as const

export type MixedOnsetRole = 'pillar' | 'passing' | 'other'

export type MixedLabelSource = 'auto-identify' | 'manual-alt' | 'pdf'

export type MixedOnsetMidi = {
  tenor?: number
  bari?: number
  bass?: number
}

export type MixedAltCandidate = {
  rootPc: number
  natureId: string
  roman: string
  label: string
}

export type MixedOnsetGold = {
  startTick: number
  endTick: number
  leadMidi: number
  midi: MixedOnsetMidi
  rootPc: number
  natureId: string
  roman: string
  role: MixedOnsetRole
  labelSource: MixedLabelSource
  confidence: number
  /** CI may only treat locked onsets as authoritative. */
  locked: boolean
  altCandidates?: MixedAltCandidate[]
}

export type MixedChartGold = {
  schema: typeof MIXED_CHART_GOLD_SCHEMA
  tagId: number
  source: 'musicxml-mixed'
  seedId: string
  tonality: number
  mode: TonalityMode
  profile: ContestProfile
  preferFlats: boolean
  /**
   * True when locked coverage of stack onsets meets the verified threshold.
   * Set by {@link computeVerified}.
   */
  verified: boolean
  /** Fraction of stack onsets that are locked (0–1). */
  lockCoverage: number
  onsets: MixedOnsetGold[]
}

/** Human / PDF overrides keyed by Lead onset tick. */
export type MixedGoldOverride = {
  startTick: number
  rootPc: number
  natureId: string
  role?: MixedOnsetRole
  labelSource?: 'manual-alt' | 'pdf'
  note?: string
}

export type MixedGoldOverridesFile = {
  tagId: number
  overrides: MixedGoldOverride[]
}

/** Minimum locked fraction of stack onsets for `verified: true`. */
export const MIXED_GOLD_VERIFIED_COVERAGE = 0.95

/** Auto-lock when unique ID and confidence ≥ this (and ≤1 strong alt). */
export const MIXED_GOLD_AUTO_LOCK_CONFIDENCE = 0.55
