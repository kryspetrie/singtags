/**
 * MediaRecorder helpers for Labs Audio Recorder capture.
 */
import {
  DEFAULT_RECORDER_CAPTURE,
  type RecorderCapturePrefs,
  type RecorderChannels,
} from '../types/recorder'

/** Chromium / Firefox order — WebM Opus is reliable. */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const

/**
 * Safari / iOS: prefer MP4/AAC. Safari 18.4+ may report WebM Opus as supported
 * via `isTypeSupported`, but recorded blob playback / duration probes often fail.
 */
const MIME_CANDIDATES_SAFARI = [
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const

/**
 * True for Apple WebKit browsers (Safari, iOS Chrome/Firefox shells) where
 * recorded WebM Opus is less reliable than MP4/AAC for in-app playback.
 */
export function prefersSafariRecorderMp4(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iP(hone|ad|od)/i.test(ua)) return true
  // Desktop Safari (not Chrome/Edge/Opera/Firefox, which also include "Safari" in UA).
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/i.test(ua)
}

function mimeCandidates(): readonly string[] {
  return prefersSafariRecorderMp4() ? MIME_CANDIDATES_SAFARI : MIME_CANDIDATES
}

/** First supported mime from preferred + fallbacks. */
export function pickSupportedRecorderMime(preferred?: string): string {
  const candidates = mimeCandidates()
  // On Safari, do not honor a preferred WebM — `isTypeSupported` can lie.
  const honorPreferred =
    preferred && !(prefersSafariRecorderMp4() && /webm/i.test(preferred)) ? preferred : undefined
  const ordered = honorPreferred
    ? [honorPreferred, ...candidates.filter((m) => m !== honorPreferred)]
    : [...candidates]
  if (typeof MediaRecorder === 'undefined') {
    return honorPreferred || (prefersSafariRecorderMp4() ? 'audio/mp4' : 'audio/webm')
  }
  for (const mime of ordered) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime
    } catch {
      /* ignore */
    }
  }
  return honorPreferred || (prefersSafariRecorderMp4() ? 'audio/mp4' : 'audio/webm')
}

export function recorderMimeChoices(): Array<{ value: string; label: string; supported: boolean }> {
  const labels: Record<string, string> = {
    'audio/webm;codecs=opus': 'WebM Opus',
    'audio/webm': 'WebM',
    'audio/mp4': 'MP4 / M4A',
    'audio/ogg;codecs=opus': 'Ogg Opus',
    'audio/ogg': 'Ogg',
  }
  return mimeCandidates().map((value) => {
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

export {
  createInputLevelMeter,
  createLiveInputMeter,
  linearToDb,
  dbToMeterRatio,
  type LiveInputMeter,
  type LiveMeterSnapshot,
} from './liveMeter'
