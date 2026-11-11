/**
 * Load tuner-capture AudioWorklet (public URL → blob fallback).
 * Mirrors SpessaSynth / soundfonts worklet hosting rules — no Vite ?url.
 */

const WORKLET_NAME = 'tuner-capture'
const PUBLIC_URL = `${import.meta.env.BASE_URL}worklets/tuner-capture.js`.replace(/\/{2,}/g, '/')

/** Strip sourceMappingURL so blob modules do not 404 looking for maps. */
function stripSourceMappingUrl(src: string): string {
  return src.replace(/\/\/[#@]\s*sourceMappingURL=.*$/gm, '')
}

/**
 * Ensure `tuner-capture` is registered on `ctx.audioWorklet`.
 * Tries public URL first; falls back to fetched blob URL.
 */
export async function ensureTunerCaptureWorklet(ctx: AudioContext): Promise<void> {
  const aw = ctx.audioWorklet
  if (!aw) throw new Error('AudioWorklet is not available in this browser.')

  try {
    await aw.addModule(PUBLIC_URL)
    return
  } catch {
    /* fall through to blob */
  }

  const res = await fetch(PUBLIC_URL)
  if (!res.ok) throw new Error(`Could not load tuner worklet (${res.status}).`)
  const text = stripSourceMappingUrl(await res.text())
  const blob = new Blob([text], { type: 'application/javascript' })
  const blobUrl = URL.createObjectURL(blob)
  try {
    await aw.addModule(blobUrl)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

export { WORKLET_NAME as TUNER_CAPTURE_WORKLET_NAME }
