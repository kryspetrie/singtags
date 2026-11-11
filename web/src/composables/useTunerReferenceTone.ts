/**
 * Reference-tone playback for tuner piano / FFT sine click / region audition.
 * Suppresses live F0 while sounding; separate AudioContext from mic capture.
 */
import { onUnmounted, ref } from 'vue'
import { createInteractiveAudioContext } from '../audio/interactiveAudioContext'
import { createPitchTonePlayer, type PitchTonePlayer } from '../audio/pitchTone'
import {
  beginDetectSuppress,
  createDetectSuppressState,
  endDetectSuppress,
  type DetectSuppressState,
} from '../application/tuner/detectSuppress'
import { synthStackFrame } from '../audio/tuner/synthAudioFrame'

export function useTunerReferenceTone(opts: {
  setSuppressDetection: (on: boolean) => void
}) {
  const sounding = ref(false)
  const headphoneHint = ref(false)
  let player: PitchTonePlayer | null = null
  let suppress: DetectSuppressState = createDetectSuppressState()
  let bufferCtx: AudioContext | null = null
  let bufferSource: AudioBufferSourceNode | null = null

  function ensurePlayer(): PitchTonePlayer {
    if (!player) player = createPitchTonePlayer('synth', { polyphony: true })
    return player
  }

  async function ensureBufferCtx(): Promise<AudioContext> {
    if (bufferCtx && bufferCtx.state !== 'closed') {
      if (bufferCtx.state === 'suspended') await bufferCtx.resume()
      return bufferCtx
    }
    bufferCtx = createInteractiveAudioContext()
    await bufferCtx.resume()
    return bufferCtx
  }

  function markOn(): void {
    suppress = beginDetectSuppress(suppress, 'tone')
    opts.setSuppressDetection(true)
    sounding.value = true
    headphoneHint.value = true
  }

  function markOff(): void {
    suppress = endDetectSuppress(suppress)
    if (!suppress.suppressed) {
      opts.setSuppressDetection(false)
      sounding.value = false
    }
  }

  async function playNote(note: string, detuneCents = 0): Promise<void> {
    const p = ensurePlayer()
    await p.warmUp?.()
    markOn()
    await p.noteOn(note, detuneCents)
  }

  function releaseNote(note: string): void {
    player?.noteOff(note, true)
    if (!player?.activeNotes().length) markOff()
  }

  function stopBufferSource(): void {
    try {
      bufferSource?.stop()
    } catch {
      /* ignore */
    }
    bufferSource = null
  }

  function stopAll(): void {
    stopBufferSource()
    player?.allNotesOff(true)
    suppress = endDetectSuppress(suppress)
    opts.setSuppressDetection(false)
    sounding.value = false
  }

  /**
   * Play a short multi-sine buffer (region audition / FFT peak chord).
   * `durationSec` capped at 3s. Reuses one AudioContext across clicks.
   */
  async function playHzChord(partialsHz: readonly number[], durationSec = 1.2): Promise<void> {
    stopBufferSource()
    player?.allNotesOff(true)
    if (!partialsHz.length) return
    const dur = Math.max(0.2, Math.min(3, durationSec))
    const ctx = await ensureBufferCtx()
    const sr = ctx.sampleRate
    const samples = synthStackFrame(partialsHz, sr, Math.floor(sr * dur), 0.18)
    // Fade out last 40 ms
    const fade = Math.min(samples.length, Math.floor(sr * 0.04))
    for (let i = 0; i < fade; i++) {
      const t = i / fade
      samples[samples.length - 1 - i]! *= t
    }
    const buf = ctx.createBuffer(1, samples.length, sr)
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    bufferSource = src
    markOn()
    src.onended = () => {
      if (bufferSource === src) bufferSource = null
      markOff()
    }
    src.start()
  }

  function dismissHeadphoneHint(): void {
    headphoneHint.value = false
  }

  onUnmounted(() => {
    stopAll()
    player?.dispose()
    player = null
    if (bufferCtx) {
      void bufferCtx.close().catch(() => {})
      bufferCtx = null
    }
  })

  return {
    sounding,
    headphoneHint,
    playNote,
    releaseNote,
    playHzChord,
    stopAll,
    dismissHeadphoneHint,
  }
}
