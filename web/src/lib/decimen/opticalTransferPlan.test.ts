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
import {
  OPTICAL_PRESET_TARGET_SECONDS,
  opticalTransferPresetMaxKibPerSec,
} from './opticalTransferPresets'

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

describe('preset throughput steps', () => {
  it('spaces max KiB/s in roughly equal steps through Fast, then Fastest jumps for top speed', () => {
    const ultra = opticalTransferPresetMaxKibPerSec('ultra')
    const reliable = opticalTransferPresetMaxKibPerSec('reliable')
    const balanced = opticalTransferPresetMaxKibPerSec('balanced')
    const fast = opticalTransferPresetMaxKibPerSec('fast')
    const fastest = opticalTransferPresetMaxKibPerSec('fastest')
    expect(ultra).toBeCloseTo(29.3, 0)
    expect(reliable).toBeCloseTo(54.2, 0)
    expect(balanced).toBeCloseTo(86.7, 0)
    expect(fast).toBeCloseTo(109.3, 0)
    expect(fastest).toBeCloseTo(172.9, 0)

    const steps = [reliable - ultra, balanced - reliable, fast - balanced]
    for (const step of steps) {
      expect(step).toBeGreaterThan(15)
      expect(step).toBeLessThan(40)
    }
    expect(reliable / ultra).toBeLessThan(2.2)
    expect(balanced / reliable).toBeLessThan(2.2)
    expect(fast / balanced).toBeLessThan(1.6)
    expect(fastest).toBeGreaterThan(fast)
  })
})

describe('pickOpticalSendStart / planOpticalTransfer', () => {
  it('Balanced picks lowest density that still meets the ~3.5s target', () => {
    const start = pickOpticalSendStart({
      preset: 'balanced',
      containerBytes: 210_000,
      ...phoneStage,
    })
    expect(start.txFps).toBe(24)
    expect(start.gridCodes).toBeLessThanOrEqual(2)
    expect(start.frameBytes).toBeLessThanOrEqual(1850)
    expect(start.frameBytes).toBeGreaterThan(1000)

    const plan = planOpticalTransfer({
      containerBytes: 210_000,
      preset: 'balanced',
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
    })
    expect(plan.preset).toBe('balanced')
    expect(plan.etaSeconds).toBeLessThanOrEqual(OPTICAL_PRESET_TARGET_SECONDS + 0.05)
    expect(plan.frameBytes).toBe(start.frameBytes)
  })

  it('Balanced stays on Light for small payloads', () => {
    const plan = planOpticalTransfer({
      containerBytes: 20_000,
      preset: 'balanced',
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
    })
    expect(plan.frameBytes).toBe(1000)
    expect(plan.etaSeconds).toBeLessThanOrEqual(OPTICAL_PRESET_TARGET_SECONDS)
  })

  it('Ultra stays on Light × 1', () => {
    const plan = planOpticalTransfer({
      containerBytes: 80_000,
      preset: 'ultra',
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
    })
    expect(plan.preset).toBe('ultra')
    expect(plan.frameBytes).toBe(1000)
    expect(plan.gridCodes).toBe(1)
    expect(plan.txFps).toBe(30)
  })

  it('Reliable escalates only up to its density/fps caps', () => {
    const plan = planOpticalTransfer({
      containerBytes: 210_000,
      preset: 'reliable',
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
    })
    expect(plan.frameBytes).toBeLessThanOrEqual(1850)
    expect(plan.txFps).toBe(15)
    expect(plan.gridCodes).toBeLessThanOrEqual(2)
  })

  it('Fastest uses Max×2 @ 30 fps and only then 4-up when needed', () => {
    const small = planOpticalTransfer({
      containerBytes: 50_000,
      preset: 'fastest',
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
    })
    expect(small.txFps).toBe(30)
    expect(small.gridCodes).toBeLessThanOrEqual(2)

    const large = planOpticalTransfer({
      containerBytes: 2_000_000,
      preset: 'fastest',
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
    })
    expect(large.txFps).toBe(30)
    expect(large.frameBytes).toBeLessThanOrEqual(2953)
    // Prefer-grid throughput first; 4-up only as overflow when Max×2 cannot hit ETA.
    expect([2, 4]).toContain(large.gridCodes)
  })

  it('Fast may use denser codes than Balanced for the same payload', () => {
    const balanced = planOpticalTransfer({
      containerBytes: 400_000,
      preset: 'balanced',
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
    })
    const fast = planOpticalTransfer({
      containerBytes: 400_000,
      preset: 'fast',
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
    })
    expect(fast.txFps).toBe(24)
    const balKib = (balanced.frameBytes * balanced.txFps * balanced.gridCodes) / 1024
    const fastKib = (fast.frameBytes * fast.txFps * fast.gridCodes) / 1024
    expect(fastKib).toBeGreaterThanOrEqual(balKib)
  })

  it('Auto picks Ultra for small files', () => {
    const plan = planOpticalTransfer({
      containerBytes: 20_000,
      preset: 'auto',
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
    })
    expect(plan.scanMode).toBe('auto')
    expect(plan.preset).toBe('ultra')
    expect(plan.frameBytes).toBe(1000)
    expect(plan.gridCodes).toBe(1)
    expect(plan.txFps).toBe(30)
    expect(plan.etaSeconds).toBeLessThanOrEqual(OPTICAL_PRESET_TARGET_SECONDS)
  })

  it('Auto escalates past Ultra when Ultra cannot hit the ~3–4s window', () => {
    const plan = planOpticalTransfer({
      containerBytes: 210_000,
      preset: 'auto',
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
    })
    expect(plan.scanMode).toBe('auto')
    expect(plan.preset).not.toBe('ultra')
    expect(plan.etaSeconds).toBeLessThanOrEqual(OPTICAL_PRESET_TARGET_SECONDS + 0.05)
  })

  it('keeps preferred Fast for a small file when not Auto', () => {
    const plan = planOpticalTransfer({
      containerBytes: 20_000,
      preset: 'fast',
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
    })
    expect(plan.scanMode).toBe('fast')
    expect(plan.preset).toBe('fast')
    // Small file: Fast still picks Light (least dense that hits target).
    expect(plan.frameBytes).toBe(1000)
  })

  it('honors manual density when the screen can resolve it', () => {
    const plan = planOpticalTransfer({
      containerBytes: 12_000,
      autoDensity: false,
      preset: 'balanced',
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
