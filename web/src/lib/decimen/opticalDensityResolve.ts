/**
 * Cap QR payload density by what the send screen can physically resolve.
 * Dense symbols (many modules) need enough device pixels per module for a
 * phone camera to read the screen.
 */
import { gridDims } from '../../../vendor/decimen/shared/qr-raster'
import {
  createFrameQr,
  QUIET_ZONE_MODULES as MARGIN,
  type EccLevel,
} from '../../../vendor/decimen/send/qr-frame'
import {
  OPTICAL_FRAME_BYTES_OPTIONS,
  normalizeOpticalFrameBytes,
  type OpticalFrameBytes,
  type OpticalGridCodes,
} from './sendSettings'

/** Device pixels per module below this → camera usually cannot resolve the code. */
export const OPTICAL_MIN_MODULE_DEVICE_PX = 3

const moduleCountCache = new Map<string, number>()

/** QR data-module count (side length) for a Decimen frame at ECC L. */
export function qrDataModulesForFrameBytes(
  frameBytes: number,
  ecc: EccLevel = 'L',
): number {
  const key = `${ecc}:${frameBytes}`
  const cached = moduleCountCache.get(key)
  if (cached != null) return cached
  const payload = new Uint8Array(Math.max(1, Math.min(frameBytes, 2953)))
  const qr = createFrameQr(payload, ecc, undefined)
  const modules = qr.modules.size
  moduleCountCache.set(key, modules)
  return modules
}

/**
 * True when a frame density + grid can render on this stage with enough
 * device pixels per module.
 */
export function opticalDensityFitsScreen(opts: {
  frameBytes: number
  gridCodes: number
  stageWidthCss: number
  stageHeightCss: number
  devicePixelRatio?: number
  minModuleDevicePx?: number
}): boolean {
  const stageW = Math.max(1, opts.stageWidthCss)
  const stageH = Math.max(1, opts.stageHeightCss)
  const dpr = opts.devicePixelRatio ?? 1
  const minPx = opts.minModuleDevicePx ?? OPTICAL_MIN_MODULE_DEVICE_PX
  const cell = qrDataModulesForFrameBytes(opts.frameBytes) + 2 * MARGIN
  const { cols, rows } = gridDims(opts.gridCodes, { width: stageW, height: stageH })
  const totalW = cell * cols
  const totalH = cell * rows
  const cssPerModule = Math.min(stageW / totalW, stageH / totalH)
  return cssPerModule * dpr >= minPx
}

/** Estimate the fullscreen QR stage from the viewport (chrome reserved). */
export function estimateOpticalStageCss(opts?: {
  viewportWidth?: number
  viewportHeight?: number
  chromeReserveY?: number
}): { width: number; height: number } {
  const vw = opts?.viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 390)
  const vh = opts?.viewportHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 844)
  const chromeY = opts?.chromeReserveY ?? 168 // toolbar + progress + status
  return {
    width: vw * 0.995,
    height: Math.max(160, vh - chromeY) * 0.995,
  }
}

/** Density options this screen can actually resolve for a given grid. */
export function opticalFrameBytesOptionsForScreen(opts: {
  gridCodes?: number
  stageWidthCss?: number
  stageHeightCss?: number
  devicePixelRatio?: number
}): OpticalFrameBytes[] {
  const stage =
    opts.stageWidthCss != null && opts.stageHeightCss != null
      ? { width: opts.stageWidthCss, height: opts.stageHeightCss }
      : estimateOpticalStageCss()
  const gridCodes = opts.gridCodes ?? 1
  const dpr =
    opts.devicePixelRatio ??
    (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
  const allowed = OPTICAL_FRAME_BYTES_OPTIONS.filter((frameBytes) =>
    opticalDensityFitsScreen({
      frameBytes,
      gridCodes,
      stageWidthCss: stage.width,
      stageHeightCss: stage.height,
      devicePixelRatio: dpr,
    }),
  )
  return allowed.length ? [...allowed] : [OPTICAL_FRAME_BYTES_OPTIONS[0]!]
}

/** Clamp a preferred density down to what the screen can resolve. */
export function clampOpticalFrameBytesToScreen(
  preferred: number,
  opts: {
    gridCodes?: number
    stageWidthCss?: number
    stageHeightCss?: number
    devicePixelRatio?: number
  } = {},
): OpticalFrameBytes {
  const allowed = opticalFrameBytesOptionsForScreen(opts)
  const want = normalizeOpticalFrameBytes(preferred)
  if (allowed.includes(want)) return want
  const lower = [...allowed].reverse().find((option) => option <= want)
  return lower ?? allowed[0]!
}

export type { OpticalGridCodes }
