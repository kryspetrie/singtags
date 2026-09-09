/**
 * Shared optical send ladder: start dense on prefer-grid, ease downward
 * with monotonic module device-px (never shrink modules on “Easier scan”).
 */
import { gridDims } from '../../../vendor/decimen/shared/qr-raster'
import {
  QUIET_ZONE_MODULES as MARGIN,
} from '../../../vendor/decimen/send/qr-frame'
import {
  OPTICAL_FRAME_BYTES_OPTIONS,
  opticalPayloadFits,
  opticalThroughputKibPerSec,
  normalizeOpticalFrameBytes,
  normalizeOpticalGridCodes,
  type OpticalFrameBytes,
  type OpticalGridCodes,
  type OpticalTxFps,
} from './sendSettings'
import {
  OPTICAL_MIN_MODULE_DEVICE_PX,
  estimateOpticalStageCss,
  opticalDensityFitsScreen,
  qrDataModulesForFrameBytes,
} from './opticalDensityResolve'
import {
  OPTICAL_TRANSFER_PRESET_DEFS,
  normalizeOpticalTransferPreset,
  type OpticalTransferPreset,
} from './opticalTransferPresets'

export type OpticalSendLadderStep = {
  frameBytes: OpticalFrameBytes
  gridCodes: OpticalGridCodes
  moduleDevicePx: number
}

export type OpticalSendStart = OpticalSendLadderStep & {
  txFps: OpticalTxFps
}

/** Exact device pixels per QR module for a density × grid on a stage. */
export function opticalModuleDevicePx(opts: {
  frameBytes: number
  gridCodes: number
  stageWidthCss: number
  stageHeightCss: number
  devicePixelRatio?: number
}): number {
  const stageW = Math.max(1, opts.stageWidthCss)
  const stageH = Math.max(1, opts.stageHeightCss)
  const dpr = opts.devicePixelRatio ?? 1
  const cell = qrDataModulesForFrameBytes(opts.frameBytes) + 2 * MARGIN
  const { cols, rows } = gridDims(opts.gridCodes, { width: stageW, height: stageH })
  return Math.min(stageW / (cell * cols), stageH / (cell * rows)) * dpr
}

function resolveStage(opts: {
  stageWidthCss?: number
  stageHeightCss?: number
  viewportWidth?: number
  viewportHeight?: number
}): { width: number; height: number } {
  if (opts.stageWidthCss != null && opts.stageHeightCss != null) {
    return { width: opts.stageWidthCss, height: opts.stageHeightCss }
  }
  return estimateOpticalStageCss({
    viewportWidth: opts.viewportWidth,
    viewportHeight: opts.viewportHeight,
  })
}

/**
 * Grid order for the ease / start ladder listing: preferGrid first, then smaller.
 */
export function opticalEaseGridOrder(opts: {
  preferGrid: OpticalGridCodes
  maxGrid: OpticalGridCodes
}): OpticalGridCodes[] {
  const prefer = opts.preferGrid
  const maxG = opts.maxGrid
  const out: OpticalGridCodes[] = []
  const push = (g: OpticalGridCodes) => {
    if (g <= maxG && !out.includes(g)) out.push(g)
  }
  push(prefer)
  for (const g of [4, 2, 1] as OpticalGridCodes[]) {
    if (g < prefer) push(g)
  }
  if (!out.includes(1)) push(1)
  return out
}

/**
 * Hard→easy ladder: for each grid (prefer first), densities from densest→Light.
 * Only includes combos that pass the pixel gate and (optional) payload fit.
 */
export function listOpticalSendLadder(opts: {
  preferGrid?: OpticalGridCodes
  maxGrid?: OpticalGridCodes
  maxFrameBytes?: OpticalFrameBytes
  containerBytes?: number
  stageWidthCss?: number
  stageHeightCss?: number
  viewportWidth?: number
  viewportHeight?: number
  devicePixelRatio?: number
  minModuleDevicePx?: number
}): OpticalSendLadderStep[] {
  const stage = resolveStage(opts)
  const dpr = opts.devicePixelRatio ?? 1
  const minPx = opts.minModuleDevicePx ?? OPTICAL_MIN_MODULE_DEVICE_PX
  const maxFrameBytes = opts.maxFrameBytes ?? 2953
  const preferGrid = opts.preferGrid ?? 2
  const maxGrid = opts.maxGrid ?? preferGrid
  const grids = opticalEaseGridOrder({ preferGrid, maxGrid })

  const steps: OpticalSendLadderStep[] = []
  for (const gridCodes of grids) {
    const densities = [...OPTICAL_FRAME_BYTES_OPTIONS]
      .filter((fb) => fb <= maxFrameBytes)
      .sort((a, b) => b - a)
    for (const frameBytes of densities) {
      if (
        opts.containerBytes != null &&
        !opticalPayloadFits(opts.containerBytes, frameBytes)
      ) {
        continue
      }
      if (
        !opticalDensityFitsScreen({
          frameBytes,
          gridCodes,
          stageWidthCss: stage.width,
          stageHeightCss: stage.height,
          devicePixelRatio: dpr,
          minModuleDevicePx: minPx,
        })
      ) {
        continue
      }
      steps.push({
        frameBytes,
        gridCodes,
        moduleDevicePx: opticalModuleDevicePx({
          frameBytes,
          gridCodes,
          stageWidthCss: stage.width,
          stageHeightCss: stage.height,
          devicePixelRatio: dpr,
        }),
      })
    }
  }
  return steps
}

/**
 * Pick the send start for a preset.
 * maxDensity: densest legal on preferGrid (Fast may promote to grid 4 when faster + px≥4).
 * minDensity: Light on preferGrid (or 1 if 2 illegal).
 */
export function pickOpticalSendStart(opts: {
  preset: OpticalTransferPreset
  containerBytes: number
  stageWidthCss?: number
  stageHeightCss?: number
  viewportWidth?: number
  viewportHeight?: number
  devicePixelRatio?: number
}): OpticalSendStart {
  const preset = normalizeOpticalTransferPreset(opts.preset)
  const def = OPTICAL_TRANSFER_PRESET_DEFS[preset]
  const stage = resolveStage(opts)
  const dpr = opts.devicePixelRatio ?? 1
  const txFps = def.maxTxFps

  const baseCaps = {
    preferGrid: def.preferGrid,
    maxGrid: def.maxGrid,
    maxFrameBytes: def.maxFrameBytes,
    containerBytes: opts.containerBytes,
    stageWidthCss: stage.width,
    stageHeightCss: stage.height,
    devicePixelRatio: dpr,
  }

  if (def.startStrategy === 'minDensity') {
    const ladder = listOpticalSendLadder({
      ...baseCaps,
      // Prefer Light: list densest-first then take Lightest on prefer grid, else any Light.
      maxFrameBytes: 1000,
    })
    const onPrefer =
      ladder.find((s) => s.gridCodes === def.preferGrid && s.frameBytes === 1000) ??
      ladder.find((s) => s.frameBytes === 1000) ??
      ladder.at(-1)
    if (onPrefer) return { ...onPrefer, txFps }
    return {
      frameBytes: 1000,
      gridCodes: 1,
      moduleDevicePx: opticalModuleDevicePx({
        frameBytes: 1000,
        gridCodes: 1,
        stageWidthCss: stage.width,
        stageHeightCss: stage.height,
        devicePixelRatio: dpr,
      }),
      txFps,
    }
  }

  // maxDensity: densest on preferGrid first.
  const preferLadder = listOpticalSendLadder({
    ...baseCaps,
    maxGrid: def.preferGrid,
    preferGrid: def.preferGrid,
  })
  let best = preferLadder[0]

  // Fast: allow grid 4 only if faster than prefer×max and modules stay ≥4px.
  if (def.maxGrid >= 4 && def.preferGrid < 4) {
    const g4Ladder = listOpticalSendLadder({
      ...baseCaps,
      preferGrid: 4,
      maxGrid: 4,
    })
    const g4Best = g4Ladder[0]
    if (best && g4Best && g4Best.moduleDevicePx >= 4) {
      const preferKib = opticalThroughputKibPerSec(best.frameBytes, txFps, best.gridCodes)
      const g4Kib = opticalThroughputKibPerSec(g4Best.frameBytes, txFps, g4Best.gridCodes)
      if (g4Kib > preferKib) best = g4Best
    } else if (!best && g4Best) {
      best = g4Best
    }
  }

  if (!best) {
    // Last resort: Light × 1 even if slightly under floor.
    return {
      frameBytes: 1000,
      gridCodes: 1,
      moduleDevicePx: opticalModuleDevicePx({
        frameBytes: 1000,
        gridCodes: 1,
        stageWidthCss: stage.width,
        stageHeightCss: stage.height,
        devicePixelRatio: dpr,
      }),
      txFps,
    }
  }
  return { ...best, txFps }
}

/**
 * Next easier step: density down same grid, then grid down keeping Light.
 * Never returns a combo with smaller moduleDevicePx than current.
 */
export function nextEasierOpticalSendParams(opts: {
  frameBytes: number
  gridCodes: number
  containerBytes: number
  stageWidthCss?: number
  stageHeightCss?: number
  viewportWidth?: number
  viewportHeight?: number
  devicePixelRatio?: number
  maxGrid?: OpticalGridCodes
}): OpticalSendLadderStep | null {
  const stage = resolveStage(opts)
  const dpr = opts.devicePixelRatio ?? 1
  const currentFb = normalizeOpticalFrameBytes(opts.frameBytes)
  const currentGrid = normalizeOpticalGridCodes(opts.gridCodes)
  const currentPx = opticalModuleDevicePx({
    frameBytes: currentFb,
    gridCodes: currentGrid,
    stageWidthCss: stage.width,
    stageHeightCss: stage.height,
    devicePixelRatio: dpr,
  })

  const tryStep = (
    frameBytes: OpticalFrameBytes,
    gridCodes: OpticalGridCodes,
  ): OpticalSendLadderStep | null => {
    if (!opticalPayloadFits(opts.containerBytes, frameBytes)) return null
    if (
      !opticalDensityFitsScreen({
        frameBytes,
        gridCodes,
        stageWidthCss: stage.width,
        stageHeightCss: stage.height,
        devicePixelRatio: dpr,
      })
    ) {
      return null
    }
    const moduleDevicePx = opticalModuleDevicePx({
      frameBytes,
      gridCodes,
      stageWidthCss: stage.width,
      stageHeightCss: stage.height,
      devicePixelRatio: dpr,
    })
    if (moduleDevicePx < currentPx - 1e-6) return null
    return { frameBytes, gridCodes, moduleDevicePx }
  }

  // 1) One density step down, same grid.
  const lowerSameGrid = OPTICAL_FRAME_BYTES_OPTIONS.filter((d) => d < currentFb)
  const oneStep = lowerSameGrid.length ? lowerSameGrid[lowerSameGrid.length - 1]! : null
  if (oneStep) {
    const hit = tryStep(oneStep, currentGrid)
    if (hit) return hit
  }
  for (const fb of [...lowerSameGrid].reverse()) {
    const hit = tryStep(fb, currentGrid)
    if (hit) return hit
  }

  // 2) Smaller grid, keep Light (do not jump to Max).
  const smallerGrids = ([2, 1] as OpticalGridCodes[]).filter((g) => g < currentGrid)
  // Also allow 4→2 if somehow on 4.
  if (currentGrid === 4) smallerGrids.unshift(2)
  const uniqueSmaller = [...new Set(smallerGrids)]
  for (const grid of uniqueSmaller) {
    const hit = tryStep(1000, grid)
    if (hit) return hit
  }

  return null
}

export function canEaseOpticalSend(
  opts: Parameters<typeof nextEasierOpticalSendParams>[0],
): boolean {
  return nextEasierOpticalSendParams(opts) != null
}
