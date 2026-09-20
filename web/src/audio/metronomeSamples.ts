/**
 * Metronome click sample pairs for Tag Studio (downbeat vs other beats).
 * Files live at `/instruments/metronome/{id}-down.wav` and `-up.wav`.
 */
export type MetronomeSoundId = '3000' | 'asrx' | 'sp1200' | 'zoom-st'

export type MetronomeSoundPair = {
  id: MetronomeSoundId
  label: string
  /** Downbeat (beat 1 of the measure). */
  downFile: string
  /** Other beats in the measure. */
  upFile: string
}

export const METRONOME_SOUND_PAIRS: readonly MetronomeSoundPair[] = [
  { id: '3000', label: '3000', downFile: '3000-down.wav', upFile: '3000-up.wav' },
  { id: 'asrx', label: 'ASRX', downFile: 'asrx-down.wav', upFile: 'asrx-up.wav' },
  { id: 'sp1200', label: 'SP-1200', downFile: 'sp1200-down.wav', upFile: 'sp1200-up.wav' },
  { id: 'zoom-st', label: 'Zoom ST', downFile: 'zoom-st-down.wav', upFile: 'zoom-st-up.wav' },
]

export const DEFAULT_METRONOME_SOUND_ID: MetronomeSoundId = 'sp1200'

export function isMetronomeSoundId(v: unknown): v is MetronomeSoundId {
  return typeof v === 'string' && METRONOME_SOUND_PAIRS.some((p) => p.id === v)
}

export function metronomeSoundPair(id: string | null | undefined): MetronomeSoundPair {
  const found = METRONOME_SOUND_PAIRS.find((p) => p.id === id)
  return found ?? METRONOME_SOUND_PAIRS.find((p) => p.id === DEFAULT_METRONOME_SOUND_ID)!
}

export function metronomeSampleUrl(file: string): string {
  const root = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? String(import.meta.env.BASE_URL)
    : '/'
  const base = root.endsWith('/') ? root : `${root}/`
  return `${base}instruments/metronome/${file}`
}
