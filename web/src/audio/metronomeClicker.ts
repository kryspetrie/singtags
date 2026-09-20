/**
 * Plays metronome click samples (downbeat vs upbeat) through Web Audio.
 */
import { getSharedAudioContext, resumeAudioContextBestEffort } from './channelSolo'
import { decodeAudioDataExclusive } from './decodeLock'
import {
  metronomeSampleUrl,
  metronomeSoundPair,
  type MetronomeSoundId,
} from './metronomeSamples'

type PairBuffers = { down: AudioBuffer; up: AudioBuffer }

export class MetronomeClicker {
  private soundId: MetronomeSoundId
  private cache = new Map<string, PairBuffers>()
  private loading: Promise<PairBuffers> | null = null
  private enabled = false
  private gain = 0.85

  constructor(soundId?: string) {
    this.soundId = metronomeSoundPair(soundId).id
  }

  setEnabled(enabled: boolean): void {
    this.enabled = !!enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setSoundId(soundId: string): void {
    this.soundId = metronomeSoundPair(soundId).id
    this.loading = null
  }

  getSoundId(): MetronomeSoundId {
    return this.soundId
  }

  setGain(gain: number): void {
    this.gain = Math.max(0, Math.min(1.5, gain))
  }

  async ensureLoaded(soundId?: string): Promise<void> {
    if (soundId) this.setSoundId(soundId)
    await this.loadPair(this.soundId)
  }

  private async loadPair(id: MetronomeSoundId): Promise<PairBuffers> {
    const cached = this.cache.get(id)
    if (cached) return cached
    if (this.loading) return this.loading
    const pair = metronomeSoundPair(id)
    this.loading = (async () => {
      const ctx = getSharedAudioContext()
      await resumeAudioContextBestEffort(ctx)
      const [downBytes, upBytes] = await Promise.all([
        fetch(metronomeSampleUrl(pair.downFile)).then((r) => {
          if (!r.ok) throw new Error(`Metronome sample missing (${pair.downFile})`)
          return r.arrayBuffer()
        }),
        fetch(metronomeSampleUrl(pair.upFile)).then((r) => {
          if (!r.ok) throw new Error(`Metronome sample missing (${pair.upFile})`)
          return r.arrayBuffer()
        }),
      ])
      const [down, up] = await Promise.all([
        decodeAudioDataExclusive(downBytes),
        decodeAudioDataExclusive(upBytes),
      ])
      const buffers = { down, up }
      this.cache.set(id, buffers)
      return buffers
    })()
    try {
      return await this.loading
    } finally {
      this.loading = null
    }
  }

  /** Fire a single click (`downbeat` chooses the sample). */
  async click(downbeat: boolean): Promise<void> {
    if (!this.enabled) return
    try {
      const buffers = await this.loadPair(this.soundId)
      const ctx = getSharedAudioContext()
      await resumeAudioContextBestEffort(ctx)
      const src = ctx.createBufferSource()
      src.buffer = downbeat ? buffers.down : buffers.up
      const g = ctx.createGain()
      g.gain.value = this.gain
      src.connect(g)
      g.connect(ctx.destination)
      src.start()
      src.onended = () => {
        try {
          src.disconnect()
          g.disconnect()
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* missing samples / decode — skip click */
    }
  }

  dispose(): void {
    this.enabled = false
    this.cache.clear()
    this.loading = null
  }
}
