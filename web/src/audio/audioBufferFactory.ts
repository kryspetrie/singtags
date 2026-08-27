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

export function createAudioBuffer(
  channels: number,
  length: number,
  sampleRate: number,
): AudioBuffer {
  if (typeof OfflineAudioContext !== 'undefined') {
    try {
      return new OfflineAudioContext(channels, length, sampleRate).createBuffer(
        channels,
        length,
        sampleRate,
      )
    } catch {
      /* fall through */
    }
  }
  if (typeof AudioContext !== 'undefined') {
    try {
      return new AudioContext({ sampleRate }).createBuffer(channels, length, sampleRate)
    } catch {
      /* fall through */
    }
  }
  return new FakeAudioBuffer(channels, length, sampleRate) as unknown as AudioBuffer
}
