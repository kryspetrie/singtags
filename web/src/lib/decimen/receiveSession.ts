/**
 * Fountain decoder session for an incoming Decimen optical transfer.
 */
import { LTDecoder } from '../../../vendor/decimen/shared/fountain'
import {
  classifyFrame,
  fnv1a,
  frameVerdictMessage,
  parseFrame,
  streamIdentity,
  unpackFile,
  verifyFile,
  type OpticalFile,
} from '../../../vendor/decimen/shared/protocol'
import { estimateTransferProgress } from '../../../vendor/decimen/shared/progress'

export type DecimenReceiveProgress = {
  solved: number
  total: number
  percent: number
  frames: number
  label: string
}

export type DecimenReceiveSessionCallbacks = {
  onProgress?: (progress: DecimenReceiveProgress) => void
  onComplete?: (file: OpticalFile) => void
  onError?: (message: string) => void
}

export class DecimenReceiveSession {
  private decoder: LTDecoder | null = null
  private streamKey = ''
  private startTs = 0
  private done = false
  private lastVerdict: string | null = null
  private readonly callbacks: DecimenReceiveSessionCallbacks

  constructor(callbacks: DecimenReceiveSessionCallbacks = {}) {
    this.callbacks = callbacks
  }

  get active(): boolean {
    return !!this.decoder && !this.done
  }

  reset(): void {
    this.decoder = null
    this.streamKey = ''
    this.startTs = 0
    this.done = false
    this.lastVerdict = null
  }

  handleFrameBytes(bytes: Uint8Array): void {
    if (this.done) return
    const parsed = parseFrame(bytes)
    if (!parsed) {
      const verdict = classifyFrame(bytes)
      if (verdict.kind === 'foreign') return
      const message = frameVerdictMessage(verdict)
      if (message && message !== this.lastVerdict) {
        this.lastVerdict = message
        this.callbacks.onError?.(message)
      }
      return
    }

    this.lastVerdict = null
    const { header, block } = parsed
    const identity = streamIdentity(header)
    if (!this.decoder || this.streamKey !== identity) {
      this.decoder = new LTDecoder(header.k, header.blockLen, header.sessionId, header.totalLen)
      this.streamKey = identity
      this.startTs = performance.now()
    }

    this.decoder.addFrame(header.seq, block)
    this.emitProgress()

    if (!this.decoder.isComplete) return

    const payload = this.decoder.assemble()
    if (!payload) return
    this.done = true

    void this.finish(payload, fnv1a(payload) === header.payloadFnv)
  }

  private emitProgress(): void {
    if (!this.decoder) return
    const elapsed = Math.max(0, (performance.now() - this.startTs) / 1000)
    const usefulFrames = this.decoder.framesNew - this.decoder.framesRedundant
    const estimate = estimateTransferProgress(
      this.decoder.k,
      usefulFrames,
      elapsed,
      this.decoder.solvedCount,
    )
    const percent = Math.round(estimate.fraction * 1000) / 10
    this.callbacks.onProgress?.({
      solved: this.decoder.solvedCount,
      total: this.decoder.k,
      percent,
      frames: this.decoder.framesNew,
      label: `${this.decoder.solvedCount} / ${this.decoder.k} blocks · ${percent}%`,
    })
  }

  private async finish(container: Uint8Array, checksumOk: boolean): Promise<void> {
    if (!checksumOk) {
      this.reset()
      this.callbacks.onError?.('Transfer failed checksum verification. Try again closer to the screen.')
      return
    }
    try {
      const file = await unpackFile(container)
      const ok = await verifyFile(file)
      if (!ok) {
        this.reset()
        this.callbacks.onError?.('Received file failed integrity check.')
        return
      }
      this.callbacks.onComplete?.(file)
    } catch (e) {
      this.reset()
      this.callbacks.onError?.(e instanceof Error ? e.message : 'Could not unpack received file.')
    }
  }
}
