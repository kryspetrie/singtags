/**
 * MediaRecorder helpers for Labs Audio Recorder capture.
 */
import {
  DEFAULT_RECORDER_CAPTURE,
  type RecorderCapturePrefs,
  type RecorderChannels,
} from '../types/recorder'

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const

/** First supported mime from preferred + fallbacks. */
export function pickSupportedRecorderMime(preferred?: string): string {
  const ordered = preferred
    ? [preferred, ...MIME_CANDIDATES.filter((m) => m !== preferred)]
    : [...MIME_CANDIDATES]
  if (typeof MediaRecorder === 'undefined') return preferred || 'audio/webm'
  for (const mime of ordered) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime
    } catch {
      /* ignore */
    }
  }
  return preferred || 'audio/webm'
}

export function recorderMimeChoices(): Array<{ value: string; label: string; supported: boolean }> {
  const labels: Record<string, string> = {
    'audio/webm;codecs=opus': 'WebM Opus',
    'audio/webm': 'WebM',
    'audio/mp4': 'MP4 / M4A',
    'audio/ogg;codecs=opus': 'Ogg Opus',
    'audio/ogg': 'Ogg',
  }
  return MIME_CANDIDATES.map((value) => {
    let supported = false
    try {
      supported = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(value)
    } catch {
      supported = false
    }
    return { value, label: labels[value] ?? value, supported }
  })
}

export async function listAudioInputDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'audioinput')
}

export async function openRecorderStream(prefs: RecorderCapturePrefs): Promise<MediaStream> {
  const music = prefs.processing !== 'voice'
  const audio: MediaTrackConstraints = {
    channelCount: { ideal: prefs.channels },
    // Singing default: leave processing off so AEC/NS don't carve into pitch.
    echoCancellation: music ? false : true,
    noiseSuppression: music ? false : true,
    autoGainControl: music ? false : true,
  }
  if (prefs.deviceId) audio.deviceId = { exact: prefs.deviceId }
  return navigator.mediaDevices.getUserMedia({ audio })
}

export type ActiveRecording = {
  recorder: MediaRecorder
  stream: MediaStream
  mimeType: string
  startedAt: number
  /** Wall-clock ms accumulated while paused (for elapsed display). */
  pausedAccumMs: number
  pauseStartedAt: number | null
  stop: () => Promise<{ blob: Blob; mimeType: string; durationSec: number }>
  cancel: () => void
  pause: () => boolean
  resume: () => boolean
  isPaused: () => boolean
  /** Elapsed recording time in seconds (excludes pause). */
  elapsedSec: () => number
}

/**
 * Start recording. Caller must eventually stop() or cancel() to release the mic.
 */
export function startRecorderCapture(
  stream: MediaStream,
  prefs: RecorderCapturePrefs = DEFAULT_RECORDER_CAPTURE,
): ActiveRecording {
  const mimeType = pickSupportedRecorderMime(prefs.mimeType)
  const chunks: BlobPart[] = []
  const options: MediaRecorderOptions = { mimeType }
  if (prefs.bitRate > 0) options.audioBitsPerSecond = prefs.bitRate

  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, options)
  } catch {
    recorder = new MediaRecorder(stream)
  }

  const actualMime = recorder.mimeType || mimeType
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data)
  }

  const startedAt = performance.now()
  let pausedAccumMs = 0
  let pauseStartedAt: number | null = null
  recorder.start(250)

  let settled = false

  const releaseStream = () => {
    for (const track of stream.getTracks()) track.stop()
  }

  const elapsedSec = () => {
    const now = performance.now()
    const pausedExtra = pauseStartedAt != null ? now - pauseStartedAt : 0
    return Math.max(0, (now - startedAt - pausedAccumMs - pausedExtra) / 1000)
  }

  const pause = () => {
    if (settled || recorder.state !== 'recording') return false
    if (typeof recorder.pause !== 'function') return false
    try {
      recorder.pause()
      pauseStartedAt = performance.now()
      return true
    } catch {
      return false
    }
  }

  const resume = () => {
    if (settled || recorder.state !== 'paused') return false
    if (typeof recorder.resume !== 'function') return false
    try {
      recorder.resume()
      if (pauseStartedAt != null) {
        pausedAccumMs += performance.now() - pauseStartedAt
        pauseStartedAt = null
      }
      return true
    } catch {
      return false
    }
  }

  const isPaused = () => recorder.state === 'paused'

  const stop = () =>
    new Promise<{ blob: Blob; mimeType: string; durationSec: number }>((resolve, reject) => {
      if (settled) {
        reject(new Error('Recording already finished'))
        return
      }
      settled = true
      if (pauseStartedAt != null) {
        pausedAccumMs += performance.now() - pauseStartedAt
        pauseStartedAt = null
      }
      const onStop = () => {
        const durationSec = Math.max(0, (performance.now() - startedAt - pausedAccumMs) / 1000)
        const blob = new Blob(chunks, { type: actualMime })
        releaseStream()
        resolve({ blob, mimeType: actualMime, durationSec })
      }
      recorder.addEventListener('stop', onStop, { once: true })
      recorder.addEventListener(
        'error',
        () => {
          releaseStream()
          reject(new Error('MediaRecorder error'))
        },
        { once: true },
      )
      try {
        if (recorder.state !== 'inactive') recorder.stop()
        else onStop()
      } catch (e) {
        releaseStream()
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })

  const cancel = () => {
    if (settled) return
    settled = true
    try {
      if (recorder.state !== 'inactive') recorder.stop()
    } catch {
      /* ignore */
    }
    releaseStream()
  }

  return {
    recorder,
    stream,
    mimeType: actualMime,
    startedAt,
    get pausedAccumMs() {
      return pausedAccumMs
    },
    get pauseStartedAt() {
      return pauseStartedAt
    },
    stop,
    cancel,
    pause,
    resume,
    isPaused,
    elapsedSec,
  }
}

export function channelsFromStream(stream: MediaStream): RecorderChannels {
  const track = stream.getAudioTracks()[0]
  const settings = track?.getSettings?.()
  return settings?.channelCount === 2 ? 2 : 1
}

/** Simple peak level meter for a live mic stream (0–1). Call dispose() when done. */
export function createInputLevelMeter(stream: MediaStream): {
  /** Current peak (0–1), updated ~rAF. */
  getLevel: () => number
  dispose: () => void
} {
  let level = 0
  let disposed = false
  let raf = 0
  let ctx: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let analyser: AnalyserNode | null = null

  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return { getLevel: () => 0, dispose: () => undefined }
    ctx = new AC()
    source = ctx.createMediaStreamSource(stream)
    analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.6
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      if (disposed || !analyser) return
      analyser.getByteTimeDomainData(data)
      let peak = 0
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]! - 128) / 128
        if (v > peak) peak = v
      }
      level = peak
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  } catch {
    /* meter optional */
  }

  return {
    getLevel: () => level,
    dispose: () => {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      try {
        source?.disconnect()
      } catch {
        /* ignore */
      }
      try {
        void ctx?.close()
      } catch {
        /* ignore */
      }
      source = null
      analyser = null
      ctx = null
    },
  }
}
