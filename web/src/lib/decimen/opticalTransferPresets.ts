/**
 * User-facing optical send presets — starting points on the density ladder.
 */
import type { OpticalFrameBytes, OpticalGridCodes, OpticalTxFps } from './sendSettings'

export type OpticalTransferPreset = 'reliable' | 'balanced' | 'fast'

export type OpticalTransferStartStrategy = 'maxDensity' | 'minDensity'

export type OpticalTransferPresetDef = {
  id: OpticalTransferPreset
  label: string
  /** Short description shown under the control. */
  hint: string
  /** Airtime budget used only for exceedsTarget UI (does not change start combo). */
  targetSeconds: number
  /** Densest QR payload this preset may start with (still screen-gated). */
  maxFrameBytes: OpticalFrameBytes
  /** Preferred simultaneous codes for the start plan. */
  preferGrid: OpticalGridCodes
  /** Hard ceiling on multi-stream grid for this preset. */
  maxGrid: OpticalGridCodes
  /** Animation rate for the start plan. */
  maxTxFps: OpticalTxFps
  /** maxDensity = densest legal on preferGrid; minDensity = Light first. */
  startStrategy: OpticalTransferStartStrategy
}

export const DEFAULT_OPTICAL_TRANSFER_PRESET: OpticalTransferPreset = 'balanced'

export const OPTICAL_TRANSFER_PRESET_DEFS: Record<OpticalTransferPreset, OpticalTransferPresetDef> =
  {
    reliable: {
      id: 'reliable',
      label: 'Reliable',
      hint: 'Largest QR modules (Light × two codes when possible) · slower frames. Best if the camera is far away or already struggling.',
      targetSeconds: 10,
      maxFrameBytes: 1000,
      preferGrid: 2,
      maxGrid: 2,
      maxTxFps: 15,
      startStrategy: 'minDensity',
    },
    balanced: {
      id: 'balanced',
      label: 'Balanced',
      hint: 'Recommended. Starts with the densest readable 2-code grid. Tap Easier scan in fullscreen if the camera struggles.',
      targetSeconds: 6,
      maxFrameBytes: 2953,
      preferGrid: 2,
      maxGrid: 2,
      maxTxFps: 24,
      startStrategy: 'maxDensity',
    },
    fast: {
      id: 'fast',
      label: 'Fast',
      hint: 'Starts densest on a 2-code grid at 30 fps; may use 4 codes only when modules stay ≥4 device px and throughput rises. Use when phones are close and steady.',
      targetSeconds: 3,
      maxFrameBytes: 2953,
      preferGrid: 2,
      maxGrid: 4,
      maxTxFps: 30,
      startStrategy: 'maxDensity',
    },
  }

export const OPTICAL_TRANSFER_PRESET_OPTIONS: OpticalTransferPresetDef[] = [
  OPTICAL_TRANSFER_PRESET_DEFS.reliable,
  OPTICAL_TRANSFER_PRESET_DEFS.balanced,
  OPTICAL_TRANSFER_PRESET_DEFS.fast,
]

export function normalizeOpticalTransferPreset(value: unknown): OpticalTransferPreset {
  if (value === 'reliable' || value === 'balanced' || value === 'fast') return value
  return DEFAULT_OPTICAL_TRANSFER_PRESET
}
