/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { findContentBounds } from './contentCrop'

function makeImageData(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return new ImageData(data, width, height)
}

describe('findContentBounds', () => {
  it('returns null for blank near-white pages', () => {
    const img = makeImageData(40, 40, () => [255, 255, 255, 255])
    expect(findContentBounds(img)).toBeNull()
  })

  it('finds ink with padding and skips tiny savings', () => {
    const img = makeImageData(100, 100, (x, y) => {
      if (x >= 20 && x <= 40 && y >= 25 && y <= 55) return [0, 0, 0, 255]
      return [255, 255, 255, 255]
    })
    const b = findContentBounds(img, { paddingRatio: 0.02, minAreaSavings: 0.08 })
    expect(b).not.toBeNull()
    expect(b!.x).toBeLessThanOrEqual(20)
    expect(b!.y).toBeLessThanOrEqual(25)
    expect(b!.x + b!.w).toBeGreaterThanOrEqual(40)
    expect(b!.y + b!.h).toBeGreaterThanOrEqual(55)
  })

  it('ignores speckles and a distant corner blob (5914-style)', () => {
    // Music block lower-left; sparse dots above; solid artifact bottom-right.
    const img = makeImageData(200, 120, (x, y) => {
      if (x >= 10 && x <= 110 && y >= 70 && y <= 110) return [0, 0, 0, 255]
      if (x === 40 && y === 15) return [30, 30, 30, 255]
      if (x === 90 && y === 25) return [20, 20, 20, 255]
      if (x >= 175 && x <= 199 && y >= 95 && y <= 119) return [0, 0, 0, 255]
      return [255, 255, 255, 255]
    })
    const b = findContentBounds(img, { paddingRatio: 0, minAreaSavings: 0.02 })
    expect(b).not.toBeNull()
    expect(b!.y).toBeGreaterThanOrEqual(60)
    expect(b!.x + b!.w).toBeLessThanOrEqual(130)
    expect(b!.x).toBeLessThanOrEqual(12)
    expect(b!.y + b!.h).toBeGreaterThanOrEqual(110)
  })

  it('keeps vertically stacked systems that share an x-range', () => {
    const img = makeImageData(160, 200, (x, y) => {
      if (x >= 20 && x <= 100 && y >= 20 && y <= 50) return [0, 0, 0, 255]
      if (x >= 20 && x <= 100 && y >= 140 && y <= 175) return [0, 0, 0, 255]
      // Distant corner smudge must not expand the crop.
      if (x >= 145 && x <= 159 && y >= 185 && y <= 199) return [0, 0, 0, 255]
      return [255, 255, 255, 255]
    })
    const b = findContentBounds(img, { paddingRatio: 0, minAreaSavings: 0.02 })
    expect(b).not.toBeNull()
    expect(b!.y).toBeLessThanOrEqual(22)
    expect(b!.y + b!.h).toBeGreaterThanOrEqual(175)
    expect(b!.x + b!.w).toBeLessThanOrEqual(108)
  })
})
