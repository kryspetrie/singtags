/**
 * Animated Decimen QR send stream for a packed file container.
 */
import { fitQrDisplaySize } from '../../../vendor/decimen/shared/display'
import { LTEncoder } from '../../../vendor/decimen/shared/fountain'
import {
  blockLength,
  fitsInOneStream,
  smallestSufficientFrameSize,
} from '../../../vendor/decimen/shared/frame-capacity'
import {
  fnv1a,
  packFrame,
  type FrameHeader,
} from '../../../vendor/decimen/shared/protocol'
import { gridDims, rasterizeQr } from '../../../vendor/decimen/shared/qr-raster'
import {
  createFrameQr,
  QUIET_ZONE_MODULES as MARGIN,
  type EccLevel,
  type FrameQr,
} from '../../../vendor/decimen/send/qr-frame'
import {
  estimateSendTransferProgress,
  type DecimenSendStreamProgress,
} from './sendProgress'

const LOOKAHEAD = 3
const DEFAULT_TX_FPS = 24
const DEFAULT_FRAME_BYTES = 1465
const DEFAULT_ECC: EccLevel = 'L'
const DEFAULT_GRID_CODES = 1

export type DecimenSendStreamOptions = {
  txFps?: number
  frameBytes?: number
  ecc?: EccLevel
  gridCodes?: number
  displayPx?: number
  /** When true, size to the viewport instead of the canvas parent width. */
  fullscreen?: boolean
  /** Multiplier applied to displayPx (stage zoom). */
  displayScale?: number
}

export type DecimenSendStreamStatus = {
  k: number
  blockLen: number
  qrVersion?: number
  frameBytes: number
  txFps: number
  totalBytes: number
}

export type { DecimenSendStreamProgress } from './sendProgress'
export { estimateSendTransferProgress } from './sendProgress'

export type DecimenSendStreamStartOptions = {
  /** Render the first QR frame but do not animate until {@link DecimenSendStream.resumeTransmission}. */
  holdAfterPreview?: boolean
}

export class DecimenSendStream {
  private generation = 0
  private raf = 0
  private resizeCleanup: (() => void) | null = null
  private displayScale = 1
  private sizeCanvasFn: (() => void) | null = null
  private relayoutDisplayFn: (() => void) | null = null
  private resumeTransmissionFn: (() => void) | null = null
  private readonly canvas: HTMLCanvasElement
  private readonly opts: DecimenSendStreamOptions

  constructor(canvas: HTMLCanvasElement, opts: DecimenSendStreamOptions = {}) {
    this.canvas = canvas
    this.opts = opts
    this.displayScale = opts.displayScale ?? 1
  }

  /** Stage zoom for fullscreen sharing — re-layouts the canvas immediately. */
  setDisplayScale(scale: number): void {
    this.displayScale = Math.min(6, Math.max(1, Math.round(scale * 4) / 4))
    if (this.relayoutDisplayFn) this.relayoutDisplayFn()
    else this.sizeCanvasFn?.()
  }

  getDisplayScale(): number {
    return this.displayScale
  }

  stop(): void {
    this.generation += 1
    this.resumeTransmissionFn = null
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.resizeCleanup?.()
    this.resizeCleanup = null
    this.sizeCanvasFn = null
    this.relayoutDisplayFn = null
  }

  /** Begin animated frame transmission after a {@link DecimenSendStreamStartOptions.holdAfterPreview} start. */
  resumeTransmission(): void {
    this.resumeTransmissionFn?.()
  }

  /** Start streaming QR frames for a packed Decimen file container. */
  async start(
    container: Uint8Array,
    hooks?: {
      onStatus?: (status: DecimenSendStreamStatus) => void
      onProgress?: (progress: DecimenSendStreamProgress) => void
      onError?: (message: string) => void
    },
    startOpts?: DecimenSendStreamStartOptions,
  ): Promise<void> {
    this.stop()
    const gen = this.generation
    const txFps = this.opts.txFps ?? DEFAULT_TX_FPS
    const frameBytes = this.opts.frameBytes ?? DEFAULT_FRAME_BYTES
    const ecc = this.opts.ecc ?? DEFAULT_ECC
    const gridCodes = this.opts.gridCodes ?? DEFAULT_GRID_CODES
    const displayPx = this.opts.displayPx ?? 320
    const fullscreen = this.opts.fullscreen ?? false
    const { cols: gridCols, rows: gridRows } = gridDims(gridCodes)

    if (!fitsInOneStream(container.length, frameBytes)) {
      const suggestion = smallestSufficientFrameSize(container.length, [
        500,
        1000,
        1465,
        1850,
        2331,
        2953,
      ])
      hooks?.onError?.(
        `Sheet is too large for QR transfer (${Math.round(container.length / 1024)} KB).` +
          (suggestion ? ` Try frame size ${suggestion} on a dedicated Decimen sender.` : ''),
      )
      return
    }

    const sessionId = (Math.floor(Math.random() * 0xffff) + 1) & 0xffff
    const blockLen = blockLength(frameBytes)
    const encoder = new LTEncoder(container, blockLen, sessionId)
    const header: FrameHeader = {
      sessionId,
      seq: 0,
      k: encoder.k,
      blockLen,
      totalLen: container.length,
      payloadFnv: fnv1a(container),
      flags: 0,
    }

    let version: number | undefined
    let modules = 0
    let scale = 1
    const staging = document.createElement('canvas')
    const queue: ImageData[] = []
    const cells: (ImageData | null)[] = new Array<ImageData | null>(gridCodes).fill(null)
    let nextSeq = 0
    let generatorFailed = false

    const applyDisplayLayout = () => {
      if (version === undefined || modules === 0) return
      const dpr = window.devicePixelRatio || 1
      const cell = modules + 2 * MARGIN
      const totalW = cell * gridCols
      const totalH = cell * gridRows
      const containerWidth = fullscreen
        ? window.innerWidth
        : (this.canvas.parentElement?.getBoundingClientRect().width ?? window.innerWidth)
      const budget = fitQrDisplaySize(
        window.innerWidth,
        window.innerHeight,
        containerWidth,
        displayPx * this.displayScale,
        0,
      )
      scale = Math.max(1, Math.floor(Math.min((budget * dpr) / totalW, (budget * dpr) / totalH)))
      this.canvas.width = totalW * scale
      this.canvas.height = totalH * scale
      const cssNativeW = (totalW * scale) / dpr
      const cssNativeH = (totalH * scale) / dpr
      this.canvas.style.width = `${cssNativeW}px`
      this.canvas.style.height = `${cssNativeH}px`
      this.canvas.style.imageRendering = 'pixelated'
      const ctx = this.canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(staging, 0, 0, this.canvas.width, this.canvas.height)
    }

    const sizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1
      const cell = modules + 2 * MARGIN
      const totalW = cell * gridCols
      const totalH = cell * gridRows
      const containerWidth = fullscreen
        ? window.innerWidth
        : (this.canvas.parentElement?.getBoundingClientRect().width ?? window.innerWidth)
      const budget = fitQrDisplaySize(
        window.innerWidth,
        window.innerHeight,
        containerWidth,
        displayPx * this.displayScale,
        fullscreen ? 0 : 0,
      )
      scale = Math.max(1, Math.floor(Math.min((budget * dpr) / totalW, (budget * dpr) / totalH)))
      staging.width = totalW
      staging.height = totalH
      this.canvas.width = totalW * scale
      this.canvas.height = totalH * scale
      const cssNativeW = (totalW * scale) / dpr
      const cssNativeH = (totalH * scale) / dpr
      this.canvas.style.width = `${cssNativeW}px`
      this.canvas.style.height = `${cssNativeH}px`
      this.canvas.style.imageRendering = 'pixelated'
      const stagingCtx = staging.getContext('2d')!
      cells.forEach((img, i) => {
        if (img) stagingCtx.putImageData(img, (i % gridCols) * cell, Math.floor(i / gridCols) * cell)
      })
      const ctx = this.canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(staging, 0, 0, this.canvas.width, this.canvas.height)
    }
    this.sizeCanvasFn = sizeCanvas
    this.relayoutDisplayFn = applyDisplayLayout

    let framesTransmitted = 0
    let streamStartTs = 0
    let transmitting = !startOpts?.holdAfterPreview
    const totalBytes = container.length

    const emitProgress = () => {
      if (!transmitting) return
      const elapsed = Math.max(0, (performance.now() - streamStartTs) / 1000)
      hooks?.onProgress?.(
        estimateSendTransferProgress(encoder.k, framesTransmitted, totalBytes, elapsed),
      )
    }

    const drawCell = (img: ImageData, cellIndex: number): void => {
      if (version === undefined) return
      const cell = modules + 2 * MARGIN
      const cx = (cellIndex % gridCols) * cell
      const cy = Math.floor(cellIndex / gridCols) * cell
      cells[cellIndex] = img
      staging.getContext('2d')!.putImageData(img, cx, cy)
      const ctx = this.canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(staging, cx, cy, cell, cell, cx * scale, cy * scale, cell * scale, cell * scale)
    }

    const makeCode = (): FrameQr => {
      const bytes = packFrame({ ...header, seq: nextSeq }, encoder.encode(nextSeq))
      nextSeq++
      return createFrameQr(bytes, ecc, version)
    }

    const makeCell = (): ImageData => {
      const qr = makeCode()
      if (version === undefined) {
        version = qr.version
        modules = qr.modules.size
        sizeCanvas()
        hooks?.onStatus?.({
          k: encoder.k,
          blockLen,
          qrVersion: version,
          frameBytes,
          txFps,
          totalBytes,
        })
        if (transmitting) emitProgress()
      }
      const raster = rasterizeQr(qr.modules.size, qr.modules.data, MARGIN)
      return new ImageData(new Uint8ClampedArray(raster.pixels.buffer), raster.size, raster.size)
    }

    const pump = (max = LOOKAHEAD * gridCodes) => {
      if (generatorFailed || gen !== this.generation) return
      try {
        for (let n = 0; n < max && queue.length < LOOKAHEAD * gridCodes; n++) queue.push(makeCell())
      } catch (e) {
        generatorFailed = true
        hooks?.onError?.(e instanceof Error ? e.message : 'Could not generate QR stream.')
      }
    }

    const interval = 1000 / txFps
    const subInterval = interval / gridCodes
    let cellCursor = 0
    let nextAt = performance.now()

    const tick = (now: number) => {
      if (gen !== this.generation || generatorFailed || !transmitting) return
      this.raf = requestAnimationFrame(tick)
      if (now < nextAt) return
      if (now - nextAt > interval) nextAt = now
      while (now >= nextAt) {
        const img = queue.shift()
        pump(1)
        if (!img || version === undefined) {
          nextAt = now + subInterval
          break
        }
        drawCell(img, cellCursor)
        cellCursor = (cellCursor + 1) % gridCodes
        framesTransmitted += 1
        emitProgress()
        nextAt += subInterval
      }
    }

    const beginTransmission = () => {
      if (gen !== this.generation || generatorFailed || transmitting) return
      transmitting = true
      streamStartTs = performance.now()
      nextSeq = 0
      queue.length = 0
      cellCursor = 0
      framesTransmitted = 0
      cells.fill(null)
      staging.getContext('2d')!.clearRect(0, 0, staging.width, staging.height)
      pump()
      nextAt = performance.now()
      this.raf = requestAnimationFrame(tick)
      this.resumeTransmissionFn = null
    }

    if (startOpts?.holdAfterPreview) {
      try {
        const preview = makeCell()
        drawCell(preview, 0)
      } catch (e) {
        generatorFailed = true
        hooks?.onError?.(e instanceof Error ? e.message : 'Could not generate QR stream.')
        return
      }
      nextSeq = 0
      queue.length = 0
      this.resumeTransmissionFn = beginTransmission
    } else {
      pump()
      streamStartTs = performance.now()
      this.raf = requestAnimationFrame(tick)
    }
    const onResize = () => sizeCanvas()
    window.addEventListener('resize', onResize)
    this.resizeCleanup = () => {
      window.removeEventListener('resize', onResize)
      this.sizeCanvasFn = null
      this.relayoutDisplayFn = null
    }
  }
}
