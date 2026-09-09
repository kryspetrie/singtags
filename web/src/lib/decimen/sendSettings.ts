/**
 * Decimen optical-transfer send tuning (frame payload density, rate, grid).
 */
import {
  fitsInOneStream,
  smallestSufficientFrameSize,
  sourceBlockCount,
} from '../../../vendor/decimen/shared/frame-capacity'
import { expectedFountainOverhead } from '../../../vendor/decimen/shared/progress'

/** Recommended fallback when the receiver struggles to catch frames. */
export const NO_SIGNAL_HINT_FRAME_BYTES = 1465
export const NO_SIGNAL_HINT_TX_FPS = 24

export const DEFAULT_OPTICAL_FRAME_BYTES = NO_SIGNAL_HINT_FRAME_BYTES
export const DEFAULT_OPTICAL_TX_FPS = NO_SIGNAL_HINT_TX_FPS

/** Fullscreen QR fill factor (1 = max stage). Legacy prefs used 1–6 where 2 = full. */
export const DEFAULT_OPTICAL_DISPLAY_SCALE = 1
export const OPTICAL_DISPLAY_SCALE_MIN = 0.4
export const OPTICAL_DISPLAY_SCALE_MAX = 1

export function normalizeOpticalDisplayScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_OPTICAL_DISPLAY_SCALE
  // Migrate old 1–6 zoom (2 = fill) into a 0.4–1 fill factor.
  const fill = value > 1 ? value / 2 : value
  const clamped = Math.min(OPTICAL_DISPLAY_SCALE_MAX, Math.max(OPTICAL_DISPLAY_SCALE_MIN, fill))
  return Math.round(clamped * 20) / 20
}

/**
 * Aim transfers at this airtime window: pick the *lowest* density that still
 * finishes by {@link TARGET_OPTICAL_TRANSFER_SECONDS_MAX}.
 */
export const TARGET_OPTICAL_TRANSFER_SECONDS_MIN = 3
export const TARGET_OPTICAL_TRANSFER_SECONDS_MAX = 4

/** Bytes of payload packed into each animated QR frame. Higher = denser modules. */
export const OPTICAL_FRAME_BYTES_OPTIONS = [1000, 1465, 1850, 2331, 2953] as const
export type OpticalFrameBytes = (typeof OPTICAL_FRAME_BYTES_OPTIONS)[number]

/**
 * Experimental spatial multi-stream: simultaneous codes on screen.
 * Counts must tile exactly (see {@link gridDims}): 1, 2, 4, 6, 9.
 */
export const OPTICAL_GRID_CODES_OPTIONS = [1, 2, 4, 6, 9] as const
export type OpticalGridCodes = (typeof OPTICAL_GRID_CODES_OPTIONS)[number]
export const DEFAULT_OPTICAL_GRID_CODES: OpticalGridCodes = 2

/** Animated frames shown per second while sending. */
export const OPTICAL_TX_FPS_OPTIONS = [15, 24, 30] as const
export type OpticalTxFps = (typeof OPTICAL_TX_FPS_OPTIONS)[number]

export type OpticalTxFpsOption = {
  value: OpticalTxFps
  label: string
}

export const OPTICAL_TX_FPS_LABELS: Record<OpticalTxFps, OpticalTxFpsOption> = {
  15: { value: 15, label: 'Slow' },
  24: { value: 24, label: 'Medium' },
  30: { value: 30, label: 'Fast' },
}

export type OpticalFrameBytesOption = {
  value: OpticalFrameBytes
  label: string
  hint: string
}

export const OPTICAL_FRAME_BYTES_LABELS: Record<OpticalFrameBytes, OpticalFrameBytesOption> = {
  1000: { value: 1000, label: 'Light', hint: 'Simplest codes · slower transfer' },
  1465: { value: 1465, label: 'Standard', hint: 'Recommended default' },
  1850: { value: 1850, label: 'Balanced', hint: 'Denser codes · fewer frames' },
  2331: { value: 2331, label: 'Dense', hint: 'For large files when scanning is steady' },
  2953: { value: 2953, label: 'Maximum', hint: 'Most data per frame · hardest to scan' },
}

export const OPTICAL_GRID_CODES_LABELS: Record<
  OpticalGridCodes,
  { label: string; hint: string }
> = {
  1: { label: '1×1 (single)', hint: 'One code fills the stage' },
  2: { label: '1×2 / 2×1', hint: 'Two codes · stack in portrait, side-by-side in landscape' },
  4: { label: '2×2 grid', hint: 'Four parallel fountain streams' },
  6: { label: '2×3 / 3×2', hint: 'Six streams · follows screen orientation' },
  9: { label: '3×3 grid', hint: 'Nine streams · highest spatial rate' },
}

export function normalizeOpticalFrameBytes(value: number): OpticalFrameBytes {
  return (OPTICAL_FRAME_BYTES_OPTIONS as readonly number[]).includes(value)
    ? (value as OpticalFrameBytes)
    : DEFAULT_OPTICAL_FRAME_BYTES
}

export function normalizeOpticalGridCodes(value: number): OpticalGridCodes {
  return (OPTICAL_GRID_CODES_OPTIONS as readonly number[]).includes(value)
    ? (value as OpticalGridCodes)
    : DEFAULT_OPTICAL_GRID_CODES
}

export function normalizeOpticalTxFps(value: number): OpticalTxFps {
  return (OPTICAL_TX_FPS_OPTIONS as readonly number[]).includes(value)
    ? (value as OpticalTxFps)
    : DEFAULT_OPTICAL_TX_FPS
}

/** Expected fountain frames for a packed container at this frame size. */
export function expectedOpticalFrames(payloadBytes: number, frameBytes: number): number {
  const sourceBlocks = Math.max(1, sourceBlockCount(payloadBytes, frameBytes))
  return Math.max(
    sourceBlocks + 1,
    Math.ceil(sourceBlocks * expectedFountainOverhead(sourceBlocks)),
  )
}

/** Estimated airtime (seconds) for a fountain stream. */
export function estimateOpticalEtaSeconds(
  payloadBytes: number,
  frameBytes: number,
  txFps: number,
  gridCodes = 1,
): number {
  const frames = expectedOpticalFrames(payloadBytes, frameBytes)
  const cellsPerSec = Math.max(1, txFps) * Math.max(1, gridCodes)
  return frames / cellsPerSec
}

/**
 * Lowest (most reliable) density that still finishes within `targetSeconds`.
 * If none can, returns the densest viable option (fastest possible).
 */
export function pickLowestDensityForTargetEta(
  payloadBytes: number,
  options: readonly number[],
  txFps: number,
  gridCodes = 1,
  targetSeconds = TARGET_OPTICAL_TRANSFER_SECONDS_MAX,
): number | undefined {
  const viable = options
    .filter((option) => opticalPayloadFits(payloadBytes, option))
    .slice()
    .sort((a, b) => a - b)
  if (!viable.length) return undefined
  for (const frameBytes of viable) {
    if (estimateOpticalEtaSeconds(payloadBytes, frameBytes, txFps, gridCodes) <= targetSeconds) {
      return frameBytes
    }
  }
  return viable[viable.length - 1]
}

/** Smallest offered frame size that can carry this payload, if any. */
export function suggestOpticalFrameBytes(payloadBytes: number): OpticalFrameBytes | undefined {
  const suggestion = smallestSufficientFrameSize(payloadBytes, OPTICAL_FRAME_BYTES_OPTIONS)
  return suggestion === undefined ? undefined : normalizeOpticalFrameBytes(suggestion)
}

export function opticalPayloadFits(payloadBytes: number, frameBytes: number): boolean {
  return fitsInOneStream(payloadBytes, frameBytes)
}

/**
 * Effective send throughput from frame payload size, animation rate, and grid
 * parallelism (KiB/s). Grid refreshes `gridCodes` cells per display frame.
 */
export function opticalThroughputKibPerSec(
  frameBytes: number,
  txFps: number,
  gridCodes = 1,
): number {
  return (frameBytes * txFps * Math.max(1, gridCodes)) / 1024
}

/** Human-readable optical throughput for UI labels (e.g. `34 kb/s`). */
export function formatOpticalThroughput(
  frameBytes: number,
  txFps: number,
  gridCodes = 1,
): string {
  const kib = opticalThroughputKibPerSec(frameBytes, txFps, gridCodes)
  if (kib >= 100) return `${Math.round(kib)} kb/s`
  if (kib >= 10) return `${kib.toFixed(0)} kb/s`
  return `${kib.toFixed(1)} kb/s`
}
