/**
 * Tag Studio SoundFont banks (SF2 under /instruments/soundfonts/).
 * Banks are fetched only when the SoundFont engine (or a specific bank) is selected.
 *
 * The SpessaSynth AudioWorklet processor is served from `public/` (not Vite `?url`)
 * because `audioWorklet.addModule` often fails on Vite-transformed / `@fs` module URLs.
 */

export const TAG_ROLL_SOUNDFONT_OPTIONS = [
  {
    value: 'ydp-grand' as const,
    label: 'YDP Grand Piano',
    file: 'YDP-GrandPiano.sf2',
    /** Single-instrument piano bank — no program picker. */
    multiInstrument: false,
  },
  {
    value: 'upright-kw' as const,
    label: 'Upright Piano KW',
    file: 'Upright-Piano-KW.sf2',
    multiInstrument: false,
  },
  {
    value: 'yamaha-xg' as const,
    label: 'Yamaha XG (GM / XG)',
    file: 'Yamaha-XG.sf2',
    multiInstrument: true,
  },
] as const

export type TagRollSoundfontId = (typeof TAG_ROLL_SOUNDFONT_OPTIONS)[number]['value']

export const TAG_ROLL_DEFAULT_SOUNDFONT_ID: TagRollSoundfontId = 'ydp-grand'

export function isTagRollSoundfontId(v: unknown): v is TagRollSoundfontId {
  return TAG_ROLL_SOUNDFONT_OPTIONS.some((o) => o.value === v)
}

export function soundfontOption(id: TagRollSoundfontId) {
  return TAG_ROLL_SOUNDFONT_OPTIONS.find((o) => o.value === id) ?? TAG_ROLL_SOUNDFONT_OPTIONS[0]!
}

export function soundfontIsMultiInstrument(id: TagRollSoundfontId): boolean {
  return soundfontOption(id).multiInstrument
}

function publicInstrumentRoot(): string {
  const base = import.meta.env.BASE_URL || '/'
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}instruments/soundfonts/`
}

export function soundfontUrl(id: TagRollSoundfontId): string {
  return `${publicInstrumentRoot()}${soundfontOption(id).file}`
}

/** Same-origin URL for the bundled SpessaSynth AudioWorklet processor. */
export function spessasynthProcessorUrl(): string {
  return `${publicInstrumentRoot()}spessasynth_processor.min.js`
}

/** Resolved at import time for catalog/tests (same value as {@link spessasynthProcessorUrl}). */
export const SPESSASYNTH_PROCESSOR_URL = spessasynthProcessorUrl()

const bufferCache = new Map<TagRollSoundfontId, ArrayBuffer>()
const inflight = new Map<TagRollSoundfontId, Promise<ArrayBuffer>>()

/** Per-AudioContext — each context needs its own `addModule`. */
const workletByContext = new WeakMap<BaseAudioContext, Promise<void>>()

/** True when the SF2 bytes are already in memory. */
export function isSoundfontBuffered(id: TagRollSoundfontId): boolean {
  return bufferCache.has(id)
}

/**
 * Register the SpessaSynth processor on this AudioContext.
 * Tries the public URL first, then a blob: URL fallback (MIME / path issues).
 */
export function ensureSpessasynthWorklet(ctx: BaseAudioContext): Promise<void> {
  const existing = workletByContext.get(ctx)
  if (existing) return existing
  const p = addSpessasynthWorklet(ctx).catch((err) => {
    workletByContext.delete(ctx)
    throw err
  })
  workletByContext.set(ctx, p)
  return p
}

async function addSpessasynthWorklet(ctx: BaseAudioContext): Promise<void> {
  if (!ctx.audioWorklet?.addModule) {
    throw new Error('AudioWorklet is not supported in this browser')
  }
  const url = spessasynthProcessorUrl()
  try {
    await ctx.audioWorklet.addModule(url)
    return
  } catch (directErr) {
    // Vite / MIME / relative sourcemap issues — load as a blob module instead.
    try {
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`Worklet fetch failed (${res.status}): ${url}`)
      }
      let text = await res.text()
      // Drop sourceMappingURL so the worklet thread does not 404 looking for a .map.
      text = text.replace(/\n\/\/# sourceMappingURL=.*$/s, '\n')
      const blob = new Blob([text], { type: 'application/javascript' })
      const blobUrl = URL.createObjectURL(blob)
      try {
        await ctx.audioWorklet.addModule(blobUrl)
      } finally {
        URL.revokeObjectURL(blobUrl)
      }
    } catch (blobErr) {
      const a = directErr instanceof Error ? directErr.message : String(directErr)
      const b = blobErr instanceof Error ? blobErr.message : String(blobErr)
      throw new Error(`Unable to load SpessaSynth worklet (${url}): ${a} | blob: ${b}`)
    }
  }
}

/**
 * Start (or reuse) a fetch of the SF2 bank. Safe to call on engine/bank select.
 * Does not instantiate the audio worklet.
 */
export function prefetchSoundfont(id: TagRollSoundfontId): Promise<ArrayBuffer> {
  const hit = bufferCache.get(id)
  if (hit) return Promise.resolve(hit)
  const pending = inflight.get(id)
  if (pending) return pending
  const p = fetch(soundfontUrl(id))
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to load soundfont (${res.status}): ${soundfontUrl(id)}`)
      const buf = await res.arrayBuffer()
      bufferCache.set(id, buf)
      inflight.delete(id)
      return buf
    })
    .catch((err) => {
      inflight.delete(id)
      throw err
    })
  inflight.set(id, p)
  return p
}

/**
 * Fetch the SF2 and return a **fresh copy** for the synth.
 * SpessaSynth `addSoundBank` transfers the buffer to the worklet (neutering it),
 * so callers must never reuse the cached instance directly.
 */
export async function loadSoundfontBuffer(id: TagRollSoundfontId): Promise<ArrayBuffer> {
  const buf = await prefetchSoundfont(id)
  return buf.slice(0)
}
