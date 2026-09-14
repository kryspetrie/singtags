/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  SHEET_ERODE_DEFAULT,
  SHEET_ERODE_STORAGE_KEY,
  SHEET_ERODE_STORAGE_KEY_V1,
  applySheetErodeToImageData,
  erodeRgbMin,
  normalizeSheetErodeLevel,
  resolveInitialSheetErodeLevel,
  sheetErodeFilterParams,
} from './sheetErode'

describe('sheetErode', () => {
  afterEach(() => {
    localStorage.removeItem(SHEET_ERODE_STORAGE_KEY)
    localStorage.removeItem(SHEET_ERODE_STORAGE_KEY_V1)
  })

  it('normalizes unknown to off', () => {
    expect(normalizeSheetErodeLevel('nope')).toBe(SHEET_ERODE_DEFAULT)
    expect(normalizeSheetErodeLevel('medium')).toBe('medium')
  })

  it('returns filter params only when enabled', () => {
    expect(sheetErodeFilterParams('off')).toBeNull()
    expect(sheetErodeFilterParams('light')!.amount).toBeLessThan(
      sheetErodeFilterParams('strong')!.amount,
    )
  })

  it('migrates v1 on → light', () => {
    localStorage.setItem(SHEET_ERODE_STORAGE_KEY_V1, '1')
    expect(resolveInitialSheetErodeLevel()).toBe('light')
  })

  it('erodes white neighbor into black (thickens ink)', () => {
    // 3×3: center black, rest white → after erode center stays black;
    // a white pixel adjacent to black becomes black (min).
    const w = 3
    const h = 3
    const src = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < src.length; i += 4) {
      src[i] = src[i + 1] = src[i + 2] = 255
      src[i + 3] = 255
    }
    const mid = (1 * w + 1) * 4
    src[mid] = src[mid + 1] = src[mid + 2] = 0
    const out = new Uint8ClampedArray(src.length)
    erodeRgbMin(src, out, w, h, 1)
    // Top-middle was white, now min with center black → black
    const top = (0 * w + 1) * 4
    expect(out[top]).toBe(0)
    expect(out[mid]).toBe(0)
  })

  it('applies dark-favoring tone crushing midtones', () => {
    const params = sheetErodeFilterParams('medium')!
    const toneOnly = { ...params, amount: 0 }
    const data = new ImageData(1, 1)
    data.data[0] = data.data[1] = data.data[2] = 128
    data.data[3] = 255
    applySheetErodeToImageData(data, toneOnly, false)
    expect(data.data[0]!).toBeLessThan(90)
  })

  it('keeps near-white paper relatively light', () => {
    const params = sheetErodeFilterParams('medium')!
    const toneOnly = { ...params, amount: 0 }
    const data = new ImageData(1, 1)
    data.data[0] = data.data[1] = data.data[2] = 250
    data.data[3] = 255
    applySheetErodeToImageData(data, toneOnly, false)
    expect(data.data[0]!).toBeGreaterThan(200)
  })
})
