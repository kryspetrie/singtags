/**
 * Probe duration of an audio blob/array buffer (mix track length for set list cards).
 */
export async function probeAudioDurationSeconds(
  data: ArrayBuffer,
  mime?: string,
): Promise<number | null> {
  if (!data.byteLength) return null
  // Prefer WebAudio decode when available (accurate, works offline).
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AC) {
      const ctx = new AC()
      try {
        const copy = data.slice(0)
        const buf = await ctx.decodeAudioData(copy)
        const sec = buf.duration
        return Number.isFinite(sec) && sec > 0 ? sec : null
      } finally {
        void ctx.close()
      }
    }
  } catch {
    /* fall through to element probe */
  }
  return probeViaElement(data, mime)
}

function probeViaElement(data: ArrayBuffer, mime?: string): Promise<number | null> {
  return new Promise((resolve) => {
    const blob = new Blob([data], { type: mime || 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio()
    let settled = false
    const done = (sec: number | null) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      audio.removeAttribute('src')
      audio.load()
      resolve(sec)
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const sec = audio.duration
      done(Number.isFinite(sec) && sec > 0 ? sec : null)
    }
    audio.onerror = () => done(null)
    window.setTimeout(() => done(null), 4000)
    audio.src = url
  })
}

/** Format seconds as `m:ss` (or `h:mm:ss` when ≥ 1h). */
export function formatTrackDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return ''
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
