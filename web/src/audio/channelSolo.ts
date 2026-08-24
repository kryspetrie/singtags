/** Solo left/right channel → mono blob URL (music-website pattern). */

export type SoloMode = 'stereo' | 'left' | 'right'

let sharedCtx: AudioContext | null = null

export function getSharedAudioContext(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext()
  return sharedCtx
}

/** @internal test helper */
export function resetSharedAudioContextForTests(): void {
  sharedCtx = null
}

/** Encode mono or stereo AudioBuffer as a WAV Blob. */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, Math.max(1, buffer.numberOfChannels))
  const sampleRate = buffer.sampleRate
  const length = buffer.length
  const dataSize = length * numChannels * 2
  const array = new ArrayBuffer(44 + dataSize)
  const view = new DataView(array)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  const chans: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) chans.push(buffer.getChannelData(c))
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, chans[c]![i]!))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([array], { type: 'audio/wav' })
}

export async function soloChannelToObjectUrl(
  audioUrl: string,
  channel: 'left' | 'right',
): Promise<string> {
  const ctx = getSharedAudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
  const res = await fetch(audioUrl)
  if (!res.ok) throw new Error(`Failed to fetch audio (${res.status})`)
  const buf = await res.arrayBuffer()
  const decoded = await ctx.decodeAudioData(buf.slice(0))
  const idx = channel === 'left' ? 0 : Math.min(1, decoded.numberOfChannels - 1)
  const data = decoded.getChannelData(idx)
  const mono = ctx.createBuffer(1, decoded.length, decoded.sampleRate)
  mono.copyToChannel(data, 0)
  const wav = audioBufferToWavBlob(mono)
  return URL.createObjectURL(wav)
}
