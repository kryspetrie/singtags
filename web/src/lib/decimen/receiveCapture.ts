/**
 * Camera capture + WASM QR decode for Decimen optical receive.
 */
import {
  DecodeWorkerPool,
  type SymbolBox,
  type SymbolInfo,
  type SymbolQuad,
} from '../../../vendor/decimen/shared/worker-pool'
import { createDecodeWorker } from './decodeWorkerFactory'
import { DecimenReceiveSession, type DecimenReceiveSessionCallbacks } from './receiveSession'

const FULL_SCAN_MS = 100
const REGION_TTL_MS = 1500
const REGION_PAD = 0.35
const MAX_REGIONS = 9

type Region = SymbolBox & {
  seen: number
  decoded: boolean
  drift?: number
  quad?: SymbolQuad
  dim?: number
}

export class DecimenReceiveCapture {
  private readonly session: DecimenReceiveSession
  private readonly pool = new DecodeWorkerPool(createDecodeWorker, (bytes, box, info) =>
    this.onDecoded(bytes, box, info),
  )

  private video: HTMLVideoElement | null = null
  private running = false
  private captureGen = 0
  private frameId = 0
  private lastFullScan = 0
  private cropRotate = 0
  private readonly regions: Region[] = []
  private readonly grab = document.createElement('canvas')

  constructor(callbacks: DecimenReceiveSessionCallbacks) {
    this.session = new DecimenReceiveSession(callbacks)
    this.pool.resize(Math.min(4, navigator.hardwareConcurrency || 2))
  }

  attachVideo(video: HTMLVideoElement): void {
    this.video = video
  }

  start(): void {
    if (!this.video || this.running) return
    this.running = true
    this.captureGen += 1
    this.session.reset()
    this.regions.length = 0
    this.scheduleFrame(this.captureGen)
  }

  stop(): void {
    this.running = false
    this.captureGen += 1
    this.session.reset()
    this.regions.length = 0
    this.pool.resize(0)
  }

  private scheduleFrame(gen: number): void {
    if (!this.running || gen !== this.captureGen || !this.video) return
    const v = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number
    }
    const next = () => {
      if (!this.running || gen !== this.captureGen) return
      this.captureFrame()
      this.scheduleFrame(gen)
    }
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(next)
    else requestAnimationFrame(next)
  }

  private captureFrame(): void {
    const video = this.video
    if (!video) return
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return
    if (this.pool.busyCount === this.pool.size) return

    const now = performance.now()
    for (let i = this.regions.length - 1; i >= 0; i--) {
      if (now - this.regions[i]!.seen > REGION_TTL_MS) this.regions.splice(i, 1)
    }

    const fullScanDue = now - this.lastFullScan > FULL_SCAN_MS
    if (this.grab.width !== vw || this.grab.height !== vh) {
      this.grab.width = vw
      this.grab.height = vh
    }
    const ctx = this.grab.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(video, 0, 0)

    if (fullScanDue || this.regions.length === 0) {
      this.lastFullScan = now
      const img = ctx.getImageData(0, 0, vw, vh)
      this.pool.submit(
        { id: this.frameId++, buf: img.data.buffer, w: vw, h: vh, ox: 0, oy: 0, full: true },
        [img.data.buffer],
      )
      return
    }

    for (let i = 0; i < this.regions.length; i++) {
      const r = this.regions[(i + this.cropRotate) % this.regions.length]!
      const size = Math.max(r.w, r.h)
      const pad = Math.round(size * REGION_PAD + Math.min(size, 2 * (r.drift ?? 0)))
      const x = Math.max(0, Math.floor(r.x - pad))
      const y = Math.max(0, Math.floor(r.y - pad))
      const w = Math.min(vw - x, Math.ceil(r.w + 2 * pad))
      const h = Math.min(vh - y, Math.ceil(r.h + 2 * pad))
      if (w < 32 || h < 32) continue
      const img = ctx.getImageData(x, y, w, h)
      const taken = this.pool.submit(
        {
          id: this.frameId++,
          buf: img.data.buffer,
          w,
          h,
          ox: x,
          oy: y,
          full: false,
          quad: r.quad,
          dim: r.dim,
        },
        [img.data.buffer],
      )
      if (!taken) break
    }
    this.cropRotate++
  }

  private onDecoded(bytes: Uint8Array, box?: SymbolBox, info?: SymbolInfo): void {
    if (box) this.noteRegion(box, performance.now(), true, info)
    this.session.handleFrameBytes(bytes)
  }

  private noteRegion(box: SymbolBox, now: number, decoded: boolean, info?: SymbolInfo): void {
    for (const r of this.regions) {
      const dx = Math.abs(box.x + box.w / 2 - (r.x + r.w / 2))
      const dy = Math.abs(box.y + box.h / 2 - (r.y + r.h / 2))
      if (dx < Math.max(box.w, r.w) / 2 && dy < Math.max(box.h, r.h) / 2) {
        if (!decoded) {
          r.seen = now
          return
        }
        r.drift = 0.5 * (r.drift ?? 0) + 0.5 * Math.hypot(dx, dy)
        Object.assign(r, box, { seen: now, decoded: true })
        if (info?.quad) r.quad = info.quad
        if (info?.modules) r.dim = info.modules
        return
      }
    }
    if (!decoded) return
    this.regions.push({
      ...box,
      seen: now,
      decoded: true,
      quad: info?.quad,
      dim: info?.modules,
    })
    if (this.regions.length > MAX_REGIONS) {
      this.regions.sort((a, b) => Number(b.decoded) - Number(a.decoded) || b.seen - a.seen)
      this.regions.length = MAX_REGIONS
    }
  }
}
