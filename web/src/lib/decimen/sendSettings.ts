/**
 * Decimen optical-transfer send tuning (frame payload density and frame rate).
 */
import { fitsInOneStream, smallestSufficientFrameSize } from '../../../vendor/decimen/shared/frame-capacity'

/** Recommended fallback when the receiver struggles to catch frames. */
export const NO_SIGNAL_HINT_FRAME_BYTES = 1465
export const NO_SIGNAL_HINT_TX_FPS = 24

export const DEFAULT_OPTICAL_FRAME_BYTES = NO_SIGNAL_HINT_FRAME_BYTES
export const DEFAULT_OPTICAL_TX_FPS = NO_SIGNAL_HINT_TX_FPS

/** Bytes of payload packed into each animated QR frame. Higher = denser modules. */
export const OPTICAL_FRAME_BYTES_OPTIONS = [1000, 1465, 1850, 2331, 2953] as const
export type OpticalFrameBytes = (typeof OPTICAL_FRAME_BYTES_OPTIONS)[number]

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

export function normalizeOpticalFrameBytes(value: number): OpticalFrameBytes {
  return (OPTICAL_FRAME_BYTES_OPTIONS as readonly number[]).includes(value)
    ? (value as OpticalFrameBytes)
    : DEFAULT_OPTICAL_FRAME_BYTES
}

export function normalizeOpticalTxFps(value: number): OpticalTxFps {
  return (OPTICAL_TX_FPS_OPTIONS as readonly number[]).includes(value)
    ? (value as OpticalTxFps)
    : DEFAULT_OPTICAL_TX_FPS
}

/** Smallest offered frame size that can carry this payload, if any. */
export function suggestOpticalFrameBytes(payloadBytes: number): OpticalFrameBytes | undefined {
  const suggestion = smallestSufficientFrameSize(payloadBytes, OPTICAL_FRAME_BYTES_OPTIONS)
  return suggestion === undefined ? undefined : normalizeOpticalFrameBytes(suggestion)
}

export function opticalPayloadFits(payloadBytes: number, frameBytes: number): boolean {
  return fitsInOneStream(payloadBytes, frameBytes)
}

/** Effective send throughput from frame payload size and animation rate (KiB/s). */
export function opticalThroughputKibPerSec(frameBytes: number, txFps: number): number {
  return (frameBytes * txFps) / 1024
}

/** Human-readable optical throughput for UI labels (e.g. `34 kb/s`). */
export function formatOpticalThroughput(frameBytes: number, txFps: number): string {
  const kib = opticalThroughputKibPerSec(frameBytes, txFps)
  if (kib >= 100) return `${Math.round(kib)} kb/s`
  if (kib >= 10) return `${kib.toFixed(0)} kb/s`
  return `${kib.toFixed(1)} kb/s`
}
