/**
 * Digital Tuner mic capture lifecycle — dedicated AudioContext + worklet frames.
 * Dispose on route leave. Does not reuse liveMeter's private context.
 */
import { onUnmounted, ref, shallowRef } from 'vue'
import {
  createInteractiveAudioContext,
  ensureAudioKeepalive,
  stopAudioKeepalive,
  type AudioKeepalive,
} from '../audio/interactiveAudioContext'
import {
  ensureTunerCaptureWorklet,
  TUNER_CAPTURE_WORKLET_NAME,
} from '../audio/tuner/loadTunerWorklet'
import { liveMonoF0 } from '../audio/tuner/liveMonoF0'

export type TunerCaptureErrorKind =
  | 'denied'
  | 'not-found'
  | 'secure'
  | 'worklet'
  | 'conflict'
  | 'suspended'
  | 'other'

export type TunerPitchReading = {
  hz: number | null
  clarity: number
  level: number
}

export type TunerCaptureAnalysisOpts = {
  /** Amplitude RMS gate; overrides noiseGateDb when set. */
  rmsGate?: number
  /** dBFS-ish amplitude gate (10^(db/20)); null = default estimator gate. */
  noiseGateDb?: number | null
  /** Minimum clarity to accept a new pitch (else hold-last-good). */
  clarityMin?: number
  /** ms to keep last good pitch after clarity drops. */
  holdMs?: number
}

function dbToRms(db: number): number {
  return Math.pow(10, db / 20)
}

export function useTunerCapture() {
  const running = ref(false)
  const errorKind = ref<TunerCaptureErrorKind | null>(null)
  const errorMessage = ref<string | null>(null)
  const reading = shallowRef<TunerPitchReading>({ hz: null, clarity: 0, level: 0 })
  const devices = ref<MediaDeviceInfo[]>([])
  const deviceId = ref<string | null>(null)
  /** When true, frames update level only — F0 held/cleared (reference tone). */
  const suppressDetection = ref(false)

  let ctx: AudioContext | null = null
  let stream: MediaStream | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let worklet: AudioWorkletNode | null = null
  let muted: GainNode | null = null
  let keepalive: AudioKeepalive | null = null
  let analysis: TunerCaptureAnalysisOpts = { clarityMin: 0.45, holdMs: 280 }
  let lastGood: TunerPitchReading | null = null
  let holdUntilMs = 0
  let onVisibility: (() => void) | null = null
  let onStateChange: (() => void) | null = null

  function mapGetUserMediaError(e: unknown): { kind: TunerCaptureErrorKind; message: string } {
    const name = e instanceof DOMException ? e.name : ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return {
        kind: 'denied',
        message: 'Microphone permission denied. Allow the mic in browser settings, then retry.',
      }
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return { kind: 'not-found', message: 'No microphone found on this device.' }
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        kind: 'conflict',
        message:
          'Microphone is busy (another tab or Recorder may be using it). Stop the other capture, then retry.',
      }
    }
    if (name === 'SecurityError') {
      return {
        kind: 'secure',
        message: 'Microphone requires a secure context (HTTPS or localhost).',
      }
    }
    return {
      kind: 'other',
      message: e instanceof Error ? e.message : 'Could not open the microphone.',
    }
  }

  function setAnalysisOpts(opts: TunerCaptureAnalysisOpts): void {
    analysis = { ...analysis, ...opts }
  }

  function setSuppressDetection(on: boolean): void {
    suppressDetection.value = on
    if (on) {
      reading.value = { hz: null, clarity: 0, level: reading.value.level }
      lastGood = null
    }
  }

  async function refreshDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      devices.value = []
      return
    }
    const list = await navigator.mediaDevices.enumerateDevices()
    devices.value = list.filter((d) => d.kind === 'audioinput')
  }

  function resolveRmsGate(): number | undefined {
    if (typeof analysis.rmsGate === 'number' && analysis.rmsGate > 0) return analysis.rmsGate
    if (typeof analysis.noiseGateDb === 'number' && Number.isFinite(analysis.noiseGateDb)) {
      return dbToRms(analysis.noiseGateDb)
    }
    return undefined
  }

  function bindLifecycle(): void {
    unbindLifecycle()
    onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      void resumeIfNeeded()
    }
    document.addEventListener('visibilitychange', onVisibility)
    if (ctx) {
      onStateChange = () => {
        if (ctx?.state === 'suspended' && running.value) {
          errorKind.value = 'suspended'
          errorMessage.value = 'Audio paused — tap Retry to resume the tuner.'
        }
      }
      ctx.addEventListener('statechange', onStateChange)
    }
  }

  function unbindLifecycle(): void {
    if (onVisibility) {
      document.removeEventListener('visibilitychange', onVisibility)
      onVisibility = null
    }
    if (ctx && onStateChange) {
      ctx.removeEventListener('statechange', onStateChange)
      onStateChange = null
    }
  }

  async function resumeIfNeeded(): Promise<void> {
    if (!ctx || !running.value) return
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
        errorKind.value = null
        errorMessage.value = null
      } catch {
        errorKind.value = 'suspended'
        errorMessage.value = 'Audio paused — tap Retry to resume the tuner.'
      }
    }
  }

  function onTrackEnded(): void {
    if (!running.value) return
    errorKind.value = 'conflict'
    errorMessage.value =
      'Microphone track ended. Another app may have taken the mic — tap Retry.'
    void stop()
  }

  async function start(opts?: { deviceId?: string | null }): Promise<void> {
    errorKind.value = null
    errorMessage.value = null
    await stop()
    try {
      ctx = createInteractiveAudioContext()
      await ctx.resume()
      keepalive = ensureAudioKeepalive(ctx, keepalive)
      await ensureTunerCaptureWorklet(ctx)

      const preferred = opts?.deviceId || deviceId.value
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          ...(preferred ? { deviceId: { exact: preferred } } : {}),
        },
        video: false,
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (e) {
        // Exact device may be gone — retry default.
        if (preferred) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
            video: false,
          })
        } else {
          throw e
        }
      }
      deviceId.value = stream.getAudioTracks()[0]?.getSettings().deviceId ?? deviceId.value
      for (const t of stream.getAudioTracks()) {
        t.addEventListener('ended', onTrackEnded)
      }
      await refreshDevices()

      source = ctx.createMediaStreamSource(stream)
      worklet = new AudioWorkletNode(ctx, TUNER_CAPTURE_WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { hopSize: 1024 },
      })
      muted = ctx.createGain()
      muted.gain.value = 0
      worklet.port.onmessage = (ev: MessageEvent) => {
        const data = ev.data as { type?: string; samples?: Float32Array; sampleRate?: number }
        if (data?.type !== 'frame' || !data.samples) return
        const sr = data.sampleRate || ctx?.sampleRate || 48000
        let sumSq = 0
        for (let i = 0; i < data.samples.length; i++) sumSq += data.samples[i]! ** 2
        const level = Math.min(1, Math.sqrt(sumSq / data.samples.length) * 4)
        if (suppressDetection.value) {
          reading.value = { hz: null, clarity: 0, level }
          return
        }
        const rmsGate = resolveRmsGate()
        const { hz, clarity } = liveMonoF0(data.samples, sr, {
          ...(rmsGate != null ? { rmsGate } : {}),
        })
        const clarityMin = analysis.clarityMin ?? 0.45
        const holdMs = analysis.holdMs ?? 280
        const now = performance.now()
        if (hz != null && clarity >= clarityMin) {
          lastGood = { hz, clarity, level }
          holdUntilMs = now + holdMs
          reading.value = { hz, clarity, level }
          return
        }
        if (lastGood && now < holdUntilMs) {
          reading.value = { ...lastGood, level }
          return
        }
        reading.value = { hz: null, clarity: 0, level }
      }
      source.connect(worklet)
      worklet.connect(muted)
      muted.connect(ctx.destination)
      running.value = true
      bindLifecycle()
    } catch (e) {
      const mapped = mapGetUserMediaError(e)
      if (
        e instanceof Error &&
        /worklet|AudioWorklet/i.test(e.message) &&
        mapped.kind === 'other'
      ) {
        errorKind.value = 'worklet'
        errorMessage.value = e.message
      } else {
        errorKind.value = mapped.kind
        errorMessage.value = mapped.message
      }
      await stop()
    }
  }

  async function stop(): Promise<void> {
    running.value = false
    reading.value = { hz: null, clarity: 0, level: 0 }
    lastGood = null
    holdUntilMs = 0
    unbindLifecycle()
    try {
      worklet?.port.close()
    } catch {
      /* ignore */
    }
    try {
      worklet?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      source?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      muted?.disconnect()
    } catch {
      /* ignore */
    }
    worklet = null
    source = null
    muted = null
    if (stream) {
      for (const t of stream.getTracks()) {
        t.removeEventListener('ended', onTrackEnded)
        t.stop()
      }
      stream = null
    }
    stopAudioKeepalive(keepalive)
    keepalive = null
    if (ctx) {
      try {
        await ctx.close()
      } catch {
        /* ignore */
      }
      ctx = null
    }
  }

  onUnmounted(() => {
    void stop()
  })

  return {
    running,
    errorKind,
    errorMessage,
    reading,
    devices,
    deviceId,
    suppressDetection,
    start,
    stop,
    refreshDevices,
    setAnalysisOpts,
    setSuppressDetection,
    resumeIfNeeded,
  }
}
