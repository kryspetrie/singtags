/**
 * Choose optical send density / FPS / grid from the active preset’s ladder start.
 *
 * Balanced/Fast: densest screen-legal combo on prefer-grid (2-up), not ETA-minimized density.
 * Reliable: Light on prefer-grid.
 * Never pick a density/grid the screen cannot physically resolve (hard pixel floor).
 */
import {
  DEFAULT_OPTICAL_GRID_CODES,
  DEFAULT_OPTICAL_TX_FPS,
  estimateOpticalEtaSeconds,
  normalizeOpticalGridCodes,
  normalizeOpticalTxFps,
  type OpticalGridCodes,
  type OpticalTxFps,
} from './sendSettings'
import {
  clampOpticalFrameBytesToScreen,
  estimateOpticalStageCss,
  opticalDensityFitsScreen,
} from './opticalDensityResolve'
import {
  DEFAULT_OPTICAL_TRANSFER_PRESET,
  normalizeOpticalTransferPreset,
  OPTICAL_TRANSFER_PRESET_DEFS,
  type OpticalTransferPreset,
} from './opticalTransferPresets'
import { pickOpticalSendStart } from './opticalSendLadder'

export type OpticalTransferPlan = {
  symbology: 'qr'
  frameBytes: number
  txFps: OpticalTxFps
  gridCodes: OpticalGridCodes
  etaSeconds: number
  /** True when density/fps/grid were chosen from the preset ladder. */
  autoDensity: boolean
  /** True when ETA exceeds the preset’s targetSeconds (start combo unchanged). */
  exceedsTarget: boolean
  preset: OpticalTransferPreset
}

export type PlanOpticalTransferInput = {
  containerBytes: number
  /** User-facing preset (preferred). */
  preset?: OpticalTransferPreset
  /** @deprecated Prefer {@link preset}. When true (default), run Auto planner. */
  autoDensity?: boolean
  /** Manual override when autoDensity is false. */
  qrFrameBytes?: number
  txFps?: number
  gridCodes?: number
  /** Allow auto planner to raise multi-stream grid (default true). Kept for API compat. */
  autoGrid?: boolean
  targetSeconds?: number
  viewportWidth?: number
  viewportHeight?: number
  devicePixelRatio?: number
}

/** Narrow edge at/above this + square-ish aspect → allow 1-up early (legacy helper). */
export const OPTICAL_SQUARE_TABLET_MIN = 700
/** max/min side ratio ≤ this counts as square-ish. */
export const OPTICAL_SQUARE_ASPECT_MAX = 1.28

/**
 * Preferred grid search order for callers/tests: **2 first**, then denser if allowed,
 * and **1** as last resort (square tablets get 1 earlier).
 */
export function autoGridLadder(
  viewportWidth?: number,
  viewportHeight?: number,
  opts?: { maxGrid?: OpticalGridCodes },
): OpticalGridCodes[] {
  const w = viewportWidth ?? 390
  const h = viewportHeight ?? 844
  const maxGrid = opts?.maxGrid ?? 4
  const narrow = Math.min(w, h)
  const aspect = Math.max(w, h) / Math.max(1, narrow)
  const squareTablet = narrow >= OPTICAL_SQUARE_TABLET_MIN && aspect <= OPTICAL_SQUARE_ASPECT_MAX

  const out: OpticalGridCodes[] = []
  if (squareTablet) out.push(1)
  out.push(2)
  if (maxGrid >= 4) out.push(4)
  if (maxGrid >= 6) out.push(6)
  if (maxGrid >= 9) out.push(9)
  if (!squareTablet) out.push(1)
  return out
}

/** Drop grids that cannot resolve even Light density on this stage. */
export function filterGridLadderForScreen(
  ladder: OpticalGridCodes[],
  stage: { width: number; height: number },
  devicePixelRatio?: number,
): OpticalGridCodes[] {
  const allowed = ladder.filter((gridCodes) =>
    opticalDensityFitsScreen({
      frameBytes: 1000,
      gridCodes,
      stageWidthCss: stage.width,
      stageHeightCss: stage.height,
      devicePixelRatio,
    }),
  )
  return allowed.length ? allowed : [1]
}

/** Build a send plan for a packed wire container. */
export function planOpticalTransfer(input: PlanOpticalTransferInput): OpticalTransferPlan {
  const preset = normalizeOpticalTransferPreset(input.preset ?? DEFAULT_OPTICAL_TRANSFER_PRESET)
  const def = OPTICAL_TRANSFER_PRESET_DEFS[preset]
  const targetSeconds = input.targetSeconds ?? def.targetSeconds
  const autoDensity = input.autoDensity !== false
  const stage = estimateOpticalStageCss({
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
  })
  const dpr = input.devicePixelRatio

  if (!autoDensity) {
    const gridCodes = normalizeOpticalGridCodes(input.gridCodes ?? DEFAULT_OPTICAL_GRID_CODES)
    const frameBytes = clampOpticalFrameBytesToScreen(input.qrFrameBytes ?? 1465, {
      gridCodes,
      stageWidthCss: stage.width,
      stageHeightCss: stage.height,
      devicePixelRatio: dpr,
    })
    const txFps = normalizeOpticalTxFps(input.txFps ?? DEFAULT_OPTICAL_TX_FPS)
    const etaSeconds = estimateOpticalEtaSeconds(
      input.containerBytes,
      frameBytes,
      txFps,
      gridCodes,
    )
    return {
      symbology: 'qr',
      frameBytes,
      txFps,
      gridCodes,
      etaSeconds,
      autoDensity: false,
      exceedsTarget: etaSeconds > targetSeconds,
      preset,
    }
  }

  const start = pickOpticalSendStart({
    preset,
    containerBytes: input.containerBytes,
    stageWidthCss: stage.width,
    stageHeightCss: stage.height,
    devicePixelRatio: dpr,
  })
  const etaSeconds = estimateOpticalEtaSeconds(
    input.containerBytes,
    start.frameBytes,
    start.txFps,
    start.gridCodes,
  )
  return {
    symbology: 'qr',
    frameBytes: start.frameBytes,
    txFps: start.txFps,
    gridCodes: start.gridCodes,
    etaSeconds,
    autoDensity: true,
    exceedsTarget: etaSeconds > targetSeconds,
    preset,
  }
}

export function formatOpticalPlanSummary(plan: OpticalTransferPlan): string {
  const dens = `${plan.frameBytes} B/QR`
  const grid = plan.gridCodes > 1 ? ` · ${plan.gridCodes}-grid` : ''
  const eta =
    plan.etaSeconds < 10 ? `${plan.etaSeconds.toFixed(1)}s` : `${Math.round(plan.etaSeconds)}s`
  return `${dens} · ${plan.txFps} fps${grid} · ~${eta}`
}
