/**
 * Configurable pitch-pipe / pay-the-key voice.
 *
 * Production default matches the classic “40% saw + 60% sine” blend.
 * Labs → Pitch pipe sound exports JSON with schema {@link PITCH_PIPE_VOICE_SCHEMA}
 * so a tuned preset can be pasted back into the app.
 */

export const PITCH_PIPE_VOICE_SCHEMA = 'singtags.pitchPipeVoice.v1' as const

/** User-selected app-wide pitch pipe / pay-the-key voice (full JSON). */
export const PITCH_PIPE_ACTIVE_VOICE_KEY = 'singtags.pitchPipeActiveVoice.v1'
/** Lab-saved candidate voices (array of {@link PitchPipeVoiceConfig}). */
export const PITCH_PIPE_VOICE_LIBRARY_KEY = 'singtags.pitchPipeVoiceLab.library.v1'
/** Fired on `window` when the active voice changes (PitchPlayer listeners sync). */
export const PITCH_PIPE_VOICE_CHANGE_EVENT = 'singtags:pitch-pipe-voice'

export type PitchPipeWaveform = OscillatorType

export type PitchPipePartial = {
  /** Oscillator waveform. */
  type: PitchPipeWaveform
  /** Relative mix level before master (0–1 typical). */
  gain: number
  /** Offset from the played note in semitones (0 = fundamental). */
  semitones: number
  /** Extra cents on this partial. */
  detuneCents: number
}

export type PitchPipeFilterConfig = {
  type: BiquadFilterType
  frequencyHz: number
  Q: number
}

/** Serializable voice preset for pitch pipe / pay-the-key. */
export type PitchPipeVoiceConfig = {
  schema: typeof PITCH_PIPE_VOICE_SCHEMA
  /** Stable id for a preset list (slug). */
  id: string
  /** Human label. */
  label: string
  /** Optional note for whoever wires this into the app. */
  notes?: string
  masterGain: number
  attackSec: number
  releaseSec: number
  partials: PitchPipePartial[]
  /** Optional tone shaping after the partial mix. */
  filter: PitchPipeFilterConfig | null
}

const WAVEFORMS: readonly PitchPipeWaveform[] = ['sine', 'square', 'sawtooth', 'triangle']
const FILTER_TYPES: readonly BiquadFilterType[] = [
  'lowpass',
  'highpass',
  'bandpass',
  'notch',
  'allpass',
  'peaking',
  'lowshelf',
  'highshelf',
]

export const PITCH_PIPE_WAVEFORM_OPTIONS: Array<{ value: PitchPipeWaveform; label: string }> =
  WAVEFORMS.map((value) => ({ value, label: value }))

export const PITCH_PIPE_FILTER_TYPE_OPTIONS: Array<{ value: BiquadFilterType; label: string }> =
  FILTER_TYPES.map((value) => ({ value, label: value }))

/** Current production voice (music-website port). */
export const DEFAULT_PITCH_PIPE_VOICE: PitchPipeVoiceConfig = {
  schema: PITCH_PIPE_VOICE_SCHEMA,
  id: 'classic-saw-sine',
  label: 'Classic saw + sine',
  notes: 'Production default: 40% sawtooth + 60% sine, master 0.3, 50ms attack, 1s release.',
  masterGain: 0.3,
  attackSec: 0.05,
  releaseSec: 1,
  partials: [
    { type: 'sawtooth', gain: 0.4, semitones: 0, detuneCents: 0 },
    { type: 'sine', gain: 0.6, semitones: 0, detuneCents: 0 },
  ],
  filter: null,
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}

function asWaveform(v: unknown): PitchPipeWaveform | null {
  return typeof v === 'string' && (WAVEFORMS as readonly string[]).includes(v)
    ? (v as PitchPipeWaveform)
    : null
}

function asFilterType(v: unknown): BiquadFilterType | null {
  return typeof v === 'string' && (FILTER_TYPES as readonly string[]).includes(v)
    ? (v as BiquadFilterType)
    : null
}

function parsePartial(raw: unknown): PitchPipePartial | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const type = asWaveform(o.type)
  if (!type) return null
  return {
    type,
    gain: clamp(typeof o.gain === 'number' ? o.gain : 0, 0, 2),
    semitones: clamp(typeof o.semitones === 'number' ? o.semitones : 0, -36, 36),
    detuneCents: clamp(typeof o.detuneCents === 'number' ? o.detuneCents : 0, -100, 100),
  }
}

function parseFilter(raw: unknown): PitchPipeFilterConfig | null {
  if (raw == null) return null
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const type = asFilterType(o.type)
  if (!type) return null
  return {
    type,
    frequencyHz: clamp(typeof o.frequencyHz === 'number' ? o.frequencyHz : 2000, 40, 18000),
    Q: clamp(typeof o.Q === 'number' ? o.Q : 0.7, 0.01, 40),
  }
}

/** Deep-clone a voice config (mutable lab editing). */
export function clonePitchPipeVoice(v: PitchPipeVoiceConfig): PitchPipeVoiceConfig {
  return {
    ...v,
    partials: v.partials.map((p) => ({ ...p })),
    filter: v.filter ? { ...v.filter } : null,
  }
}

/** Slug id from a display label (lab saves / exports). */
export function slugifyPitchPipeVoiceLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  return slug || `voice-${Date.now().toString(36)}`
}

/**
 * Normalize / parse a pasted voice export.
 * Accepts full schema objects and loose lab drafts (fills defaults).
 */
export function parsePitchPipeVoice(raw: unknown): PitchPipeVoiceConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const partialsIn = Array.isArray(o.partials) ? o.partials : null
  if (!partialsIn?.length) return null
  const partials: PitchPipePartial[] = []
  for (const p of partialsIn) {
    const parsed = parsePartial(p)
    if (parsed) partials.push(parsed)
  }
  if (!partials.length) return null

  const label =
    typeof o.label === 'string' && o.label.trim()
      ? o.label.trim().slice(0, 80)
      : 'Untitled voice'
  const id =
    typeof o.id === 'string' && o.id.trim()
      ? o.id.trim().slice(0, 64)
      : slugifyPitchPipeVoiceLabel(label)

  return {
    schema: PITCH_PIPE_VOICE_SCHEMA,
    id,
    label,
    notes: typeof o.notes === 'string' && o.notes.trim() ? o.notes.trim().slice(0, 500) : undefined,
    masterGain: clamp(typeof o.masterGain === 'number' ? o.masterGain : 0.3, 0.01, 1),
    attackSec: clamp(typeof o.attackSec === 'number' ? o.attackSec : 0.05, 0.005, 2),
    releaseSec: clamp(typeof o.releaseSec === 'number' ? o.releaseSec : 1, 0.02, 4),
    partials,
    filter: parseFilter(o.filter),
  }
}

/** Ensure id matches label when saving from the lab (no manual slug field). */
export function finalizePitchPipeVoiceForSave(
  voice: PitchPipeVoiceConfig,
  opts?: { keepId?: boolean },
): PitchPipeVoiceConfig {
  const parsed = parsePitchPipeVoice(voice) ?? clonePitchPipeVoice(DEFAULT_PITCH_PIPE_VOICE)
  if (opts?.keepId && parsed.id) return parsed
  return { ...parsed, id: slugifyPitchPipeVoiceLabel(parsed.label) }
}

/** Pretty JSON for copy/paste / email. */
export function formatPitchPipeVoiceExport(voice: PitchPipeVoiceConfig): string {
  const normalized = parsePitchPipeVoice(voice) ?? clonePitchPipeVoice(DEFAULT_PITCH_PIPE_VOICE)
  return `${JSON.stringify(normalized, null, 2)}\n`
}

export function newPartial(type: PitchPipeWaveform = 'sine'): PitchPipePartial {
  return { type, gain: 0.3, semitones: 0, detuneCents: 0 }
}

function notifyVoiceChange(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PITCH_PIPE_VOICE_CHANGE_EVENT))
}

/** Voice used by pitch pipe / pay-the-key (user override or classic default). */
export function getActivePitchPipeVoice(): PitchPipeVoiceConfig {
  try {
    const raw = localStorage.getItem(PITCH_PIPE_ACTIVE_VOICE_KEY)
    if (raw) {
      const parsed = parsePitchPipeVoice(JSON.parse(raw) as unknown)
      if (parsed) return parsed
    }
  } catch {
    /* ignore */
  }
  return clonePitchPipeVoice(DEFAULT_PITCH_PIPE_VOICE)
}

/** True when the user has overridden the classic production voice. */
export function hasCustomActivePitchPipeVoice(): boolean {
  try {
    return localStorage.getItem(PITCH_PIPE_ACTIVE_VOICE_KEY) != null
  } catch {
    return false
  }
}

/** Persist a voice as the app-wide pitch pipe / pay-the-key sound. */
export function setActivePitchPipeVoice(voice: PitchPipeVoiceConfig): void {
  const next = finalizePitchPipeVoiceForSave(voice, { keepId: true })
  try {
    localStorage.setItem(PITCH_PIPE_ACTIVE_VOICE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  notifyVoiceChange()
}

/** Clear override — pitch pipe uses {@link DEFAULT_PITCH_PIPE_VOICE} again. */
export function clearActivePitchPipeVoice(): void {
  try {
    localStorage.removeItem(PITCH_PIPE_ACTIVE_VOICE_KEY)
  } catch {
    /* ignore */
  }
  notifyVoiceChange()
}

/** Load lab-saved candidate voices (newest first). */
export function loadPitchPipeVoiceLibrary(): PitchPipeVoiceConfig[] {
  try {
    const raw = localStorage.getItem(PITCH_PIPE_VOICE_LIBRARY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => parsePitchPipeVoice(item))
      .filter((v): v is PitchPipeVoiceConfig => !!v)
      .slice(0, 32)
  } catch {
    return []
  }
}

/** Persist lab library (replaces previous list). */
export function savePitchPipeVoiceLibrary(voices: PitchPipeVoiceConfig[]): void {
  const cleaned = voices
    .map((v) => parsePitchPipeVoice(v))
    .filter((v): v is PitchPipeVoiceConfig => !!v)
    .slice(0, 32)
  try {
    localStorage.setItem(PITCH_PIPE_VOICE_LIBRARY_KEY, JSON.stringify(cleaned))
  } catch {
    /* ignore */
  }
}

/** Insert or replace a voice in the lab library by id. */
export function upsertPitchPipeVoiceLibrary(voice: PitchPipeVoiceConfig): PitchPipeVoiceConfig[] {
  const next = finalizePitchPipeVoiceForSave(voice, { keepId: true })
  const list = loadPitchPipeVoiceLibrary().filter((v) => v.id !== next.id)
  const out = [next, ...list].slice(0, 32)
  savePitchPipeVoiceLibrary(out)
  return out
}

/** Remove one lab voice by id. */
export function removePitchPipeVoiceFromLibrary(id: string): PitchPipeVoiceConfig[] {
  const out = loadPitchPipeVoiceLibrary().filter((v) => v.id !== id)
  savePitchPipeVoiceLibrary(out)
  return out
}

/** mailto: body helper for sharing a candidate voice with Krys. */
export function pitchPipeVoiceShareMailto(voice: PitchPipeVoiceConfig): string {
  const json = formatPitchPipeVoiceExport(finalizePitchPipeVoiceForSave(voice, { keepId: true }))
  const subject = encodeURIComponent(`SingTags pitch pipe sound: ${voice.label}`)
  const body = encodeURIComponent(
    `Hi Krys,\n\nI tuned a pitch pipe sound in the SingTags lab and think it could be a good built-in option.\n\nLabel: ${voice.label}\n\nJSON:\n\n${json}`,
  )
  return `mailto:info@singtags.com?subject=${subject}&body=${body}`
}
