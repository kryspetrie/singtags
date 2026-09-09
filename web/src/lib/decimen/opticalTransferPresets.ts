/**
 * User-facing optical send presets — capability caps + shared ETA targets.
 * Each concrete mode picks the *least dense* screen-legal combo that still
 * finishes within {@link targetSeconds} (up to its max density / fps / grid).
 *
 * **Auto** (default) re-evaluates from queue size: most reliable concrete mode
 * that can still aim for ~3–4s.
 *
 * Max throughputs (prefer-grid): Ultra ~29 · Reliable ~54 · Balanced ~87 ·
 * Fast ~109 · Fastest ~173 (4-up only when Max×2 cannot hit the ETA).
 */
import type { OpticalFrameBytes, OpticalGridCodes, OpticalTxFps } from './sendSettings'
import { opticalThroughputKibPerSec } from './sendSettings'

export type OpticalTransferConcretePreset =
  | 'ultra'
  | 'reliable'
  | 'balanced'
  | 'fast'
  | 'fastest'

/** Scan mode: Auto or a pinned concrete preset. */
export type OpticalTransferPreset = 'auto' | OpticalTransferConcretePreset

export type OpticalTransferPresetDef = {
  id: OpticalTransferConcretePreset
  label: string
  /** Short description shown under the control. */
  hint: string
  /**
   * Airtime budget: choose the lowest density that finishes by this time.
   * Shared ~3–4s window across presets; caps differentiate throughput.
   */
  targetSeconds: number
  /** Densest QR payload this preset may escalate to (still screen-gated). */
  maxFrameBytes: OpticalFrameBytes
  /** Preferred simultaneous codes when several grids fit the ETA. */
  preferGrid: OpticalGridCodes
  /** Hard ceiling on multi-stream grid for this preset. */
  maxGrid: OpticalGridCodes
  /** Animation rate used while planning (higher = more throughput headroom). */
  maxTxFps: OpticalTxFps
}

export type OpticalTransferScanModeOption = {
  id: OpticalTransferPreset
  label: string
  hint: string
}

/** Default scan mode — re-evaluate concrete preset from transfer size. */
export const DEFAULT_OPTICAL_TRANSFER_PRESET: OpticalTransferPreset = 'auto'

/**
 * Shared planning window: least-dense combo that still aims for this airtime.
 * Auto also uses this when choosing among concrete modes.
 */
export const OPTICAL_PRESET_TARGET_SECONDS = 3.5

/** @deprecated Prefer {@link OPTICAL_PRESET_TARGET_SECONDS}. Kept for older call sites. */
export const OPTICAL_SMALL_FILE_RELIABLE_SECONDS = OPTICAL_PRESET_TARGET_SECONDS

export const OPTICAL_TRANSFER_CONCRETE_PRESETS: OpticalTransferConcretePreset[] = [
  'ultra',
  'reliable',
  'balanced',
  'fast',
  'fastest',
]

export const OPTICAL_TRANSFER_PRESET_DEFS: Record<
  OpticalTransferConcretePreset,
  OpticalTransferPresetDef
> = {
  ultra: {
    id: 'ultra',
    label: 'Ultra',
    hint: 'Single Light QR · largest modules · ~29 KB/s. Best for several feet away or multiple cameras.',
    targetSeconds: OPTICAL_PRESET_TARGET_SECONDS,
    maxFrameBytes: 1000,
    preferGrid: 1,
    maxGrid: 1,
    maxTxFps: 30,
  },
  reliable: {
    id: 'reliable',
    label: 'Reliable',
    hint: 'Up to Balanced density × 2-up @ 15 fps (~54 KB/s). Lowest density that still aims for ~3–4s.',
    targetSeconds: OPTICAL_PRESET_TARGET_SECONDS,
    maxFrameBytes: 1850,
    preferGrid: 2,
    maxGrid: 2,
    maxTxFps: 15,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    hint: 'Up to Balanced density × 2-up @ 24 fps (~87 KB/s). Lowest density that still aims for ~3–4s.',
    targetSeconds: OPTICAL_PRESET_TARGET_SECONDS,
    maxFrameBytes: 1850,
    preferGrid: 2,
    maxGrid: 2,
    maxTxFps: 24,
  },
  fast: {
    id: 'fast',
    label: 'Fast',
    hint: 'Up to Dense × 2-up @ 24 fps (~109 KB/s). Lowest density that still aims for ~3–4s.',
    targetSeconds: OPTICAL_PRESET_TARGET_SECONDS,
    maxFrameBytes: 2331,
    preferGrid: 2,
    maxGrid: 2,
    maxTxFps: 24,
  },
  fastest: {
    id: 'fastest',
    label: 'Fastest',
    hint: 'Up to Max × 2-up @ 30 fps (~173 KB/s); 4-up only when Max×2 cannot hit ~3–4s and modules stay large.',
    targetSeconds: OPTICAL_PRESET_TARGET_SECONDS,
    maxFrameBytes: 2953,
    preferGrid: 2,
    maxGrid: 4,
    maxTxFps: 30,
  },
}

export const OPTICAL_TRANSFER_AUTO_OPTION: OpticalTransferScanModeOption = {
  id: 'auto',
  label: 'Auto',
  hint: 'Re-evaluates from queue size: most reliable mode that still aims for ~3–4s.',
}

export const OPTICAL_TRANSFER_PRESET_OPTIONS: OpticalTransferScanModeOption[] = [
  OPTICAL_TRANSFER_AUTO_OPTION,
  ...OPTICAL_TRANSFER_CONCRETE_PRESETS.map((id) => {
    const def = OPTICAL_TRANSFER_PRESET_DEFS[id]
    return { id: def.id, label: def.label, hint: def.hint }
  }),
]

export function normalizeOpticalTransferPreset(value: unknown): OpticalTransferPreset {
  if (value === 'auto') return 'auto'
  if (
    value === 'ultra' ||
    value === 'reliable' ||
    value === 'balanced' ||
    value === 'fast' ||
    value === 'fastest'
  ) {
    return value
  }
  return DEFAULT_OPTICAL_TRANSFER_PRESET
}

export function normalizeOpticalTransferConcretePreset(
  value: unknown,
): OpticalTransferConcretePreset {
  if (
    value === 'ultra' ||
    value === 'reliable' ||
    value === 'balanced' ||
    value === 'fast' ||
    value === 'fastest'
  ) {
    return value
  }
  return 'balanced'
}

export function isOpticalTransferConcretePreset(
  value: OpticalTransferPreset,
): value is OpticalTransferConcretePreset {
  return value !== 'auto'
}

/** Reliability rank — lower is more conservative (lower throughput cap). */
export function opticalTransferPresetReliabilityRank(
  preset: OpticalTransferConcretePreset,
): number {
  switch (preset) {
    case 'ultra':
      return 0
    case 'reliable':
      return 1
    case 'balanced':
      return 2
    case 'fast':
      return 3
    case 'fastest':
      return 4
  }
}

/** Nominal max KiB/s when a preset is fully escalated (preferGrid, ignores screen gate). */
export function opticalTransferPresetMaxKibPerSec(
  preset: OpticalTransferConcretePreset,
): number {
  const def = OPTICAL_TRANSFER_PRESET_DEFS[preset]
  return opticalThroughputKibPerSec(def.maxFrameBytes, def.maxTxFps, def.preferGrid)
}
