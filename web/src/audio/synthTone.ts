/** Deterministic synthetic AudioBuffer fixtures for pitch/speed tests. */

import { createAudioBuffer } from './audioBufferFactory'

export type SynthToneOpts = {
  frequencyHz?: number
  durationSec?: number
  sampleRate?: number
  channels?: 1 | 2
  frequencyHzR?: number
  phaseOffsetR?: number
  amplitude?: number
}

/** Pure sine (default 440 Hz, 1.0 s, 48 kHz). */
export function synthSine(opts: SynthToneOpts = {}): AudioBuffer {
  const freq = opts.frequencyHz ?? 440
  const dur = opts.durationSec ?? 1
  const sr = opts.sampleRate ?? 48000
  const ch = opts.channels ?? 1
  const amp = opts.amplitude ?? 0.5
  const length = Math.max(1, Math.round(dur * sr))
  const buf = createAudioBuffer(ch, length, sr)
  for (let c = 0; c < ch; c++) {
    const data = buf.getChannelData(c)
    const f = c === 1 && opts.frequencyHzR != null ? opts.frequencyHzR : freq
    const phase = c === 1 ? (opts.phaseOffsetR ?? 0) : 0
    for (let i = 0; i < length; i++) {
      data[i] = amp * Math.sin((2 * Math.PI * f * i) / sr + phase)
    }
  }
  return buf
}

export function synthHarmonic(opts: SynthToneOpts & { harmonics?: number } = {}): AudioBuffer {
  const f0 = opts.frequencyHz ?? 220
  const dur = opts.durationSec ?? 1
  const sr = opts.sampleRate ?? 48000
  const ch = opts.channels ?? 1
  const nHarm = opts.harmonics ?? 5
  const length = Math.max(1, Math.round(dur * sr))
  const buf = createAudioBuffer(ch, length, sr)
  for (let c = 0; c < ch; c++) {
    const data = buf.getChannelData(c)
    for (let i = 0; i < length; i++) {
      let s = 0
      for (let h = 1; h <= nHarm; h++) {
        s += (1 / h) * Math.sin((2 * Math.PI * f0 * h * i) / sr)
      }
      data[i] = 0.4 * s
    }
  }
  return buf
}

export function synthClickTrain(opts: {
  intervalSec?: number
  durationSec?: number
  sampleRate?: number
  channels?: 1 | 2
}): AudioBuffer {
  const interval = opts.intervalSec ?? 0.1
  const dur = opts.durationSec ?? 1
  const sr = opts.sampleRate ?? 48000
  const ch = opts.channels ?? 1
  const length = Math.max(1, Math.round(dur * sr))
  const buf = createAudioBuffer(ch, length, sr)
  const step = Math.max(1, Math.round(interval * sr))
  for (let c = 0; c < ch; c++) {
    const data = buf.getChannelData(c)
    for (let i = 0; i < length; i += step) data[i] = 1
  }
  return buf
}

export function synthSilence(opts: {
  durationSec?: number
  sampleRate?: number
  channels?: 1 | 2
}): AudioBuffer {
  const dur = opts.durationSec ?? 0.5
  const sr = opts.sampleRate ?? 48000
  const ch = opts.channels ?? 1
  return createAudioBuffer(ch, Math.max(1, Math.round(dur * sr)), sr)
}

export function synthDelayedStereo(opts: {
  frequencyHz?: number
  delaySamples?: number
  durationSec?: number
  sampleRate?: number
}): AudioBuffer {
  const freq = opts.frequencyHz ?? 440
  const delay = opts.delaySamples ?? 48
  const dur = opts.durationSec ?? 1
  const sr = opts.sampleRate ?? 48000
  const length = Math.max(1, Math.round(dur * sr))
  const buf = createAudioBuffer(2, length, sr)
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)
  for (let i = 0; i < length; i++) {
    L[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / sr)
    const j = i - delay
    R[i] = j >= 0 ? 0.5 * Math.sin((2 * Math.PI * freq * j) / sr) : 0
  }
  return buf
}
