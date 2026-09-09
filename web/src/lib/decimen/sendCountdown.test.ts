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
    const ticks: Array<number | 'paused'> = []
    const promise = runOpticalSendCountdown((value) => ticks.push(value))
    expect(ticks).toEqual([3])
    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS)
    expect(ticks).toEqual([3, 2])
    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS)
    expect(ticks).toEqual([3, 2, 1])
    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS)
    await expect(promise).resolves.toBe(true)
    expect(ticks.filter((t) => t !== 'paused')).toHaveLength(OPTICAL_SEND_COUNTDOWN_SECONDS.length)
  })

  it('returns false when cancelled mid-countdown', async () => {
    const signal = createOpticalSendCountdownSignal()
    const ticks: Array<number | 'paused'> = []
    const promise = runOpticalSendCountdown((value) => ticks.push(value), signal)
    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS)
    signal.cancel()
    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS * 2)
    await expect(promise).resolves.toBe(false)
    expect(ticks.filter((t) => typeof t === 'number')).toEqual([3, 2])
  })

  it('pauses on toggle and restarts from 3 when toggled again', async () => {
    const signal = createOpticalSendCountdownSignal()
    const ticks: Array<number | 'paused'> = []
    const promise = runOpticalSendCountdown((value) => ticks.push(value), signal)
    expect(ticks.at(-1)).toBe(3)
    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS)
    expect(ticks.at(-1)).toBe(2)

    signal.togglePause()
    await vi.advanceTimersByTimeAsync(100)
    expect(ticks.at(-1)).toBe('paused')
    expect(signal.paused).toBe(true)

    // Time while paused should not finish the countdown.
    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS * 3)
    expect(ticks.at(-1)).toBe('paused')

    signal.togglePause()
    await vi.advanceTimersByTimeAsync(300)
    expect(signal.paused).toBe(false)
    expect(ticks.at(-1)).toBe(3)

    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS)
    expect(ticks.at(-1)).toBe(2)
    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS)
    expect(ticks.at(-1)).toBe(1)
    await vi.advanceTimersByTimeAsync(OPTICAL_SEND_COUNTDOWN_STEP_MS)
    await expect(promise).resolves.toBe(true)
  })
})
