/**
 * Choose optical send density / FPS / grid from the active preset.
 *
 * All concrete presets aim for ~3–4s using the *lowest* density that still
 * finishes in that window, capped by each preset’s max density / fps / grid
 * (Ultra → Reliable → Balanced → Fast → Fastest).
 *
 * Scan mode **Auto** picks the most reliable concrete preset that can still
 * meet that window for the current transfer size.
 * Never pick a density/grid the screen cannot physically resolve.
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
  normalizeOpticalTransferConcretePreset,
  normalizeOpticalTransferPreset,
  OPTICAL_PRESET_TARGET_SECONDS,
  OPTICAL_TRANSFER_CONCRETE_PRESETS,
  OPTICAL_TRANSFER_PRESET_DEFS,
  type OpticalTransferConcretePreset,
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
  /** Concrete mode used for the plan (Auto is resolved first). */
  preset: OpticalTransferConcretePreset
  /** Scan mode the user selected (may be Auto). */
  scanMode: OpticalTransferPreset
}

export type PlanOpticalTransferInput = {
  containerBytes: number
  /** User-facing scan mode (Auto or a concrete preset). */
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

function etaForConcretePreset(
  preset: OpticalTransferConcretePreset,
  containerBytes: number,
  stage: { width: number; height: number },
  devicePixelRatio?: number,
): number {
  const start = pickOpticalSendStart({
    preset,
    containerBytes,
    stageWidthCss: stage.width,
    stageHeightCss: stage.height,
    devicePixelRatio,
  })
  return estimateOpticalEtaSeconds(
    containerBytes,
    start.frameBytes,
    start.txFps,
    start.gridCodes,
  )
}

/**
 * Resolve Auto (or pass through a concrete mode) from transfer size.
 * Auto = most reliable concrete preset whose plan still aims for ~3–4s;
 * if none can, Fastest.
 */
export function resolveOpticalTransferPreset(input: {
  containerBytes: number
  preferred?: OpticalTransferPreset
  viewportWidth?: number
  viewportHeight?: number
  devicePixelRatio?: number
  stageWidthCss?: number
  stageHeightCss?: number
}): OpticalTransferConcretePreset {
  const preferred = normalizeOpticalTransferPreset(
    input.preferred ?? DEFAULT_OPTICAL_TRANSFER_PRESET,
  )
  if (preferred !== 'auto') return normalizeOpticalTransferConcretePreset(preferred)
  if (!(input.containerBytes > 0)) return 'balanced'

  const stage =
    input.stageWidthCss != null && input.stageHeightCss != null
      ? { width: input.stageWidthCss, height: input.stageHeightCss }
      : estimateOpticalStageCss({
          viewportWidth: input.viewportWidth,
          viewportHeight: input.viewportHeight,
        })
  const budget = OPTICAL_PRESET_TARGET_SECONDS

  for (const preset of OPTICAL_TRANSFER_CONCRETE_PRESETS) {
    const eta = etaForConcretePreset(preset, input.containerBytes, stage, input.devicePixelRatio)
    if (eta <= budget) return preset
  }
  return 'fastest'
}

/** Build a send plan for a packed wire container. */
export function planOpticalTransfer(input: PlanOpticalTransferInput): OpticalTransferPlan {
  const scanMode = normalizeOpticalTransferPreset(input.preset ?? DEFAULT_OPTICAL_TRANSFER_PRESET)
  const preset = resolveOpticalTransferPreset({
    containerBytes: input.containerBytes,
    preferred: scanMode,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    devicePixelRatio: input.devicePixelRatio,
  })
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
      scanMode,
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
    scanMode,
  }
}

export function formatOpticalPlanSummary(plan: OpticalTransferPlan): string {
  const dens = `${plan.frameBytes} B/QR`
  const grid = plan.gridCodes > 1 ? ` · ${plan.gridCodes}-grid` : ''
  const eta =
    plan.etaSeconds < 10 ? `${plan.etaSeconds.toFixed(1)}s` : `${Math.round(plan.etaSeconds)}s`
  return `${dens} · ${plan.txFps} fps${grid} · ~${eta}`
}
