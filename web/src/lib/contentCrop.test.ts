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
})
