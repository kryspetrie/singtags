import { describe, expect, it } from 'vitest'
import {
  qrCapacityAriaLabel,
  qrCapacityHint,
  qrCapacityPercent,
  qrTooLargeError,
  shouldBlockQrEncode,
} from './qrCapacityUi'

describe('qrCapacityPercent / aria', () => {
  it('rounds and clamps to 100', () => {
    expect(qrCapacityPercent(50, 100)).toBe(50)
    expect(qrCapacityPercent(99, 100)).toBe(99)
    expect(qrCapacityPercent(150, 100)).toBe(100)
    expect(qrCapacityPercent(0, 0)).toBe(100)
  })

  it('builds aria label', () => {
    expect(qrCapacityAriaLabel(25, 100)).toBe('QR capacity used 25 percent')
  })
})

describe('hints / errors / block', () => {
  it('returns warn then critical hints', () => {
    expect(qrCapacityHint({ warn: false, critical: false })).toBeNull()
    expect(qrCapacityHint({ warn: true, critical: false })).toContain('Getting full')
    expect(qrCapacityHint({ warn: true, critical: true })).toContain('Full')
  })

  it('formats too-large error', () => {
    expect(qrTooLargeError(3000, 2953)).toBe(
      'Too large for one QR (3000 / 2953 B). Remove songs.',
    )
  })

  it('blocks encode only when critical without fit', () => {
    expect(shouldBlockQrEncode({ critical: true, fit: null })).toBe(true)
    expect(
      shouldBlockQrEncode({ critical: true, fit: { version: 40, ecc: 'L' } }),
    ).toBe(false)
    expect(shouldBlockQrEncode({ critical: false, fit: null })).toBe(false)
  })
})
