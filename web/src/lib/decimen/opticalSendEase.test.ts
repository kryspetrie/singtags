/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { nextEasierOpticalSendParams } from './opticalSendEase'

describe('nextEasierOpticalSendParams', () => {
  it('steps density down on a large high-dpr stage', () => {
    const next = nextEasierOpticalSendParams({
      frameBytes: 2331,
      gridCodes: 1,
      containerBytes: 50_000,
      stageWidthCss: 900,
      stageHeightCss: 700,
      devicePixelRatio: 2,
    })
    expect(next).toEqual(expect.objectContaining({ frameBytes: 1850, gridCodes: 1 }))
  })

  it('reduces grid to Light when density is already Light', () => {
    const next = nextEasierOpticalSendParams({
      frameBytes: 1000,
      gridCodes: 2,
      containerBytes: 50_000,
      stageWidthCss: 900,
      stageHeightCss: 700,
      devicePixelRatio: 2,
    })
    expect(next).toEqual(expect.objectContaining({ frameBytes: 1000, gridCodes: 1 }))
  })

  it('returns null when already at Light × 1', () => {
    const next = nextEasierOpticalSendParams({
      frameBytes: 1000,
      gridCodes: 1,
      containerBytes: 50_000,
      stageWidthCss: 900,
      stageHeightCss: 700,
      devicePixelRatio: 2,
    })
    expect(next).toBeNull()
  })
})
