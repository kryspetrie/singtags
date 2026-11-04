/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DRIVE_SYNC_POLL_DEFAULT_MINUTES,
  DRIVE_SYNC_POLL_MINUTES_KEY,
  __resetDriveSyncPollForTests,
  driveSyncPollLabel,
  getDriveSyncPollMinutes,
  normalizeDriveSyncPollMinutes,
  setDriveSyncPollMinutes,
  startDriveSyncPolling,
  stopDriveSyncPolling,
} from './driveSyncPoll'

vi.mock('./driveAppStateSync', () => ({
  ensureDriveHydrate: vi.fn(async () => undefined),
}))

vi.mock('./driveCacheSync', () => ({
  ensureDriveCacheSync: vi.fn(async () => undefined),
  isDriveCacheSyncEnabled: vi.fn(() => false),
}))

describe('driveSyncPoll', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetDriveSyncPollForTests()
    vi.useFakeTimers()
  })

  afterEach(() => {
    stopDriveSyncPolling()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('defaults to 5 minutes when unset', () => {
    expect(getDriveSyncPollMinutes()).toBe(DRIVE_SYNC_POLL_DEFAULT_MINUTES)
    expect(driveSyncPollLabel(0)).toBe('Off')
    expect(driveSyncPollLabel(1)).toBe('Every minute')
    expect(driveSyncPollLabel(5)).toBe('Every 5 minutes')
  })

  it('persists and normalizes poll minutes', () => {
    setDriveSyncPollMinutes(1)
    expect(localStorage.getItem(DRIVE_SYNC_POLL_MINUTES_KEY)).toBe('1')
    expect(getDriveSyncPollMinutes()).toBe(1)

    setDriveSyncPollMinutes(0)
    expect(getDriveSyncPollMinutes()).toBe(0)

    expect(normalizeDriveSyncPollMinutes(-3)).toBe(0)
    expect(normalizeDriveSyncPollMinutes(7)).toBe(7)
  })

  it('does not schedule an interval when polling is off', () => {
    const spy = vi.spyOn(window, 'setInterval')
    setDriveSyncPollMinutes(0)
    startDriveSyncPolling()
    expect(spy).not.toHaveBeenCalled()
  })

  it('schedules an interval when polling is enabled', () => {
    const spy = vi.spyOn(window, 'setInterval')
    setDriveSyncPollMinutes(1)
    startDriveSyncPolling()
    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls[0]?.[1]).toBe(60_000)
  })
})
