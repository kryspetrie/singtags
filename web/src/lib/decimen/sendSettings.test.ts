/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPTICAL_FRAME_BYTES,
  OPTICAL_FRAME_BYTES_LABELS,
  OPTICAL_TX_FPS_LABELS,
  formatOpticalThroughput,
  normalizeOpticalFrameBytes,
  opticalPayloadFits,
  suggestOpticalFrameBytes,
} from './sendSettings'

describe('sendSettings', () => {
  it('normalizes unknown frame bytes to the default', () => {
    expect(normalizeOpticalFrameBytes(999)).toBe(DEFAULT_OPTICAL_FRAME_BYTES)
    expect(normalizeOpticalFrameBytes(2331)).toBe(2331)
  })

  it('labels every frame-bytes option', () => {
    for (const value of [1000, 1465, 1850, 2331, 2953] as const) {
      expect(OPTICAL_FRAME_BYTES_LABELS[value].label.length).toBeGreaterThan(0)
    }
  })

  it('suggests a denser setting when the payload outgrows the current one', () => {
    const payload = 64 * 1024 * 1024
    expect(opticalPayloadFits(payload, 1000)).toBe(false)
    expect(suggestOpticalFrameBytes(payload)).toBeGreaterThan(1000)
  })

  it('formats throughput as kb/s from frame size and fps', () => {
    expect(formatOpticalThroughput(1465, 24)).toBe('34 kb/s')
    expect(formatOpticalThroughput(1000, 15)).toBe('15 kb/s')
  })

  it('labels every frame rate option', () => {
    for (const value of [15, 24, 30] as const) {
      expect(OPTICAL_TX_FPS_LABELS[value].label.length).toBeGreaterThan(0)
    }
  })
})
