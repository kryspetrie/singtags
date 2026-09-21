/**
 * Harmonicity from partial coincidence minus roughness.
 * Just path uses exact Rylander ratios from the chord root (not ET+cents).
 */
import { BARBERSHOP_CHORDS, type ChordToneRole } from '../chords'
import { JUST_RATIOS } from '../justIntonation'

export type HarmonicityScorerOptions = {
  partialCount?: number
  rollOff?: number
  coincidenceRel?: number
  roughnessRel?: number
  /** Weight for pairwise difference tones near a common bass fundamental (J6). */
  differenceToneWeight?: number
  /** Bonus when inferred common fundamental aligns with bass (J6). */
  commonFundamentalWeight?: number
}

export type VoiceMidi = {
  bass: number
  bari: number
  lead: number
  tenor: number
}

const DEFAULTS: Required<HarmonicityScorerOptions> = {
  partialCount: 12,
  rollOff: 1,
  coincidenceRel: 0.0035,
  roughnessRel: 0.04,
  differenceToneWeight: 0.15,
  commonFundamentalWeight: 0.25,
}

/** Named roll-off / roughness presets (J8). */
export const HARMONICITY_PRESETS = {
  default: {} as HarmonicityScorerOptions,
  bright: { rollOff: 0.7, coincidenceRel: 0.004 } satisfies HarmonicityScorerOptions,
  dark: { rollOff: 1.4, coincidenceRel: 0.003 } satisfies HarmonicityScorerOptions,
} as const

export type HarmonicityPresetId = keyof typeof HARMONICITY_PRESETS


export function midiToHz(midi: number, cents = 0): number {
  return 440 * 2 ** ((midi - 69 + cents / 100) / 12)
}

type PartialTone = { f: number; amp: number; voice: number }

function partialsForFundamental(
  f0: number,
  voice: number,
  nPartials: number,
  rollOff: number,
): PartialTone[] {
  const out: PartialTone[] = []
  for (let n = 1; n <= nPartials; n++) {
    out.push({ f: f0 * n, amp: 1 / n ** rollOff, voice })
  }
  return out
}

export function scorePartials(
  partials: readonly PartialTone[],
  coincidenceRel: number,
  roughnessRel: number,
): number {
  let coincidence = 0
  let roughness = 0
  for (let i = 0; i < partials.length; i++) {
    for (let j = i + 1; j < partials.length; j++) {
      const a = partials[i]!
      const b = partials[j]!
      if (a.voice === b.voice) continue
      const mean = (a.f + b.f) / 2
      if (mean < 1) continue
      const rel = Math.abs(a.f - b.f) / mean
      const weight = a.amp * b.amp
      if (rel <= coincidenceRel) {
        coincidence += weight * (1 - rel / coincidenceRel)
      } else if (rel < roughnessRel) {
        const t = 1 - (rel - coincidenceRel) / (roughnessRel - coincidenceRel)
        roughness += weight * t * t
      }
    }
  }
  return coincidence - 0.9 * roughness
}

function roleRatio(natureId: string, role: ChordToneRole): number {
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!nature) return 1

  const off = nature.offsets[role]
  if (off == null) return 1

  if (role === 1) return JUST_RATIOS.root
  if (role === 3) {
    if (off === 4) return JUST_RATIOS.M3
    if (nature.id === 'madd6' || nature.id === 'm7' || nature.id === 'half-dim') {
      return JUST_RATIOS.m3_76
    }
    return JUST_RATIOS.m3_65
  }
  if (role === 5) {
    if (off === 8) return JUST_RATIOS.A5
    if (off === 6) return JUST_RATIOS.d5
    return JUST_RATIOS.P5
  }
  if (role === 6) return JUST_RATIOS.M6
  if (role === 7) {
    if (off === 11) return JUST_RATIOS.M7
    if (off === 9) return JUST_RATIOS.M6
    return JUST_RATIOS.harm7
  }
  if (role === 9) return JUST_RATIOS.M9
  return 2 ** (off / 12)
}

/** Snap a just target frequency into the octave nearest the ET midi pitch. */
export function nearestOctave(targetHz: number, refHz: number): number {
  if (targetHz <= 0 || refHz <= 0) return targetHz
  let f = targetHz
  while (f < refHz / Math.SQRT2) f *= 2
  while (f >= refHz * Math.SQRT2) f /= 2
  return f
}

/** Just fundamentals: exact ratios vs root, octave-matched to each MIDI note. */
export function justFundamentals(opts: {
  midi: VoiceMidi
  natureId: string
  voicing: string
}): number[] | null {
  if (opts.voicing.length < 4) return null
  const roles = opts.voicing.split('').map((c) => Number(c) as ChordToneRole)
  const [bassR, bariR, leadR, tenorR] = roles
  if (!bassR || !bariR || !leadR || !tenorR) return null

  const voices = [
    { midi: opts.midi.bass, role: bassR },
    { midi: opts.midi.bari, role: bariR },
    { midi: opts.midi.lead, role: leadR },
    { midi: opts.midi.tenor, role: tenorR },
  ]
  const rootVoice = voices.find((v) => v.role === 1) ?? voices[0]!
  const rootRatio = roleRatio(opts.natureId, rootVoice.role)
  const rootHz = midiToHz(rootVoice.midi) / rootRatio

  return voices.map((v) => {
    const target = rootHz * roleRatio(opts.natureId, v.role)
    return nearestOctave(target, midiToHz(v.midi))
  })
}

export type HarmonicityInput = {
  midi: VoiceMidi
  natureId: string
  rootPc: number
  voicing: string
  useJust?: boolean
}

export function scoreHarmonicity(
  input: HarmonicityInput,
  options: HarmonicityScorerOptions = {},
): number {
  const cfg = { ...DEFAULTS, ...options }
  let fundamentals: number[]

  if (input.useJust === false) {
    fundamentals = [
      midiToHz(input.midi.bass),
      midiToHz(input.midi.bari),
      midiToHz(input.midi.lead),
      midiToHz(input.midi.tenor),
    ]
  } else {
    fundamentals =
      justFundamentals({
        midi: input.midi,
        natureId: input.natureId,
        voicing: input.voicing,
      }) ?? [
        midiToHz(input.midi.bass),
        midiToHz(input.midi.bari),
        midiToHz(input.midi.lead),
        midiToHz(input.midi.tenor),
      ]
  }

  const all: PartialTone[] = []
  fundamentals.forEach((f0, voice) => {
    all.push(...partialsForFundamental(f0, voice, cfg.partialCount, cfg.rollOff))
  })
  let score = scorePartials(all, cfg.coincidenceRel, cfg.roughnessRel)
  score += differenceToneBonus(fundamentals, cfg.differenceToneWeight)
  score += commonFundamentalBonus(fundamentals, cfg.commonFundamentalWeight)
  return score
}

/** Prefer difference tones that land near the bass or a sub-harmonic of the bass. */
export function differenceToneBonus(fundamentals: readonly number[], weight: number): number {
  if (weight <= 0 || fundamentals.length < 2) return 0
  const bass = fundamentals[0]!
  if (bass < 1) return 0
  let bonus = 0
  for (let i = 0; i < fundamentals.length; i++) {
    for (let j = i + 1; j < fundamentals.length; j++) {
      const diff = Math.abs(fundamentals[i]! - fundamentals[j]!)
      if (diff < 20) continue
      const relBass = Math.abs(diff - bass) / bass
      const relHalf = Math.abs(diff - bass / 2) / (bass / 2)
      const best = Math.min(relBass, relHalf)
      if (best < 0.06) bonus += weight * (1 - best / 0.06)
    }
  }
  return bonus
}

/** Bonus when upper voices share partials of an inferred common fundamental near bass. */
export function commonFundamentalBonus(
  fundamentals: readonly number[],
  weight: number,
): number {
  if (weight <= 0 || fundamentals.length < 2) return 0
  const bass = fundamentals[0]!
  if (bass < 1) return 0
  let hits = 0
  for (let i = 1; i < fundamentals.length; i++) {
    const f = fundamentals[i]!
    const ratio = f / bass
    const nearest = Math.round(ratio)
    if (nearest < 1) continue
    const rel = Math.abs(ratio - nearest) / nearest
    if (rel < 0.02) hits++
  }
  return hits > 0 ? weight * (hits / (fundamentals.length - 1)) : 0
}

export function normalizeHarmonicity(raw: number): number {
  return 1 / (1 + Math.exp(-raw / 2))
}

export interface HarmonicityScorer {
  score(input: HarmonicityInput): number
  normalize(raw: number): number
}

export function createHarmonicityScorer(
  options: HarmonicityScorerOptions = {},
): HarmonicityScorer {
  return {
    score: (input) => scoreHarmonicity(input, options),
    normalize: normalizeHarmonicity,
  }
}

export function createHarmonicityScorerPreset(
  preset: HarmonicityPresetId,
  overrides: HarmonicityScorerOptions = {},
): HarmonicityScorer {
  return createHarmonicityScorer({ ...HARMONICITY_PRESETS[preset], ...overrides })
}
