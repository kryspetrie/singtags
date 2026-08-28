/** Minimal AudioBuffer-like object for environments without Web Audio (happy-dom). */

export class FakeAudioBuffer {
  readonly numberOfChannels: number
  readonly length: number
  readonly sampleRate: number
  readonly duration: number
  private readonly channels: Float32Array[]

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels
    this.length = length
    this.sampleRate = sampleRate
    this.duration = length / sampleRate
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length))
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel]!
  }

  copyToChannel(source: Float32Array, channelNumber: number, startInChannel = 0): void {
    this.channels[channelNumber]!.set(source, startInChannel)
  }
}

/** Reused only to call createBuffer — never decode/play on this context. */
let shimCtx: AudioContext | null = null

function bufferViaAudioContext(
  channels: number,
  length: number,
  sampleRate: number,
): AudioBuffer {
  if (!shimCtx || shimCtx.state === 'closed' || shimCtx.sampleRate !== sampleRate) {
    const prev = shimCtx
    shimCtx = new AudioContext({ sampleRate })
    void prev?.close().catch(() => {})
  }
  return shimCtx.createBuffer(channels, length, sampleRate)
}

/**
 * Allocate an AudioBuffer without tying it to a live playback graph.
 *
 * Important: OfflineAudioContext's constructor `length` is the render quantum size.
 * Passing the full track length here used to allocate a second full-song buffer on
 * every bake (worse at speed < 1) and often failed, falling through to a new
 * AudioContext per call (browser limit ~6) or a FakeAudioBuffer that cannot play.
 */
export function createAudioBuffer(
  channels: number,
  length: number,
  sampleRate: number,
): AudioBuffer {
  const frames = Math.max(1, Math.floor(length))
  if (typeof OfflineAudioContext !== 'undefined') {
    try {
      // Tiny render length — we only need createBuffer, not offline rendering.
      return new OfflineAudioContext(channels, 1, sampleRate).createBuffer(
        channels,
        frames,
        sampleRate,
      )
    } catch {
      /* fall through */
    }
  }
  if (typeof AudioContext !== 'undefined') {
    try {
      return bufferViaAudioContext(channels, frames, sampleRate)
    } catch {
      /* fall through */
    }
  }
  return new FakeAudioBuffer(channels, frames, sampleRate) as unknown as AudioBuffer
}
