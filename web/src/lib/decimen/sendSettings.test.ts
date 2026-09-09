/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { gridDims } from '../../../vendor/decimen/shared/qr-raster'
import {
  DEFAULT_OPTICAL_FRAME_BYTES,
  DEFAULT_OPTICAL_GRID_CODES,
  OPTICAL_FRAME_BYTES_LABELS,
  OPTICAL_FRAME_BYTES_OPTIONS,
  OPTICAL_GRID_CODES_LABELS,
  OPTICAL_GRID_CODES_OPTIONS,
  OPTICAL_TX_FPS_LABELS,
  TARGET_OPTICAL_TRANSFER_SECONDS_MAX,
  estimateOpticalEtaSeconds,
  formatOpticalThroughput,
  normalizeOpticalFrameBytes,
  normalizeOpticalGridCodes,
  opticalPayloadFits,
  opticalThroughputKibPerSec,
  pickLowestDensityForTargetEta,
  suggestOpticalFrameBytes,
} from './sendSettings'

describe('sendSettings', () => {
  it('normalizes unknown frame bytes to the default', () => {
    expect(normalizeOpticalFrameBytes(999)).toBe(DEFAULT_OPTICAL_FRAME_BYTES)
    expect(normalizeOpticalFrameBytes(2331)).toBe(2331)
  })

  it('normalizes multi-stream grid counts to tileable values', () => {
    expect(normalizeOpticalGridCodes(DEFAULT_OPTICAL_GRID_CODES)).toBe(1)
    expect(normalizeOpticalGridCodes(4)).toBe(4)
    expect(normalizeOpticalGridCodes(3)).toBe(DEFAULT_OPTICAL_GRID_CODES)
  })

  it('offers only grid counts that fill a rectangle (gridDims)', () => {
    for (const count of OPTICAL_GRID_CODES_OPTIONS) {
      const { cols, rows } = gridDims(count)
      expect(cols * rows).toBe(count)
      expect(OPTICAL_GRID_CODES_LABELS[count].label.length).toBeGreaterThan(0)
    }
  })

  it('labels every density option', () => {
    for (const value of OPTICAL_FRAME_BYTES_OPTIONS) {
      expect(OPTICAL_FRAME_BYTES_LABELS[value].label.length).toBeGreaterThan(0)
    }
  })

  it('suggests denser settings when needed for capacity', () => {
    const payload = 64 * 1024 * 1024
    expect(opticalPayloadFits(payload, 1000)).toBe(false)
    expect(suggestOpticalFrameBytes(payload)).toBeGreaterThan(1000)
  })

  it('picks the lowest density that still meets the 3s target', () => {
    // Tiny payload: light density should finish well under 3s.
    const tiny = 8_000
    const picked = pickLowestDensityForTargetEta(tiny, OPTICAL_FRAME_BYTES_OPTIONS, 24, 1)
    expect(picked).toBe(OPTICAL_FRAME_BYTES_OPTIONS[0])
    expect(estimateOpticalEtaSeconds(tiny, picked!, 24, 1)).toBeLessThanOrEqual(
      TARGET_OPTICAL_TRANSFER_SECONDS_MAX,
    )
  })

  it('raises density when light settings would exceed the target', () => {
    // ~200 KB at light QR / 15 fps is slower than 3s; picker should bump density.
    const mid = 200_000
    const lightEta = estimateOpticalEtaSeconds(mid, 1000, 15, 1)
    expect(lightEta).toBeGreaterThan(TARGET_OPTICAL_TRANSFER_SECONDS_MAX)
    const picked = pickLowestDensityForTargetEta(mid, OPTICAL_FRAME_BYTES_OPTIONS, 15, 1)
    expect(picked).toBeGreaterThan(1000)
    expect(estimateOpticalEtaSeconds(mid, picked!, 15, 1)).toBeLessThanOrEqual(lightEta)
  })

  it('scales throughput by grid parallelism', () => {
    expect(opticalThroughputKibPerSec(1000, 15, 1)).toBeCloseTo((1000 * 15) / 1024)
    expect(formatOpticalThroughput(1000, 15, 4)).toBe('59 kb/s')
  })

  it('labels every frame rate option', () => {
    for (const value of [15, 24, 30] as const) {
      expect(OPTICAL_TX_FPS_LABELS[value].label.length).toBeGreaterThan(0)
    }
  })
})
