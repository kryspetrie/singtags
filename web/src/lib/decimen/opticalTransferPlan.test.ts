/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  nextEasierOpticalSendParams,
  opticalModuleDevicePx,
} from './opticalSendEase'
import { pickOpticalSendStart } from './opticalSendLadder'
import { autoGridLadder, planOpticalTransfer } from './opticalTransferPlan'

const phoneStage = {
  stageWidthCss: 390 * 0.995,
  stageHeightCss: (844 - 168) * 0.995,
  devicePixelRatio: 2,
}

describe('autoGridLadder', () => {
  it('prefers 2-up first on phone portrait, with 1 as last resort', () => {
    expect(autoGridLadder(390, 844)).toEqual([2, 4, 1])
  })

  it('allows 1-up early on square-ish tablets', () => {
    expect(autoGridLadder(1024, 1024, { maxGrid: 4 })).toEqual([1, 2, 4])
  })
})

describe('pickOpticalSendStart / planOpticalTransfer', () => {
  it('Balanced starts densest legal on 2-up at 24 fps', () => {
    const start = pickOpticalSendStart({
      preset: 'balanced',
      containerBytes: 50_000,
      ...phoneStage,
    })
    expect(start.gridCodes).toBe(2)
    expect(start.frameBytes).toBe(2953)
    expect(start.txFps).toBe(24)

    const plan = planOpticalTransfer({
      containerBytes: 50_000,
      preset: 'balanced',
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
    })
    expect(plan.gridCodes).toBe(2)
    expect(plan.frameBytes).toBe(2953)
    expect(plan.txFps).toBe(24)
  })

  it('Reliable stays on Light', () => {
    const plan = planOpticalTransfer({
      containerBytes: 80_000,
      preset: 'reliable',
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
    })
    expect(plan.frameBytes).toBe(1000)
    expect(plan.gridCodes).toBeLessThanOrEqual(2)
    expect(plan.txFps).toBe(15)
  })

  it('Fast uses 30 fps and densest 2-up when 4-up is not worth it', () => {
    const plan = planOpticalTransfer({
      containerBytes: 200_000,
      preset: 'fast',
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
    })
    expect(plan.txFps).toBe(30)
    expect(plan.gridCodes).toBe(2)
    expect(plan.frameBytes).toBe(2953)
  })

  it('honors manual density when the screen can resolve it', () => {
    const plan = planOpticalTransfer({
      containerBytes: 12_000,
      autoDensity: false,
      qrFrameBytes: 2953,
      txFps: 15,
      gridCodes: 1,
      viewportWidth: 1920,
      viewportHeight: 1080,
      devicePixelRatio: 2,
    })
    expect(plan.autoDensity).toBe(false)
    expect(plan.frameBytes).toBe(2953)
    expect(plan.txFps).toBe(15)
  })
})

describe('nextEasierOpticalSendParams', () => {
  it('steps density down one notch on the same grid', () => {
    const next = nextEasierOpticalSendParams({
      frameBytes: 2331,
      gridCodes: 2,
      containerBytes: 50_000,
      ...phoneStage,
    })
    expect(next).toEqual(
      expect.objectContaining({ frameBytes: 1850, gridCodes: 2 }),
    )
  })

  it('from Light × 2 goes to Light × 1 (not Max × 1)', () => {
    const next = nextEasierOpticalSendParams({
      frameBytes: 1000,
      gridCodes: 2,
      containerBytes: 50_000,
      ...phoneStage,
    })
    expect(next).toEqual(
      expect.objectContaining({ frameBytes: 1000, gridCodes: 1 }),
    )
  })

  it('never decreases module device pixels', () => {
    let fb = 2953
    let grid = 2
    let prevPx = opticalModuleDevicePx({
      frameBytes: fb,
      gridCodes: grid,
      ...phoneStage,
    })
    for (let i = 0; i < 12; i++) {
      const next = nextEasierOpticalSendParams({
        frameBytes: fb,
        gridCodes: grid,
        containerBytes: 50_000,
        ...phoneStage,
      })
      if (!next) break
      expect(next.moduleDevicePx).toBeGreaterThanOrEqual(prevPx - 1e-6)
      fb = next.frameBytes
      grid = next.gridCodes
      prevPx = next.moduleDevicePx
    }
    expect(fb).toBe(1000)
    expect(grid).toBe(1)
  })

  it('returns null when already at Light × 1', () => {
    expect(
      nextEasierOpticalSendParams({
        frameBytes: 1000,
        gridCodes: 1,
        containerBytes: 50_000,
        ...phoneStage,
      }),
    ).toBeNull()
  })
})
