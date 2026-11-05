import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRIVE_DOWNLOAD_MBPS,
  DOWNLOAD_SLOTS_MAX,
  DOWNLOAD_SLOTS_MIN,
  clampDriveDownloadMbps,
  createByteBudget,
  megabitsToBytesPerSec,
  nextDownloadSlots,
} from './downloadBudget'

describe('downloadBudget', () => {
  it('treats 6 megabits per second as 750,000 bytes per second', () => {
    expect(megabitsToBytesPerSec(DEFAULT_DRIVE_DOWNLOAD_MBPS)).toBe(750_000)
  })

  it('clamps a bad speed back into range', () => {
    expect(clampDriveDownloadMbps(Number.NaN)).toBe(DEFAULT_DRIVE_DOWNLOAD_MBPS)
    expect(clampDriveDownloadMbps(0)).toBe(0.5)
    expect(clampDriveDownloadMbps(10_000)).toBe(200)
  })

  it('spends the first second immediately and then waits', async () => {
    let t = 0
    const slept: number[] = []
    const budget = createByteBudget({
      bytesPerSec: 1000,
      now: () => t,
      sleep: async (ms) => {
        slept.push(ms)
        t += ms
      },
    })
    await budget.acquire(1000)
    await budget.acquire(500)
    expect(slept).toEqual([500])
  })

  it('does not let a pause build more than one second of credit', async () => {
    let t = 0
    const slept: number[] = []
    const budget = createByteBudget({
      bytesPerSec: 1000,
      now: () => t,
      sleep: async (ms) => {
        slept.push(ms)
        t += ms
      },
    })
    await budget.acquire(1000)
    t += 10_000
    await budget.acquire(1000)
    await budget.acquire(1000)
    expect(slept).toEqual([1000])
  })

  it('adds download slots only while the cap is idle', () => {
    expect(nextDownloadSlots({ slots: 4, waitedRatio: 0, saturated: true })).toBe(6)
    expect(nextDownloadSlots({ slots: 4, waitedRatio: 0.4, saturated: true })).toBe(3)
    expect(nextDownloadSlots({ slots: 4, waitedRatio: 0, saturated: false })).toBe(4)
    expect(nextDownloadSlots({ slots: DOWNLOAD_SLOTS_MAX, waitedRatio: 0, saturated: true })).toBe(
      DOWNLOAD_SLOTS_MAX,
    )
    expect(nextDownloadSlots({ slots: DOWNLOAD_SLOTS_MIN, waitedRatio: 1, saturated: true })).toBe(
      DOWNLOAD_SLOTS_MIN,
    )
  })
})
