/// <reference lib="webworker" />
/**
 * Dedicated worker for pitch/speed DSP (transferable channel arrays).
 * No Web Audio nodes — pure Float32Array processing.
 */
import { bakeChannels } from './voiceTransform'
import { canonicalizeTransform, isCanonicalIdentity } from './transformContract'

export type WorkerBakeRequest = {
  type: 'bake'
  jobId: number
  sampleRate: number
  pitchSemitones: number
  speed: number
  /** Channel Float32Arrays (transferred). */
  channels: Float32Array[]
}

export type WorkerCancelRequest = {
  type: 'cancel'
  jobId: number
}

export type WorkerResponse =
  | {
      type: 'result'
      jobId: number
      sampleRate: number
      peakL: number
      peakR: number
      channels: Float32Array[]
    }
  | { type: 'error'; jobId: number; message: string }
  | { type: 'cancelled'; jobId: number }

let cancelled = new Set<number>()

self.onmessage = (ev: MessageEvent<WorkerBakeRequest | WorkerCancelRequest>) => {
  const msg = ev.data
  if (msg.type === 'cancel') {
    cancelled.add(msg.jobId)
    return
  }
  if (msg.type !== 'bake') return

  const { jobId, sampleRate, pitchSemitones, speed, channels } = msg
  try {
    if (cancelled.has(jobId)) {
      cancelled.delete(jobId)
      const resp: WorkerResponse = { type: 'cancelled', jobId }
      self.postMessage(resp)
      return
    }
    const t = canonicalizeTransform(pitchSemitones, speed)
    if (isCanonicalIdentity(t)) {
      // Should not be requested; return copies.
      const copies = channels.map((c) => new Float32Array(c))
      const transfer = copies.map((c) => c.buffer)
      const resp: WorkerResponse = {
        type: 'result',
        jobId,
        sampleRate,
        peakL: 0,
        peakR: 0,
        channels: copies,
      }
      self.postMessage(resp, { transfer })
      return
    }

    const result = bakeChannels(channels, sampleRate, t, {
      isCancelled: () => cancelled.has(jobId),
    })
    if (cancelled.has(jobId)) {
      cancelled.delete(jobId)
      self.postMessage({ type: 'cancelled', jobId } satisfies WorkerResponse)
      return
    }
    const transfer = result.channels.map((c) => c.buffer)
    const resp: WorkerResponse = {
      type: 'result',
      jobId,
      sampleRate: result.sampleRate,
      peakL: result.peakL,
      peakR: result.peakR,
      channels: result.channels,
    }
    self.postMessage(resp, { transfer })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      cancelled.delete(jobId)
      self.postMessage({ type: 'cancelled', jobId } satisfies WorkerResponse)
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    self.postMessage({ type: 'error', jobId, message } satisfies WorkerResponse)
  }
}
