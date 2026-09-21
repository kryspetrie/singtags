/** Ranking weights live in domain so scorers stay free of adapter deps. */
export type RankingWeights = {
  motion: number
  primaryLayer: number
  seventh: number
  closedVoicing: number
  ring: number
  secondaryDominant: number
  augDimPrimaryPenalty: number
  harmonicity: number
  /** Prefer small harmony-part motion vs previous stack; melody voice excluded (0 = ignore). */
  voiceLead: number
  /** Prefer strong lead chord-tone roles (3/7 on dominants, 3 on triads). */
  strongVoice: number
  /** Soft bump when BS7 moves a dim5/tritone from a chromatic degree (Szabo). */
  dim5Down: number
  /** Prefer BS7 approaching pillar / release on pillar. */
  tensionRelease: number
  /** Prefer stepwise resolution of previous dominant 3/7. */
  resolution: number
  /** Harmonic-series-like spacing. */
  spacing: number
  /** Outer contrary motion. */
  contrary: number
  /** Hold common tones in the same voice. */
  commonTone: number
  /** Soft penalty for parallels / all-same-direction. */
  parallelPenalty: number
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  motion: 1,
  primaryLayer: 3,
  seventh: 2,
  closedVoicing: 0.5,
  ring: 1,
  secondaryDominant: 3,
  augDimPrimaryPenalty: 4,
  harmonicity: 2.5,
  voiceLead: 1.5,
  strongVoice: 1.25,
  dim5Down: 1.25,
  tensionRelease: 2,
  resolution: 1.75,
  spacing: 1.25,
  contrary: 1,
  commonTone: 1,
  parallelPenalty: 1.5,
}
