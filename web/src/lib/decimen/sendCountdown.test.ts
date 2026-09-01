/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOpticalSendCountdownSignal,
  OPTICAL_SEND_COUNTDOWN_SECONDS,
  OPTICAL_SEND_COUNTDOWN_STEP_MS,
  runOpticalSendCountdown,
} from './sendCountdown'

describe('runOpticalSendCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ticks 3, 2, 1 at one second intervals', async () => {
    const ticks: number[] = []
    const promise = runOpticalSendCountdown((value) => ticks.push(value))
    expect(ticks).toEqual([3])
    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS)
    expect(ticks).toEqual([3, 2])
    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS)
    expect(ticks).toEqual([3, 2, 1])
    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS)
    await expect(promise).resolves.toBe(true)
    expect(ticks).toHaveLength(OPTICAL_SEND_COUNTDOWN_SECONDS.length)
  })

  it('returns false when cancelled mid-countdown', async () => {
    const signal = createOpticalSendCountdownSignal()
    const ticks: number[] = []
    const promise = runOpticalSendCountdown((value) => ticks.push(value), signal)
    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS)
    signal.cancel()
    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS * 2)
    await expect(promise).resolves.toBe(false)
    expect(ticks).toEqual([3, 2])
  })
})
