/**
 * Ensemble voicing profile — part ranges, pitch center, outer-span policy.
 * Used by Path Optimize Revoice and Coach walk inversion audition.
 */
import { TTBB_BASS_MIN, TTBB_CLOSE_SPAN_MAX, type VoicingPitches } from './chords/chords'

export type VoicingPartId = 'bass' | 'bari' | 'lead' | 'tenor'

export type VoicingPartBand = { min: number; max: number }

export type VoicingPresetId = 'ttbb' | 'satb' | 'ssaa' | 'custom'

export type VoicingProfile = {
  presetId: VoicingPresetId
  parts: Record<VoicingPartId, VoicingPartBand>
  /** MIDI center-of-gravity bias for register (Lead still locked to melody). */
  pitchCenter: number
  /** Max tenor−bass semitones accepted on revoice (BAM-close default 21). */
  maxOuterSpan: number
  allowSpread: boolean
}

export const VOICING_PART_IDS: readonly VoicingPartId[] = ['bass', 'bari', 'lead', 'tenor']

/** Men's contest TTBB comfort (BAM-ish). */
export function voicingProfileTtbb(): VoicingProfile {
  return {
    presetId: 'ttbb',
    parts: {
      bass: { min: TTBB_BASS_MIN, max: 60 },
      bari: { min: 50, max: 69 },
      lead: { min: 50, max: 67 },
      tenor: { min: 58, max: 77 },
    },
    pitchCenter: 60,
    maxOuterSpan: TTBB_CLOSE_SPAN_MAX,
    allowSpread: false,
  }
}

/**
 * SATB mapped onto TTBB stack roles: S→tenor, A→lead, T→bari, B→bass.
 * Absolute MIDI approx for mixed chorus.
 */
export function voicingProfileSatb(): VoicingProfile {
  return {
    presetId: 'satb',
    parts: {
      bass: { min: 40, max: 60 },
      bari: { min: 48, max: 67 },
      lead: { min: 53, max: 74 },
      tenor: { min: 60, max: 81 },
    },
    pitchCenter: 62,
    maxOuterSpan: 28,
    allowSpread: true,
  }
}

/** Women's SSAA — higher absolute bands on the same four roles. */
export function voicingProfileSsaa(): VoicingProfile {
  return {
    presetId: 'ssaa',
    parts: {
      bass: { min: 50, max: 67 },
      bari: { min: 55, max: 72 },
      lead: { min: 57, max: 76 },
      tenor: { min: 64, max: 84 },
    },
    pitchCenter: 67,
    maxOuterSpan: 24,
    allowSpread: false,
  }
}

export const VOICING_PRESETS: Record<Exclude<VoicingPresetId, 'custom'>, () => VoicingProfile> = {
  ttbb: voicingProfileTtbb,
  satb: voicingProfileSatb,
  ssaa: voicingProfileSsaa,
}

export function voicingProfileFromPreset(id: Exclude<VoicingPresetId, 'custom'>): VoicingProfile {
  return VOICING_PRESETS[id]()
}

export function defaultVoicingProfile(): VoicingProfile {
  return voicingProfileTtbb()
}

export function clampMidiToPart(part: VoicingPartId, midi: number, profile: VoicingProfile): number {
  const band = profile.parts[part]
  let m = Math.round(midi)
  while (m < band.min) m += 12
  while (m > band.max) m -= 12
  if (m < band.min) m = band.min
  if (m > band.max) m = band.max
  return m
}

/** Soft score: 0 = in band; negative when outside (octave steps). */
export function partBandFitScore(part: VoicingPartId, midi: number, profile: VoicingProfile): number {
  const band = profile.parts[part]
  if (midi >= band.min && midi <= band.max) return 2
  const below = band.min - midi
  const above = midi - band.max
  const out = Math.max(below, above, 0)
  return -Math.ceil(out / 6)
}

export function outerSpanOk(midi: VoicingPitches, profile: VoicingProfile): boolean {
  const span = midi.tenor - midi.bass
  const cap = profile.allowSpread
    ? Math.max(profile.maxOuterSpan, TTBB_CLOSE_SPAN_MAX + 7)
    : profile.maxOuterSpan
  return span <= cap
}

/**
 * Hard fit for listed Revoice inversions / Suggest filter:
 * Bass/Bari/Tenor inside part bands; tenor−bass ≤ maxOuterSpan.
 * Lead is melody-locked and may sit outside the Lead band.
 */
export function midiFitsPartBands(midi: VoicingPitches, profile: VoicingProfile): boolean {
  if (midi.tenor - midi.bass > profile.maxOuterSpan) return false
  for (const part of ['bass', 'bari', 'tenor'] as const) {
    const band = profile.parts[part]
    if (midi[part] < band.min || midi[part] > band.max) return false
  }
  return true
}

/** Bias toward pitchCenter via mean of outer voices. */
export function pitchCenterScore(midi: VoicingPitches, profile: VoicingProfile): number {
  const mid = (midi.bass + midi.tenor) / 2
  const d = Math.abs(mid - profile.pitchCenter)
  return Math.max(0, 8 - d * 0.35)
}

export function voicingFitsProfile(midi: VoicingPitches, profile: VoicingProfile): boolean {
  if (!outerSpanOk(midi, profile)) return false
  // Lead is melody-locked — only soft-check lead band.
  if (midi.bass < profile.parts.bass.min - 7 || midi.bass > profile.parts.bass.max + 7) {
    return false
  }
  if (midi.tenor < profile.parts.tenor.min - 7 || midi.tenor > profile.parts.tenor.max + 7) {
    return false
  }
  return true
}

/**
 * Normalize a partial prefs blob into a full profile.
 * Unknown / edited bands → custom when they diverge from a named preset.
 */
export function normalizeVoicingProfile(raw: unknown): VoicingProfile {
  const base = defaultVoicingProfile()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Partial<VoicingProfile> & { presetId?: string }
  const presetId =
    o.presetId === 'ttbb' || o.presetId === 'satb' || o.presetId === 'ssaa' || o.presetId === 'custom'
      ? o.presetId
      : 'ttbb'
  const fromPreset =
    presetId === 'custom' ? { ...base, presetId: 'custom' as const } : voicingProfileFromPreset(presetId)

  const parts = { ...fromPreset.parts }
  if (o.parts && typeof o.parts === 'object') {
    for (const id of VOICING_PART_IDS) {
      const p = (o.parts as Partial<Record<VoicingPartId, Partial<VoicingPartBand>>>)[id]
      if (!p) continue
      const min = typeof p.min === 'number' && Number.isFinite(p.min) ? Math.round(p.min) : parts[id].min
      const max = typeof p.max === 'number' && Number.isFinite(p.max) ? Math.round(p.max) : parts[id].max
      parts[id] = { min: Math.min(min, max), max: Math.max(min, max) }
    }
  }
  const pitchCenter =
    typeof o.pitchCenter === 'number' && Number.isFinite(o.pitchCenter)
      ? Math.min(84, Math.max(36, Math.round(o.pitchCenter)))
      : fromPreset.pitchCenter
  const maxOuterSpan =
    typeof o.maxOuterSpan === 'number' && Number.isFinite(o.maxOuterSpan)
      ? Math.min(48, Math.max(12, Math.round(o.maxOuterSpan)))
      : fromPreset.maxOuterSpan
  const allowSpread = typeof o.allowSpread === 'boolean' ? o.allowSpread : fromPreset.allowSpread

  let resolvedPreset: VoicingPresetId = presetId
  if (presetId !== 'custom') {
    const named = voicingProfileFromPreset(presetId)
    const sameParts = VOICING_PART_IDS.every(
      (id) => parts[id].min === named.parts[id].min && parts[id].max === named.parts[id].max,
    )
    if (
      !sameParts ||
      pitchCenter !== named.pitchCenter ||
      maxOuterSpan !== named.maxOuterSpan ||
      allowSpread !== named.allowSpread
    ) {
      resolvedPreset = 'custom'
    }
  }

  return {
    presetId: resolvedPreset,
    parts,
    pitchCenter,
    maxOuterSpan,
    allowSpread,
  }
}

/** Mark profile custom after a field edit. */
export function withCustomVoicingProfile(profile: VoicingProfile, patch: Partial<VoicingProfile>): VoicingProfile {
  return normalizeVoicingProfile({
    ...profile,
    ...patch,
    parts: patch.parts ? { ...profile.parts, ...patch.parts } : profile.parts,
    presetId: 'custom',
  })
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic shuffle for explore / Run-again diversity. */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const out = [...items]
  const rnd = mulberry32(seed || 1)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}
