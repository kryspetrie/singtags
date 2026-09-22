/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import {
  clearCoachRollTransportState,
  coachRollTransportPrimary,
  coachRollTransportState,
  publishCoachRollTransport,
  registerCoachRollTransport,
} from './coachRollTransport'

describe('coachRollTransport', () => {
  it('forwards primary to registered handler', () => {
    const primary = vi.fn()
    const off = registerCoachRollTransport({
      prev: vi.fn(),
      next: vi.fn(),
      primary,
      hear: vi.fn(),
      lock: vi.fn(),
      skip: vi.fn(),
    })
    publishCoachRollTransport({
      active: true,
      model: {
        stepLabel: 'Pillars',
        status: '',
        showNav: false,
        prevLabel: '',
        nextLabel: '',
        prevDisabled: true,
        nextDisabled: true,
        primaryLabel: 'Go',
        primaryTitle: '',
        primaryDisabled: false,
        showHear: false,
        hearLabel: '',
        hearDisabled: true,
        showLock: false,
        lockDisabled: true,
        showSkip: false,
        skipDisabled: true,
        secondaryLabel: null,
        secondaryTitle: '',
        secondaryDisabled: true,
      },
    })
    expect(coachRollTransportState.value.active).toBe(true)
    coachRollTransportPrimary()
    expect(primary).toHaveBeenCalled()
    off()
    clearCoachRollTransportState()
  })
})
