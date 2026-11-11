/**
 * Main-thread host for tuner DSP. Prefers a module Worker; falls back to a
 * dynamically imported engine on the main thread when Worker fails.
 *
 * Frames are coalesced: if the worker is busy, only the latest hop is kept.
 * The Worker (and FFT/YIN code) is not constructed until the first frame / warmup.
 */
import type { TunerDspEngine } from './tunerDspEngine'
import type {
  TunerDspConfig,
  TunerDspFromWorker,
  TunerDspResult,
  TunerDspToWorker,
} from './tunerDspProtocol'

export type TunerDspClient = {
  setConfig: (partial: Partial<TunerDspConfig>) => void
  pushFrame: (samples: Float32Array, sampleRate: number) => void
  recomputeFft: () => void
  reset: () => void
  /** Prefetch/parse the worker module without waiting for mic frames. */
  warmup: () => void
  dispose: () => void
  /** True when running inside a Worker (not sync fallback). */
  readonly usingWorker: boolean
}

type ResultListener = (result: TunerDspResult) => void

export function createTunerDspClient(onResult: ResultListener): TunerDspClient {
  let seq = 0
  let disposed = false
  let worker: Worker | null = null
  let workerFailed = false
  let busy = false
  let pending: { samples: Float32Array; sampleRate: number } | null = null
  let lastSampleRate = 48000
  let queuedConfig: Partial<TunerDspConfig> = {}
  let engine: TunerDspEngine | null = null
  let engineLoading: Promise<TunerDspEngine> | null = null

  function deliver(result: TunerDspResult): void {
    if (disposed) return
    try {
      onResult(result)
    } catch {
      /* ignore listener errors */
    }
  }

  function ensureWorker(): Worker | null {
    if (workerFailed || disposed) return null
    if (worker) return worker
    if (typeof Worker === 'undefined') {
      workerFailed = true
      return null
    }
    try {
      worker = new Worker(new URL('./tunerDsp.worker.ts', import.meta.url), {
        type: 'module',
      })
      worker.onmessage = (ev: MessageEvent<TunerDspFromWorker>) => {
        const msg = ev.data
        if (msg.type === 'result') {
          deliver(msg.result)
          busy = false
          flushPending()
          return
        }
        if (msg.type === 'idle') {
          busy = false
          flushPending()
          return
        }
        if (msg.type === 'error') {
          console.warn('[tunerDsp]', msg.message)
          busy = false
          flushPending()
        }
      }
      worker.onerror = (err) => {
        console.warn('[tunerDsp] worker error — falling back to main thread', err)
        workerFailed = true
        busy = false
        try {
          worker?.terminate()
        } catch {
          /* ignore */
        }
        worker = null
        flushPending()
      }
      if (Object.keys(queuedConfig).length) {
        worker.postMessage({
          type: 'config',
          config: queuedConfig,
        } satisfies TunerDspToWorker)
      }
      return worker
    } catch (err) {
      console.warn('[tunerDsp] worker unavailable', err)
      workerFailed = true
      return null
    }
  }

  function loadEngine(): Promise<TunerDspEngine> {
    if (engine) return Promise.resolve(engine)
    if (!engineLoading) {
      engineLoading = import('./tunerDspEngine').then((mod) => {
        const next = new mod.TunerDspEngine()
        next.setConfig(queuedConfig)
        engine = next
        return next
      })
    }
    return engineLoading
  }

  function flushPending(): void {
    if (disposed || !pending) return
    const next = pending
    pending = null
    sendFrame(next.samples, next.sampleRate)
  }

  function sendFrame(samples: Float32Array, sampleRate: number): void {
    lastSampleRate = sampleRate
    const w = ensureWorker()
    const id = ++seq
    // Always copy — worklet may reuse/transfer its buffer; sync path is async.
    const copy = new Float32Array(samples)
    if (w) {
      busy = true
      const msg: TunerDspToWorker = {
        type: 'frame',
        seq: id,
        sampleRate,
        samples: copy,
      }
      w.postMessage(msg, [copy.buffer])
      return
    }
    busy = true
    void loadEngine()
      .then((eng) => {
        if (disposed) return
        deliver(eng.processFrame(copy, sampleRate, id, performance.now()))
      })
      .catch((err) => {
        console.warn('[tunerDsp] sync engine failed', err)
      })
      .finally(() => {
        busy = false
        flushPending()
      })
  }

  function setConfig(partial: Partial<TunerDspConfig>): void {
    queuedConfig = { ...queuedConfig, ...partial }
    engine?.setConfig(partial)
    if (worker) {
      worker.postMessage({ type: 'config', config: partial } satisfies TunerDspToWorker)
    }
  }

  function pushFrame(samples: Float32Array, sampleRate: number): void {
    if (disposed) return
    if (busy) {
      pending = { samples: new Float32Array(samples), sampleRate }
      return
    }
    sendFrame(samples, sampleRate)
  }

  function recomputeFft(): void {
    if (disposed) return
    const id = ++seq
    const w = ensureWorker()
    if (w) {
      busy = true
      w.postMessage({ type: 'recomputeFft', seq: id } satisfies TunerDspToWorker)
      return
    }
    busy = true
    void loadEngine()
      .then((eng) => {
        if (disposed) return
        const result = eng.recomputeFft(id, lastSampleRate)
        if (result) deliver(result)
      })
      .catch((err) => console.warn('[tunerDsp] recompute failed', err))
      .finally(() => {
        busy = false
        flushPending()
      })
  }

  function reset(): void {
    pending = null
    engine?.reset()
    if (worker) worker.postMessage({ type: 'reset' } satisfies TunerDspToWorker)
  }

  function warmup(): void {
    if (disposed) return
    ensureWorker()
  }

  function dispose(): void {
    disposed = true
    pending = null
    try {
      worker?.terminate()
    } catch {
      /* ignore */
    }
    worker = null
    engine = null
    engineLoading = null
  }

  return {
    setConfig,
    pushFrame,
    recomputeFft,
    reset,
    warmup,
    dispose,
    get usingWorker() {
      return worker != null && !workerFailed
    },
  }
}

/** Idle-prefetch the DSP worker chunk (kept briefly so the fetch is not aborted). */
export function preloadTunerDsp(): void {
  try {
    if (typeof Worker === 'undefined') return
    const w = new Worker(new URL('./tunerDsp.worker.ts', import.meta.url), {
      type: 'module',
    })
    // Keep alive briefly so the module fetch can complete, then tear down.
    setTimeout(() => {
      try {
        w.terminate()
      } catch {
        /* ignore */
      }
    }, 1500)
  } catch {
    /* ignore */
  }
}
