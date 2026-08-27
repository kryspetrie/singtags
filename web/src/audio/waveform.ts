/**
 * Procedural + optional decoded peaks for waveform display (music-website style).
 */

import { getSharedAudioContext, resumeAudioContextBestEffort } from './channelSolo'

/** Seeded pseudo-random in [0,1). */
function hash01(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/** Synthetic bar heights 0–1, stable for a given seed (e.g. URL). */
export function syntheticPeaks(count: number, seed: string): number[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const x = i / Math.max(1, count - 1)
    const base =
      Math.sin(x * Math.PI * 8 + h) * 0.3 +
      Math.sin(x * Math.PI * 16 + h * 0.1) * 0.2 +
      Math.sin(x * Math.PI * 32) * 0.15 +
      Math.sin(x * Math.PI * 64) * 0.1
    const variation = (hash01(h + i * 17) - 0.5) * 0.35
    out.push(Math.min(1, Math.max(0.12, (base + variation + 1) / 2)))
  }
  return out
}

/** Downsample an AudioBuffer to peak magnitudes 0–1. */
export function peaksFromAudioBuffer(buffer: AudioBuffer, bars: number): number[] {
  const ch0 = buffer.getChannelData(0)
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null
  const block = Math.max(1, Math.floor(ch0.length / bars))
  const out: number[] = []
  for (let i = 0; i < bars; i++) {
    const start = i * block
    const end = Math.min(ch0.length, start + block)
    let peak = 0
    for (let j = start; j < end; j++) {
      const a = Math.abs(ch0[j]!)
      const b = ch1 ? Math.abs(ch1[j]!) : 0
      peak = Math.max(peak, a, b)
    }
    out.push(Math.min(1, peak * 1.15))
  }
  return out
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    p.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      },
    )
  })
}

export async function loadWaveformPeaks(
  url: string,
  bars = 256,
  signal?: AbortSignal,
): Promise<{ peaks: number[]; channels: number }> {
  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    // Reuse one shared context — creating/closing a context per load exhausts the browser limit.
    const ctx = getSharedAudioContext()
    await resumeAudioContextBestEffort(ctx)
    const res = await withTimeout(fetch(url, { signal }), 15_000, 'Waveform fetch')
    if (!res.ok) throw new Error(String(res.status))
    const buf = await res.arrayBuffer()
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const decoded = await withTimeout(ctx.decodeAudioData(buf.slice(0)), 20_000, 'Waveform decode')
    return {
      peaks: peaksFromAudioBuffer(decoded, bars),
      channels: decoded.numberOfChannels,
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    // Always show *something* so refresh never leaves an empty/spinner waveform.
    return { peaks: syntheticPeaks(bars, url), channels: 2 }
  }
}
