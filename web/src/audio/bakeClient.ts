/**
 * Host for the voice-transform worker. Shared by player and downloads.
 *
 * DSP packages (@audio/stretch-wsola, @audio/shift-formant) live only in the
 * worker chunk (+ optional sync fallback). Call preloadBakePipeline() after
 * idle so first pitch/speed change does not wait on network.
 */
import {
  ALGORITHM_ID,
  ALGORITHM_VERSION,
  bakeCacheKey,
  canonicalizeTransform,
  estimateBakePeakBytes,
  expectedFrames,
  isCanonicalIdentity,
  type CanonicalTransform,
} from './transformContract'
import { bakeCache, type BakedEntry } from './bakeCache'
import { createAudioBuffer } from './audioBufferFactory'
import type { WorkerBakeRequest, WorkerResponse } from './voiceTransform.worker'

/** Result of a successful worker/main-thread bake including cache key metadata. */
export type BakeJobResult = {
  buffer: AudioBuffer
  peakL: number
  peakR: number
  key: string
  transform: CanonicalTransform
}

let worker: Worker | null = null
let workerFailed = false
let nextJobId = 1
let preloadPromise: Promise<void> | null = null
const pending = new Map<
  number,
  {
    resolve: (v: WorkerResponse) => void
    reject: (e: Error) => void
  }
>()

function getWorker(): Worker | null {
  if (workerFailed) return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./voiceTransform.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data
      const p = pending.get(msg.jobId)
      if (!p) return
      pending.delete(msg.jobId)
      p.resolve(msg)
    }
    worker.onerror = (err) => {
      console.warn('[bakeClient] worker error', err)
      workerFailed = true
      for (const [, p] of pending) {
        p.reject(new Error('DSP worker failed'))
      }
      pending.clear()
      worker?.terminate()
      worker = null
    }
    return worker
  } catch (err) {
    console.warn('[bakeClient] worker unavailable', err)
    workerFailed = true
    return null
  }
}

/**
 * Fetch + parse the DSP worker (WSOLA / formant) without blocking UI.
 * Safe to call multiple times; concurrent callers share one promise.
 */
export function preloadBakePipeline(): Promise<void> {
  if (preloadPromise) return preloadPromise
  preloadPromise = Promise.resolve()
    .then(() => {
      getWorker()
    })
    .catch(() => {
      /* workerFailed already set */
    })
  return preloadPromise
}

async function bakeAudioBufferSyncLazy(
  input: AudioBuffer,
  pitchSemitones: number,
  speed: number,
): Promise<AudioBuffer | null> {
  const { bakeAudioBufferSync } = await import('./voiceTransform')
  return bakeAudioBufferSync(input, pitchSemitones, speed)
}

function channelsFromBuffer(buf: AudioBuffer): Float32Array[] {
  const n = Math.min(2, buf.numberOfChannels)
  const out: Float32Array[] = []
  for (let c = 0; c < n; c++) {
    // Copy so we never detach the AudioBuffer's underlying storage.
    out.push(new Float32Array(buf.getChannelData(c)))
  }
  return out
}

function bufferFromChannels(
  channels: Float32Array[],
  sampleRate: number,
): AudioBuffer {
  const length = channels[0]!.length
  const buf = createAudioBuffer(channels.length, length, sampleRate)
  for (let c = 0; c < channels.length; c++) {
    buf.copyToChannel(channels[c]! as Float32Array<ArrayBuffer>, c)
  }
  return buf
}

async function runWorkerBake(
  original: AudioBuffer,
  t: CanonicalTransform,
  signal?: AbortSignal,
): Promise<{ channels: Float32Array[]; peakL: number; peakR: number }> {
  const w = getWorker()
  if (!w) throw new Error('DSP worker unavailable')

  const jobId = nextJobId++
  const channels = channelsFromBuffer(original)
  const transfer = channels.map((c) => c.buffer)

  const result = await new Promise<WorkerResponse>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const onAbort = () => {
      w.postMessage({ type: 'cancel', jobId } satisfies { type: 'cancel'; jobId: number })
      pending.delete(jobId)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    pending.set(jobId, {
      resolve: (msg) => {
        signal?.removeEventListener('abort', onAbort)
        resolve(msg)
      },
      reject: (e) => {
        signal?.removeEventListener('abort', onAbort)
        reject(e)
      },
    })
    const req: WorkerBakeRequest = {
      type: 'bake',
      jobId,
      sampleRate: original.sampleRate,
      pitchSemitones: t.pitchSemitones,
      speed: t.speed,
      channels,
    }
    w.postMessage(req, { transfer })
  })

  if (result.type === 'cancelled') throw new DOMException('Aborted', 'AbortError')
  if (result.type === 'error') throw new Error(result.message)
  return { channels: result.channels, peakL: result.peakL, peakR: result.peakR }
}

function awaitWithAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (e) => {
        signal.removeEventListener('abort', onAbort)
        reject(e)
      },
    )
  })
}

/** Per-key waiter count + cancel: cancel worker only when the last waiter abandons. */
const inflightMeta = new Map<string, { waiters: number; cancel: () => void }>()

async function joinInflight(
  key: string,
  job: Promise<BakedEntry | null>,
  signal?: AbortSignal,
): Promise<BakedEntry | null> {
  let meta = inflightMeta.get(key)
  if (!meta) {
    meta = { waiters: 0, cancel: () => {} }
    inflightMeta.set(key, meta)
  }
  meta.waiters++
  let abandoned = false
  try {
    return await awaitWithAbort(job, signal)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') abandoned = true
    throw err
  } finally {
    meta.waiters--
    if (abandoned && meta.waiters <= 0) meta.cancel()
  }
}

/**
 * Bake pitch/speed from original buffer. Uses shared cache + in-flight dedupe.
 * Falls back to sync main-thread bake only in test environments without Worker.
 *
 * Abort abandons this waiter's result. The shared worker job is cancelled only
 * when no other waiters remain for the same cache key.
 */
export async function processOfflineTransform(
  input: AudioBuffer,
  pitchSemitones: number,
  speed: number,
  opts?: {
    sourceRevision?: string
    signal?: AbortSignal
    maxPeakBytes?: number
  },
): Promise<AudioBuffer | null> {
  const t = canonicalizeTransform(pitchSemitones, speed)
  if (isCanonicalIdentity(t)) return input

  const sourceRevision = opts?.sourceRevision ?? 'anonymous'
  const key = bakeCacheKey({
    sourceRevision,
    sampleRate: input.sampleRate,
    channels: Math.min(2, input.numberOfChannels),
    pitchSemitones: t.pitchSemitones,
    speed: t.speed,
    algorithmId: ALGORITHM_ID,
    algorithmVersion: ALGORITHM_VERSION,
  })

  const cached = bakeCache.get(key)
  if (cached) {
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return cached.buffer
  }

  const inflight = bakeCache.getInflight(key)
  if (inflight) {
    try {
      const e = await joinInflight(key, inflight, opts?.signal)
      if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      return e?.buffer ?? null
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      return null
    }
  }

  const peakBytes = estimateBakePeakBytes(
    input.length,
    Math.min(2, input.numberOfChannels),
    t.speed,
  )
  const maxPeak = opts?.maxPeakBytes ?? 256 * 1024 * 1024
  if (peakBytes > maxPeak) {
    console.warn('[bakeClient] transform too heavy', { peakBytes, maxPeak })
    return null
  }
  const outFrames = expectedFrames(input.length, t.speed)
  const outBytes = outFrames * Math.min(2, input.numberOfChannels) * 4
  if (!bakeCache.canFit(outBytes)) {
    console.warn('[bakeClient] bake cache cannot fit result')
    return null
  }

  const jobAbort = new AbortController()
  inflightMeta.set(key, {
    waiters: 0,
    cancel: () => {
      if (!jobAbort.signal.aborted) jobAbort.abort()
    },
  })

  const job = (async (): Promise<BakedEntry | null> => {
    try {
      if (jobAbort.signal.aborted) throw new DOMException('Aborted', 'AbortError')

      let peakL: number
      let peakR: number
      let buffer: AudioBuffer

      if (typeof Worker !== 'undefined' && !workerFailed) {
        try {
          const result = await runWorkerBake(input, t, jobAbort.signal)
          buffer = bufferFromChannels(result.channels, input.sampleRate)
          peakL = result.peakL
          peakR = result.peakR
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') throw err
          // Worker failed mid-job — try sync fallback for tests / degraded envs.
          if (workerFailed || typeof Worker === 'undefined') {
            const synced = await bakeAudioBufferSyncLazy(input, t.pitchSemitones, t.speed)
            if (!synced) return null
            buffer = synced
            peakL = 0
            peakR = 0
            for (let i = 0; i < synced.length; i++) {
              peakL = Math.max(peakL, Math.abs(synced.getChannelData(0)[i]!))
              if (synced.numberOfChannels > 1) {
                peakR = Math.max(peakR, Math.abs(synced.getChannelData(1)[i]!))
              }
            }
            if (synced.numberOfChannels < 2) peakR = peakL
          } else {
            throw err
          }
        }
      } else {
        const synced = await bakeAudioBufferSyncLazy(input, t.pitchSemitones, t.speed)
        if (!synced) return null
        buffer = synced
        peakL = 0
        peakR = 0
        const step = Math.max(1, Math.floor(synced.length / 200_000))
        for (let i = 0; i < synced.length; i += step) {
          peakL = Math.max(peakL, Math.abs(synced.getChannelData(0)[i]!))
          if (synced.numberOfChannels > 1) {
            peakR = Math.max(peakR, Math.abs(synced.getChannelData(1)[i]!))
          }
        }
        if (synced.numberOfChannels < 2) peakR = peakL
      }

      if (jobAbort.signal.aborted) throw new DOMException('Aborted', 'AbortError')

      return bakeCache.put({
        key,
        buffer,
        pitchSemitones: t.pitchSemitones,
        speed: t.speed,
        peakL,
        peakR,
        sourceRevision,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      console.warn('[bakeClient] bake failed', err)
      return null
    }
  })()

  bakeCache.setInflight(key, job)
  void job.finally(() => {
    queueMicrotask(() => {
      if (!bakeCache.getInflight(key)) inflightMeta.delete(key)
    })
  })

  try {
    const entry = await joinInflight(key, job, opts?.signal)
    return entry?.buffer ?? null
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    return null
  }
}

/** Abort all in-flight worker jobs (e.g. on navigation teardown). */
export function cancelAllWorkerJobs(): void {
  for (const [id, p] of pending) {
    worker?.postMessage({ type: 'cancel', jobId: id })
    p.reject(new DOMException('Aborted', 'AbortError'))
  }
  pending.clear()
}

/** @internal Reset worker, cache, and inflight state between tests. */
export function resetBakeClientForTests(): void {
  cancelAllWorkerJobs()
  worker?.terminate()
  worker = null
  workerFailed = false
  preloadPromise = null
  bakeCache.clear()
  inflightMeta.clear()
}
