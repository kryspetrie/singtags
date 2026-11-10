/**
 * Digital Tuner capture worklet — posts mono PCM frames to the main thread.
 * Served from /worklets/ (no Vite ?url). Keep small for Workbox precache.
 */
class TunerCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const opts = options?.processorOptions || {}
    this._hop = Math.max(128, Math.min(4096, opts.hopSize | 0 || 1024))
    this._buf = new Float32Array(this._hop)
    this._filled = 0
  }

  process(inputs) {
    const input = inputs[0]?.[0]
    if (!input || input.length === 0) return true
    let i = 0
    while (i < input.length) {
      const space = this._hop - this._filled
      const n = Math.min(space, input.length - i)
      this._buf.set(input.subarray(i, i + n), this._filled)
      this._filled += n
      i += n
      if (this._filled >= this._hop) {
        const frame = new Float32Array(this._buf)
        this.port.postMessage(
          { type: 'frame', samples: frame, sampleRate },
          [frame.buffer],
        )
        this._buf = new Float32Array(this._hop)
        this._filled = 0
      }
    }
    return true
  }
}

registerProcessor('tuner-capture', TunerCaptureProcessor)
