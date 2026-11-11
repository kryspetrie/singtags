/**
 * Digital Tuner mic capture lifecycle — dedicated AudioContext + worklet frames.
 * Heavy DSP (YIN / FFT / multi-F0) runs in a Worker via tunerDspClient.
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
import type { TunerDspClient } from '../audio/tuner/tunerDspClient'
import type { TunerDspConfig, TunerDspResult } from '../audio/tuner/tunerDspProtocol'
import {
  createSmoothLivePitchState,
  resetSmoothLivePitch,
  smoothLivePitch,
} from '../domain/tuner/smoothLivePitch'

/** How often Hz / cents / note publish to the UI (smoothing still runs every result). */
const UI_PUBLISH_MS = 120

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
  /** Hysteresis-stable MIDI for note naming; null when no pitch. */
  displayMidi: number | null
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
  /** Analysis pitch band (from prefs pitch range). */
  fMinHz?: number
  fMaxHz?: number
}

function dbToRms(db: number): number {
  return Math.pow(10, db / 20)
}

export function useTunerCapture() {
  const running = ref(false)
  const errorKind = ref<TunerCaptureErrorKind | null>(null)
  const errorMessage = ref<string | null>(null)
  const reading = shallowRef<TunerPitchReading>({
    hz: null,
    clarity: 0,
    level: 0,
    displayMidi: null,
  })
  const devices = ref<MediaDeviceInfo[]>([])
  const deviceId = ref<string | null>(null)
  /** When true, frames update level only — F0 held/cleared (reference tone). */
  const suppressDetection = ref(false)

  type DspListener = (result: TunerDspResult) => void
  const dspListeners = new Set<DspListener>()

  let ctx: AudioContext | null = null
  let stream: MediaStream | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let compressor: DynamicsCompressorNode | null = null
  let worklet: AudioWorkletNode | null = null
  let muted: GainNode | null = null
  let keepalive: AudioKeepalive | null = null
  let analysis: TunerCaptureAnalysisOpts = {
    clarityMin: 0.42,
    holdMs: 400,
    fMinHz: 55,
    fMaxHz: 1200,
  }
  let lastGood: TunerPitchReading | null = null
  let holdUntilMs = 0
  let lastPublishMs = 0
  let smooth = createSmoothLivePitchState()
  let a4ForSmooth = 440
  let onVisibility: (() => void) | null = null
  let onStateChange: (() => void) | null = null
  let dsp: TunerDspClient | null = null
  let dspLoading: Promise<TunerDspClient> | null = null
  let pendingDspConfig: Partial<TunerDspConfig> = {}
  let startGen = 0

  function publishReading(next: TunerPitchReading, force: boolean): void {
    const now = performance.now()
    if (
      !force &&
      next.hz != null &&
      reading.value.hz != null &&
      now - lastPublishMs < UI_PUBLISH_MS
    ) {
      // Keep pitch text stable; still refresh the level meter.
      reading.value = { ...reading.value, level: next.level }
      return
    }
    lastPublishMs = now
    reading.value = next
  }

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

  function resolveRmsGate(): number | undefined {
    if (typeof analysis.rmsGate === 'number' && analysis.rmsGate > 0) return analysis.rmsGate
    if (typeof analysis.noiseGateDb === 'number' && Number.isFinite(analysis.noiseGateDb)) {
      return dbToRms(analysis.noiseGateDb)
    }
    return undefined
  }

  function syncDspAnalysisConfig(): void {
    const rmsGate = resolveRmsGate()
    dsp?.setConfig({
      rmsGate,
      suppressDetection: suppressDetection.value,
      a4Hz: a4ForSmooth,
    })
  }

  function setAnalysisOpts(opts: TunerCaptureAnalysisOpts): void {
    analysis = { ...analysis, ...opts }
    syncDspAnalysisConfig()
  }

  function setSmoothA4Hz(hz: number): void {
    if (Number.isFinite(hz) && hz > 0) a4ForSmooth = hz
    dsp?.setConfig({ a4Hz: a4ForSmooth })
  }

  function setSuppressDetection(on: boolean): void {
    suppressDetection.value = on
    dsp?.setConfig({ suppressDetection: on })
    if (on) {
      publishReading(
        {
          hz: null,
          clarity: 0,
          level: reading.value.level,
          displayMidi: null,
        },
        true,
      )
      lastGood = null
      resetSmoothLivePitch(smooth)
    }
  }

  function applyMonoResult(result: TunerDspResult): void {
    const level = result.level
    if (result.mono == null) {
      publishReading({ hz: null, clarity: 0, level, displayMidi: null }, true)
      return
    }
    const { hz, clarity } = result.mono
    const clarityMin = analysis.clarityMin ?? 0.42
    const holdMs = analysis.holdMs ?? 400
    const now = performance.now()
    // Prefs pitch-range gate — brief out-of-band locks don't steal the note.
    const fMin = analysis.fMinHz ?? 55
    const fMax = analysis.fMaxHz ?? 1200
    const inBand = hz != null && hz >= fMin && hz <= fMax
    if (hz != null && inBand && clarity >= clarityMin) {
      const smoothed = smoothLivePitch(smooth, { hz, clarity }, { a4Hz: a4ForSmooth })
      lastGood = {
        hz: smoothed.hz,
        clarity: smoothed.clarity,
        level,
        displayMidi: smoothed.displayMidi,
      }
      holdUntilMs = now + holdMs
      publishReading(lastGood, false)
      return
    }
    if (lastGood && now < holdUntilMs) {
      publishReading({ ...lastGood, level }, false)
      return
    }
    resetSmoothLivePitch(smooth)
    lastGood = null
    publishReading({ hz: null, clarity: 0, level, displayMidi: null }, true)
  }

  function onDspResult(result: TunerDspResult): void {
    applyMonoResult(result)
    for (const fn of dspListeners) {
      try {
        fn(result)
      } catch {
        /* ignore */
      }
    }
  }

  async function ensureDsp(): Promise<TunerDspClient> {
    if (dsp) {
      syncDspAnalysisConfig()
      return dsp
    }
    if (!dspLoading) {
      dspLoading = import('../audio/tuner/tunerDspClient').then(({ createTunerDspClient }) => {
        const client = createTunerDspClient(onDspResult)
        if (Object.keys(pendingDspConfig).length) client.setConfig(pendingDspConfig)
        dsp = client
        syncDspAnalysisConfig()
        return client
      })
    }
    return dspLoading
  }

  function setDspConfig(partial: Partial<TunerDspConfig>): void {
    pendingDspConfig = { ...pendingDspConfig, ...partial }
    dsp?.setConfig(partial)
  }

  function recomputeFft(): void {
    if (dsp) {
      dsp.recomputeFft()
      return
    }
    void ensureDsp().then((client) => client.recomputeFft())
  }

  /** Prefetch DSP worker after route mount (idle). */
  function warmupDsp(): void {
    void ensureDsp().then((client) => client.warmup())
  }

  async function refreshDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      devices.value = []
      return
    }
    const list = await navigator.mediaDevices.enumerateDevices()
    devices.value = list.filter((d) => d.kind === 'audioinput')
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
    const gen = ++startGen
    errorKind.value = null
    errorMessage.value = null
    await stop()
    if (gen !== startGen) return
    try {
      const dspClient = await ensureDsp()
      if (gen !== startGen) return
      dspClient.warmup()
      ctx = createInteractiveAudioContext()
      await ctx.resume()
      if (gen !== startGen) {
        await stop()
        return
      }
      keepalive = ensureAudioKeepalive(ctx, keepalive)
      await ensureTunerCaptureWorklet(ctx)
      if (gen !== startGen) {
        await stop()
        return
      }

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
      compressor = ctx.createDynamicsCompressor()
      // Soft make-up compression so quiet / loud singing both feed F0 cleanly.
      compressor.threshold.value = -28
      compressor.knee.value = 18
      compressor.ratio.value = 6
      compressor.attack.value = 0.005
      compressor.release.value = 0.12
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
        dsp?.pushFrame(data.samples, sr)
      }
      source.connect(compressor)
      compressor.connect(worklet)
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
    publishReading({ hz: null, clarity: 0, level: 0, displayMidi: null }, true)
    lastGood = null
    holdUntilMs = 0
    resetSmoothLivePitch(smooth)
    unbindLifecycle()
    dsp?.reset()
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
      compressor?.disconnect()
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
    compressor = null
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
    dsp?.dispose()
    dsp = null
    dspLoading = null
  })

  function addDspListener(fn: DspListener): () => void {
    dspListeners.add(fn)
    return () => {
      dspListeners.delete(fn)
    }
  }

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
    setSmoothA4Hz,
    setSuppressDetection,
    setDspConfig,
    recomputeFft,
    warmupDsp,
    resumeIfNeeded,
    addDspListener,
  }
}
