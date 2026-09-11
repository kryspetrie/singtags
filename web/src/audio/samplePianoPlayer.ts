/**
 * Polyphonic sample piano: one AudioBufferSourceNode voice per sounding note.
 */
import {
  ensurePianoOctavesAroundNote,
  getCachedPianoSample,
  midiOctave,
  noteToMidi,
} from './pianoSamples'

type SampleVoice = {
  note: string
  source: AudioBufferSourceNode
  gain: GainNode
  startedAt: number
}

const VOICE_LIMIT = 16

export class SamplePianoPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private voices = new Map<string, SampleVoice>()
  private lastDetuneCents = 0
  private masterGain = 0.85
  private releaseSec = 0.18
  private loadError: string | null = null

  getLoadError(): string | null {
    return this.loadError
  }

  /** Notes currently held (for UI highlighting). */
  activeNotes(): string[] {
    return [...this.voices.keys()]
  }

  isNoteActive(note: string): boolean {
    return this.voices.has(note)
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.masterGain
      this.master.connect(this.ctx.destination)
    }
    return this.ctx
  }

  async preloadForNote(note: string): Promise<void> {
    try {
      await ensurePianoOctavesAroundNote(note)
      this.loadError = null
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  /** @deprecated Prefer {@link noteOn} — kept for callers that still use start/stop. */
  async start(note: string, detuneCents = 0): Promise<void> {
    await this.noteOn(note, detuneCents)
  }

  async noteOn(note: string, detuneCents = 0): Promise<void> {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') await ctx.resume()
    this.lastDetuneCents = detuneCents

    try {
      await ensurePianoOctavesAroundNote(note)
      this.loadError = null
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err)
      throw err
    }

    const midi = noteToMidi(note)
    const buf = getCachedPianoSample(midi)
    if (!buf) {
      this.loadError = `No sample for ${note}`
      throw new Error(this.loadError)
    }

    // Retrigger same note
    this.noteOff(note, false)
    this.stealIfNeeded()

    const src = ctx.createBufferSource()
    const g = ctx.createGain()
    src.buffer = buf
    src.playbackRate.value = 2 ** (detuneCents / 1200)
    g.gain.value = 1
    src.connect(g)
    g.connect(this.master!)
    src.start()
    const voice: SampleVoice = { note, source: src, gain: g, startedAt: ctx.currentTime }
    this.voices.set(note, voice)
    src.onended = () => {
      if (this.voices.get(note)?.source === src) this.voices.delete(note)
    }
  }

  async restartIfPlaying(): Promise<void> {
    const notes = this.activeNotes()
    if (!notes.length) return
    const detune = this.lastDetuneCents
    for (const n of notes) {
      await this.noteOn(n, detune)
    }
  }

  /** @deprecated Prefer {@link noteOff} / {@link allNotesOff}. */
  stop(fade = true): void {
    this.allNotesOff(fade)
  }

  noteOff(note: string, fade = true): void {
    const voice = this.voices.get(note)
    if (!voice) return
    this.voices.delete(note)
    this.releaseVoice(voice, fade)
  }

  allNotesOff(fade = true): void {
    const all = [...this.voices.values()]
    this.voices.clear()
    for (const v of all) this.releaseVoice(v, fade)
  }

  private releaseVoice(voice: SampleVoice, fade: boolean): void {
    const ctx = this.ctx
    if (!ctx) return
    try {
      if (fade) {
        const now = ctx.currentTime
        voice.gain.gain.cancelScheduledValues(now)
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now)
        voice.gain.gain.linearRampToValueAtTime(0, now + this.releaseSec)
        voice.source.stop(now + this.releaseSec + 0.02)
      } else {
        voice.source.stop()
      }
    } catch {
      /* already stopped */
    }
  }

  private stealIfNeeded(): void {
    if (this.voices.size < VOICE_LIMIT) return
    let oldest: SampleVoice | null = null
    for (const v of this.voices.values()) {
      if (!oldest || v.startedAt < oldest.startedAt) oldest = v
    }
    if (oldest) this.noteOff(oldest.note, true)
  }

  async ensureOctave(oct: number): Promise<void> {
    const { ensurePianoOctave } = await import('./pianoSamples')
    await ensurePianoOctave(oct)
  }

  dispose(): void {
    this.allNotesOff(false)
    const ctx = this.ctx
    this.ctx = null
    this.master = null
    if (ctx) {
      void ctx.close().catch(() => undefined)
    }
  }
}

export { midiOctave }
