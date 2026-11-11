/**
 * Tuner DSP worker — YIN mono-F0, multi-F0, FFT spectrum, spectrogram bins.
 */
import { TunerDspEngine } from './tunerDspEngine'
import type { TunerDspFromWorker, TunerDspToWorker } from './tunerDspProtocol'

const engine = new TunerDspEngine()
let lastSampleRate = 48000

self.onmessage = (ev: MessageEvent<TunerDspToWorker>) => {
  const msg = ev.data
  try {
    if (msg.type === 'config') {
      engine.setConfig(msg.config)
      return
    }
    if (msg.type === 'reset') {
      engine.reset()
      return
    }
    if (msg.type === 'recomputeFft') {
      const result = engine.recomputeFft(msg.seq, lastSampleRate)
      if (result) {
        const transfer: Transferable[] = []
        if (result.fft?.bins?.buffer) transfer.push(result.fft.bins.buffer)
        self.postMessage({ type: 'result', result } satisfies TunerDspFromWorker, transfer)
      } else {
        self.postMessage({ type: 'idle' } satisfies TunerDspFromWorker)
      }
      return
    }
    if (msg.type === 'frame') {
      lastSampleRate = msg.sampleRate
      const result = engine.processFrame(msg.samples, msg.sampleRate, msg.seq, performance.now())
      const transfer: Transferable[] = []
      if (result.fft?.bins?.buffer) transfer.push(result.fft.bins.buffer)
      if (result.spec?.bins?.buffer) transfer.push(result.spec.bins.buffer)
      self.postMessage({ type: 'result', result } satisfies TunerDspFromWorker, transfer)
      return
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Tuner DSP worker failed'
    self.postMessage({ type: 'error', message } satisfies TunerDspFromWorker)
  }
}
