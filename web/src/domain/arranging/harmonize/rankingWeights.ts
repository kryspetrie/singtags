/** Ranking weights live in domain so scorers stay free of adapter deps. */
import defaults from '../defaultWeights.json'

export type RankingWeights = {
  motion: number
  primaryLayer: number
  seventh: number
  closedVoicing: number
  ring: number
  /**
   * Secondary ring driver from measured JI stack priors (`nature:voicing`).
   * Prefers catalog shells that FFT-ranked as stronger lock (esp. among same nature).
   */
  stackRing: number
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
  /**
   * Prefer plain major/minor releases when the lead is the chord root (or 5th)
   * on the primary pillar — avoids automatic I7 / IV7 homes.
   */
  homeTriad: number
  /**
   * Soft demotion of Dom9 / 6 / add9 when the lead is not itself the 6th or 9th.
   * Keeps color chords available without winning the default top pick.
   */
  colorChordPenalty: number
  /**
   * Soft demotion of SCF/passing candidates so they stay alternates unless the
   * melody (or preferScf path) genuinely needs them.
   */
  passingSoftPenalty: number
  /**
   * Classic cadence fit (V7→I, II7→V7→I, I7→IV, …) from domain/cadences.
   * Separate from coarse tensionRelease so Why? can name the pattern.
   */
  cadenceFit: number
  /**
   * Soft demotion of minor / m7 / madd6 in major mode when Lead is not the ♭3
   * (unforced color). Zero when Lead forces the minor third.
   */
  unforcedMinorPenalty: number
  /**
   * At phrase cadence/tag tonic arrivals: prefer major/minor home (Rylander
   * ~99% major endings) unless Lead is on ♭7 (forces I7 / i7).
   */
  finalComplete: number
  /**
   * Classical function gravity toward I / V(7) / IV / ii(7) / vi — mirrors the
   * Detected-chord highway so Coach Basic doesn’t wander into exotic roots.
   */
  diatonicFunction: number
  /**
   * True song/phrase final (no next melody): prefer tonic home, heavily demote
   * hanging V7 / ii7 / non-tonic endings.
   */
  songFinalHome: number
  /**
   * Prefer 4 distinct pitch classes (true 4-part). When a triad must double,
   * prefer the root (Flinn/BAM/Prietto); heavily demote doubled major 3rds.
   */
  completeFourPart: number
  /**
   * Keep stacks near a singable home register: bass ~C3–G3, tenor close above
   * Lead, and resist upward inversion climb vs the previous stack.
   */
  registerHome: number
  /**
   * Ades close voicing: bari/lead/tenor within an octave (separate from
   * bass–tenor outer span / `closedVoicing`).
   */
  upperTrioClose: number
  /**
   * After a leap > 3rd, prefer change of direction in bass/bari/tenor (Ades).
   */
  postLeapDirection: number
  /**
   * Soft demotion of ↑A4 / ↓d5 melodic leaps in non-Lead parts (Ades).
   */
  hazardousLeap: number
}

/** Edit numbers in `../defaultWeights.json` — this is just the typed view. */
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = defaults.ranking
