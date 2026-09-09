/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  clampOpticalFrameBytesToScreen,
  opticalDensityFitsScreen,
  opticalFrameBytesOptionsForScreen,
  qrDataModulesForFrameBytes,
} from './opticalDensityResolve'

describe('qrDataModulesForFrameBytes', () => {
  it('grows module count as density increases', () => {
    const light = qrDataModulesForFrameBytes(1000)
    const max = qrDataModulesForFrameBytes(2953)
    expect(light).toBeGreaterThan(20)
    expect(max).toBeGreaterThan(light)
  })
})

describe('opticalDensityFitsScreen', () => {
  it('rejects maximum density on a tiny low-dpr stage', () => {
    expect(
      opticalDensityFitsScreen({
        frameBytes: 2953,
        gridCodes: 1,
        stageWidthCss: 280,
        stageHeightCss: 280,
        devicePixelRatio: 1,
      }),
    ).toBe(false)
  })

  it('allows light density on a small stage', () => {
    expect(
      opticalDensityFitsScreen({
        frameBytes: 1000,
        gridCodes: 1,
        stageWidthCss: 280,
        stageHeightCss: 280,
        devicePixelRatio: 2,
      }),
    ).toBe(true)
  })
})

describe('opticalFrameBytesOptionsForScreen', () => {
  it('only returns densities the stage can resolve', () => {
    const options = opticalFrameBytesOptionsForScreen({
      gridCodes: 1,
      stageWidthCss: 320,
      stageHeightCss: 320,
      devicePixelRatio: 1,
    })
    expect(options.length).toBeGreaterThan(0)
    expect(options.includes(2953)).toBe(false)
    expect(options[0]).toBe(1000)
  })

  it('clamps preferred density down to a resolvable option', () => {
    const clamped = clampOpticalFrameBytesToScreen(2953, {
      gridCodes: 4,
      stageWidthCss: 360,
      stageHeightCss: 640,
      devicePixelRatio: 2,
    })
    expect(clamped).toBeLessThanOrEqual(2953)
    expect(
      opticalDensityFitsScreen({
        frameBytes: clamped,
        gridCodes: 4,
        stageWidthCss: 360,
        stageHeightCss: 640,
        devicePixelRatio: 2,
      }),
    ).toBe(true)
  })
})
