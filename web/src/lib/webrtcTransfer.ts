/**
 * Labs WebRTC DataChannel file transfer with QR-friendly SDP handshake.
 * Host-only ICE (iceServers: []) for same Wi‑Fi / personal hotspot — no TURN.
 */
import { deflateSync, inflateSync } from 'fflate'
import { qrDataUrl } from './qr'

export const WEBRTC_SDP_PREFIX = 'STW1:'
const CHUNK_BYTES = 16 * 1024
const META_TYPE = 'stw1-meta'
const DONE_TYPE = 'stw1-done'

export type WebrtcTransferProgress = {
  phase: 'pairing' | 'connecting' | 'sending' | 'receiving' | 'done' | 'failed'
  label: string
  bytesSent?: number
  bytesReceived?: number
  totalBytes?: number
}

export type WebrtcReceivedFile = {
  name: string
  type: string
  bytes: Uint8Array
}

type MetaMessage = {
  t: typeof META_TYPE
  name: string
  type: string
  size: number
}

type DoneMessage = {
  t: typeof DONE_TYPE
  ok: boolean
}

function b64FromBytes(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(s)
}

function bytesFromB64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Compress SDP into a QR-safe STW1: payload. */
export function encodeSdpForQr(sdp: string): string {
  const compressed = deflateSync(new TextEncoder().encode(sdp), { level: 6 })
  return `${WEBRTC_SDP_PREFIX}${b64FromBytes(compressed)}`
}

/** Decode STW1: (or raw SDP) back to an SDP string. */
export function decodeSdpFromQr(payload: string): string {
  const text = payload.trim()
  if (!text.startsWith(WEBRTC_SDP_PREFIX)) {
    if (text.startsWith('v=0')) return text
    throw new Error('That doesn’t look like wireless pairing text.')
  }
  const b64 = text.slice(WEBRTC_SDP_PREFIX.length)
  const inflated = inflateSync(bytesFromB64(b64))
  return new TextDecoder().decode(inflated)
}

export async function sdpQrDataUrl(sdp: string, size = 720): Promise<string> {
  return qrDataUrl(encodeSdpForQr(sdp), size)
}

function waitIceComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onChange)
        resolve()
      }
    }
    pc.addEventListener('icegatheringstatechange', onChange)
  })
}

function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: [] })
}

async function waitChannelOpen(channel: RTCDataChannel, timeoutMs = 60_000): Promise<void> {
  if (channel.readyState === 'open') return
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Wireless link timed out. Use the same Wi‑Fi or hotspot, or try Optical.'))
    }, timeoutMs)
    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Wireless link failed. Try Optical transfer instead.'))
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      channel.removeEventListener('open', onOpen)
      channel.removeEventListener('error', onError)
    }
    channel.addEventListener('open', onOpen)
    channel.addEventListener('error', onError)
  })
}

async function sendFileOnChannel(
  channel: RTCDataChannel,
  file: File,
  onProgress?: (p: WebrtcTransferProgress) => void,
): Promise<void> {
  const meta: MetaMessage = {
    t: META_TYPE,
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
  }
  channel.send(JSON.stringify(meta))
  const bytes = new Uint8Array(await file.arrayBuffer())
  let offset = 0
  while (offset < bytes.length) {
    const end = Math.min(offset + CHUNK_BYTES, bytes.length)
    // Copy for older RTCDataChannel typings that expect ArrayBuffer.
    const slice = bytes.subarray(offset, end)
    const copy = slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength)
    channel.send(copy)
    offset = end
    onProgress?.({
      phase: 'sending',
      label: `Sending… ${Math.min(100, Math.round((offset / bytes.length) * 100))}%`,
      bytesSent: offset,
      totalBytes: bytes.length,
    })
    // Yield so the UI can paint and the socket can drain.
    await new Promise((r) => setTimeout(r, 0))
  }
  const done: DoneMessage = { t: DONE_TYPE, ok: true }
  channel.send(JSON.stringify(done))
}

function receiveFileFromChannel(
  channel: RTCDataChannel,
  onProgress?: (p: WebrtcTransferProgress) => void,
): Promise<WebrtcReceivedFile> {
  return new Promise((resolve, reject) => {
    let meta: MetaMessage | null = null
    const chunks: Uint8Array[] = []
    let received = 0

    const onMessage = (ev: MessageEvent) => {
      if (typeof ev.data === 'string') {
        let parsed: MetaMessage | DoneMessage
        try {
          parsed = JSON.parse(ev.data) as MetaMessage | DoneMessage
        } catch {
          reject(new Error('Invalid wireless transfer message.'))
          return
        }
        if (parsed.t === META_TYPE) {
          meta = parsed
          onProgress?.({
            phase: 'receiving',
            label: `Receiving ${parsed.name}…`,
            bytesReceived: 0,
            totalBytes: parsed.size,
          })
          return
        }
        if (parsed.t === DONE_TYPE) {
          cleanup()
          if (!meta || !parsed.ok) {
            reject(new Error('Wireless transfer failed.'))
            return
          }
          const out = new Uint8Array(received)
          let o = 0
          for (const c of chunks) {
            out.set(c, o)
            o += c.length
          }
          if (out.length !== meta.size) {
            reject(new Error(`Size mismatch (got ${out.length}, expected ${meta.size}).`))
            return
          }
          resolve({ name: meta.name, type: meta.type, bytes: out })
        }
        return
      }

      const buf =
        ev.data instanceof ArrayBuffer
          ? new Uint8Array(ev.data)
          : null
      if (!buf) {
        if (ev.data instanceof Blob) {
          reject(new Error('Unexpected blob chunk on wireless channel.'))
        }
        return
      }
      chunks.push(buf)
      received += buf.length
      onProgress?.({
        phase: 'receiving',
        label: meta
          ? `Receiving ${meta.name}… ${Math.min(100, Math.round((received / meta.size) * 100))}%`
          : 'Receiving…',
        bytesReceived: received,
        totalBytes: meta?.size,
      })
    }

    const onError = () => {
      cleanup()
      reject(new Error('Wireless channel error.'))
    }

    const cleanup = () => {
      channel.removeEventListener('message', onMessage)
      channel.removeEventListener('error', onError)
    }

    channel.addEventListener('message', onMessage)
    channel.addEventListener('error', onError)
  })
}

export type WebrtcOfferSession = {
  pc: RTCPeerConnection
  channel: RTCDataChannel
  offerSdp: string
  offerQrDataUrl: string
  /** Apply answer SDP from the peer’s QR, then send `file`. */
  completeAndSend: (
    answerPayload: string,
    file: File,
    onProgress?: (p: WebrtcTransferProgress) => void,
  ) => Promise<void>
  close: () => void
}

/** Create an offer + pairing QR for the sender. */
export async function createWebrtcOfferSession(
  onProgress?: (p: WebrtcTransferProgress) => void,
): Promise<WebrtcOfferSession> {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('WebRTC is not available in this browser.')
  }
  onProgress?.({ phase: 'pairing', label: 'Setting up…' })
  const pc = createPeerConnection()
  const channel = pc.createDataChannel('singtags-transfer', { ordered: true })
  channel.binaryType = 'arraybuffer'

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await waitIceComplete(pc)
  const offerSdp = pc.localDescription?.sdp
  if (!offerSdp) {
    pc.close()
    throw new Error('Could not start wireless pairing.')
  }
  const offerQrDataUrl = await sdpQrDataUrl(offerSdp)
  onProgress?.({ phase: 'pairing', label: 'Show this QR to the other phone' })

  return {
    pc,
    channel,
    offerSdp,
    offerQrDataUrl,
    async completeAndSend(answerPayload, file, progress) {
      const answerSdp = decodeSdpFromQr(answerPayload)
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
      progress?.({ phase: 'connecting', label: 'Connecting…' })
      await waitChannelOpen(channel)
      progress?.({ phase: 'sending', label: 'Sending…', totalBytes: file.size, bytesSent: 0 })
      await sendFileOnChannel(channel, file, progress)
      progress?.({ phase: 'done', label: 'Sent', bytesSent: file.size, totalBytes: file.size })
    },
    close() {
      try {
        channel.close()
      } catch {
        /* ignore */
      }
      pc.close()
    },
  }
}

export type WebrtcAnswerSession = {
  pc: RTCPeerConnection
  answerSdp: string
  answerQrDataUrl: string
  /** Wait for the sender’s file after they scan this answer QR. */
  receive: (onProgress?: (p: WebrtcTransferProgress) => void) => Promise<WebrtcReceivedFile>
  close: () => void
}

/** Scan/paste an offer payload and produce an answer QR for the receiver. */
export async function createWebrtcAnswerSession(
  offerPayload: string,
  onProgress?: (p: WebrtcTransferProgress) => void,
): Promise<WebrtcAnswerSession> {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('WebRTC is not available in this browser.')
  }
  onProgress?.({ phase: 'pairing', label: 'Connecting…' })
  const offerSdp = decodeSdpFromQr(offerPayload)
  const pc = createPeerConnection()

  const channelPromise = new Promise<RTCDataChannel>((resolve) => {
    pc.addEventListener('datachannel', (ev) => {
      const ch = ev.channel
      ch.binaryType = 'arraybuffer'
      resolve(ch)
    })
  })

  await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp })
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  await waitIceComplete(pc)
  const answerSdp = pc.localDescription?.sdp
  if (!answerSdp) {
    pc.close()
    throw new Error('Could not finish wireless pairing.')
  }
  const answerQrDataUrl = await sdpQrDataUrl(answerSdp)
  onProgress?.({ phase: 'pairing', label: 'Show this QR to the sender' })

  return {
    pc,
    answerSdp,
    answerQrDataUrl,
    async receive(progress) {
      progress?.({ phase: 'connecting', label: 'Waiting for sender…' })
      const channel = await channelPromise
      await waitChannelOpen(channel)
      const file = await receiveFileFromChannel(channel, progress)
      progress?.({
        phase: 'done',
        label: 'Received',
        bytesReceived: file.bytes.length,
        totalBytes: file.bytes.length,
      })
      return file
    },
    close() {
      pc.close()
    },
  }
}
