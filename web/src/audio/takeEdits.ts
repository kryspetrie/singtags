/**
 * Non-destructive take edit settings: pitch/speed/normalize/compress on playback
 * and baked on export. Crop still changes the working blob.
 */
import { canonicalizeTransform } from './transformContract'
import { normalizeCompressIntensity, type TakeCompressMode } from './takeLevelProcess'
import type { AudioTransform } from '../types/audio'
import { IDENTITY_TRANSFORM, isIdentityTransform } from '../types/audio'

export type RecorderTakeCompressEdit = {
  mode: TakeCompressMode
  /** 0 = light … 1 = heavy */
  intensity: number
}

/** Saved (or draft) edit recipe for a take. */
export type RecorderTakeEdits = {
  pitchSemitones: number
  speed: number
  /** Peak-normalize before compress (live preview + export bake). */
  normalize: boolean
  compress: RecorderTakeCompressEdit | null
}

const MODES: ReadonlySet<string> = new Set(['gentle', 'vocal', 'punch', 'broadcast'])

export function defaultRecorderTakeEdits(): RecorderTakeEdits {
  return { pitchSemitones: 0, speed: 1, normalize: false, compress: null }
}

export function normalizeRecorderTakeEdits(raw: unknown): RecorderTakeEdits {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const c = canonicalizeTransform(
    typeof o.pitchSemitones === 'number' ? o.pitchSemitones : 0,
    typeof o.speed === 'number' ? o.speed : 1,
  )
  let compress: RecorderTakeCompressEdit | null = null
  const cr = o.compress
  if (cr && typeof cr === 'object') {
    const co = cr as Record<string, unknown>
    const mode = typeof co.mode === 'string' && MODES.has(co.mode) ? (co.mode as TakeCompressMode) : null
    if (mode) {
      compress = {
        mode,
        intensity: normalizeCompressIntensity(
          typeof co.intensity === 'number' || typeof co.intensity === 'string'
            ? (co.intensity as number | 'light' | 'medium' | 'heavy')
            : 0.5,
        ),
      }
    }
  }
  return {
    pitchSemitones: c.pitchSemitones,
    speed: c.speed,
    normalize: o.normalize === true,
    compress,
  }
}

export function takeEditsTransform(edits: RecorderTakeEdits): AudioTransform {
  const c = canonicalizeTransform(edits.pitchSemitones, edits.speed)
  return { pitchSemitones: c.pitchSemitones, speed: c.speed }
}

export function isIdentityTakeEdits(edits: RecorderTakeEdits | null | undefined): boolean {
  if (!edits) return true
  const n = normalizeRecorderTakeEdits(edits)
  return isIdentityTransform(takeEditsTransform(n)) && !n.normalize && !n.compress
}

export function recorderTakeEditsEqual(
  a: RecorderTakeEdits | null | undefined,
  b: RecorderTakeEdits | null | undefined,
): boolean {
  const na = normalizeRecorderTakeEdits(a ?? defaultRecorderTakeEdits())
  const nb = normalizeRecorderTakeEdits(b ?? defaultRecorderTakeEdits())
  if (na.pitchSemitones !== nb.pitchSemitones || na.speed !== nb.speed) return false
  if (na.normalize !== nb.normalize) return false
  if (!na.compress && !nb.compress) return true
  if (!na.compress || !nb.compress) return false
  return (
    na.compress.mode === nb.compress.mode &&
    Math.abs(na.compress.intensity - nb.compress.intensity) < 1e-6
  )
}

/**
 * Playback-mode compound: UI pitch/speed on top of saved edit settings.
 * pitch adds; speed multiplies.
 */
export function compoundPlaybackTransform(
  edits: RecorderTakeEdits | null | undefined,
  playPitch: number,
  playSpeed: number,
): AudioTransform {
  const base = normalizeRecorderTakeEdits(edits ?? defaultRecorderTakeEdits())
  const c = canonicalizeTransform(base.pitchSemitones + playPitch, base.speed * playSpeed)
  return { pitchSemitones: c.pitchSemitones, speed: c.speed }
}

/** Apply compress edit to take bytes (WAV out). Identity compress → copy input. */
export async function applyTakeCompressEdit(
  input: ArrayBuffer | Uint8Array,
  compress: RecorderTakeCompressEdit | null | undefined,
): Promise<Uint8Array> {
  if (!compress) {
    return input instanceof Uint8Array ? input : new Uint8Array(input)
  }
  const { compressTakeBytesToWav } = await import('./takeLevelProcess')
  const result = await compressTakeBytesToWav(input, {
    mode: compress.mode,
    intensity: compress.intensity,
  })
  return result.bytes
}

/** Normalize then compress (order matters). Identity → copy. */
export async function applyTakeLevelEdits(
  input: ArrayBuffer | Uint8Array,
  edits: RecorderTakeEdits | null | undefined,
): Promise<Uint8Array> {
  const n = normalizeRecorderTakeEdits(edits ?? defaultRecorderTakeEdits())
  let data = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (n.normalize) {
    const { normalizeTakeBytesToWav } = await import('./takeLevelProcess')
    const result = await normalizeTakeBytesToWav(data)
    data = result.bytes
  }
  if (n.compress) {
    data = await applyTakeCompressEdit(data, n.compress)
  }
  return data
}

/**
 * Bytes to feed the player for a take with optional normalize/compress edits.
 * Pitch/speed stay on the player transform path.
 */
export async function bytesForTakeListen(
  input: ArrayBuffer | Uint8Array,
  edits: RecorderTakeEdits | null | undefined,
): Promise<{ data: Uint8Array; mime: string }> {
  const n = normalizeRecorderTakeEdits(edits ?? defaultRecorderTakeEdits())
  if (!n.normalize && !n.compress) {
    const data = input instanceof Uint8Array ? input : new Uint8Array(input)
    return { data, mime: '' }
  }
  const data = await applyTakeLevelEdits(input, n)
  return { data, mime: 'audio/wav' }
}

export { IDENTITY_TRANSFORM }
