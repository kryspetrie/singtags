/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRIMARY_NAV_ORDER,
  PRIMARY_NAV_PIN_COUNT,
  availablePrimaryNavOrder,
  fitNavPinsToWidth,
  maxBottomNavPins,
  morePrimaryNavIds,
  movePrimaryNavId,
  normalizePrimaryNavOrder,
  pinnedPrimaryNavIds,
  primaryNavIdForRouteName,
  resolvePrimaryNavPinCount,
  type PrimaryNavGates,
} from './primaryNav'

const ALL_ON: PrimaryNavGates = {
  localLibraryEnabled: true,
  singTogetherEnabled: true,
  tagStudioEnabled: true,
  webrtcTransferEnabled: true,
}

const ALL_OFF: PrimaryNavGates = {
  localLibraryEnabled: false,
  singTogetherEnabled: false,
  tagStudioEnabled: false,
  webrtcTransferEnabled: false,
}

describe('primaryNav', () => {
  it('normalizes order: drops unknowns, appends missing defaults', () => {
    expect(normalizePrimaryNavOrder(['roulette', 'browse', 'nope', 'browse', 'share'])).toEqual([
      'roulette',
      'browse',
      ...DEFAULT_PRIMARY_NAV_ORDER.filter((id) => id !== 'roulette' && id !== 'browse'),
    ])
    expect(normalizePrimaryNavOrder(null)).toEqual([...DEFAULT_PRIMARY_NAV_ORDER])
  })

  it('pins the first five available pages', () => {
    const order = normalizePrimaryNavOrder([
      'matcher',
      'browse',
      'settings',
      'queue',
      'labs',
      'recent',
    ])
    expect(pinnedPrimaryNavIds(order, { ...ALL_OFF, singTogetherEnabled: true })).toEqual([
      'matcher',
      'browse',
      'settings',
      'queue',
      'labs',
    ])
    expect(morePrimaryNavIds(order, { ...ALL_OFF, singTogetherEnabled: true })).toContain('recent')
    expect(pinnedPrimaryNavIds(order, ALL_OFF)).toHaveLength(PRIMARY_NAV_PIN_COUNT)
    expect(pinnedPrimaryNavIds(order, ALL_OFF)).not.toContain('matcher')
  })

  it('always includes Optical Transfer and Audio Recorder when labs gates are off', () => {
    const avail = availablePrimaryNavOrder(DEFAULT_PRIMARY_NAV_ORDER, ALL_OFF)
    expect(avail).toContain('tx')
    expect(avail).toContain('recorder')
    expect(avail).not.toContain('library')
    expect(avail).not.toContain('share' as never)
  })

  it('skips gated labs pages when building available order', () => {
    expect(availablePrimaryNavOrder(DEFAULT_PRIMARY_NAV_ORDER, ALL_OFF)).toEqual([
      'browse',
      'recent',
      'favorites',
      'pitch-pipe',
      'roulette',
      'settings',
      'recorder',
      'tx',
      'labs',
      'queue',
    ])
    expect(availablePrimaryNavOrder(DEFAULT_PRIMARY_NAV_ORDER, ALL_ON)).toHaveLength(
      DEFAULT_PRIMARY_NAV_ORDER.length,
    )
  })

  it('hides non-lab pages from available order', () => {
    expect(
      availablePrimaryNavOrder(DEFAULT_PRIMARY_NAV_ORDER, ALL_OFF, ['roulette', 'recent', 'tx']),
    ).toEqual(['browse', 'favorites', 'pitch-pipe', 'settings', 'recorder', 'labs', 'queue'])
    expect(
      pinnedPrimaryNavIds(DEFAULT_PRIMARY_NAV_ORDER, ALL_OFF, ['roulette']),
    ).not.toContain('roulette')
  })

  it('moves ids within the order', () => {
    const moved = movePrimaryNavId(DEFAULT_PRIMARY_NAV_ORDER, 'roulette', 0)
    expect(moved[0]).toBe('roulette')
    expect(moved[1]).toBe('browse')
  })

  it('maps nested routes to nav ids', () => {
    expect(primaryNavIdForRouteName('library-doc')).toBe('library')
    expect(primaryNavIdForRouteName('library-playlist')).toBe('library')
    expect(primaryNavIdForRouteName('recorder-session')).toBe('recorder')
    expect(primaryNavIdForRouteName('rx')).toBe('tx')
    expect(primaryNavIdForRouteName('wireless-rx')).toBe('wireless')
    expect(primaryNavIdForRouteName('os-share-transfer')).toBeNull()
    expect(primaryNavIdForRouteName('labs-pitch-pipe-sound')).toBe('labs')
    expect(primaryNavIdForRouteName('tag-studio')).toBe('tag-studio')
    expect(primaryNavIdForRouteName('tag-studio-edit')).toBe('tag-studio')
    expect(primaryNavIdForRouteName('tag')).toBeNull()
  })

  it('clamps bottom-bar pin capacity by width', () => {
    expect(maxBottomNavPins(288)).toBe(5) // 288/48 - 1 = 5
    expect(maxBottomNavPins(240)).toBe(4)
    expect(maxBottomNavPins(96)).toBe(1)
    expect(resolvePrimaryNavPinCount(8, 5)).toBe(5)
    expect(resolvePrimaryNavPinCount(3, 8)).toBe(3)
  })

  it('fits pin widths beside More', () => {
    expect(fitNavPinsToWidth([40, 40, 40, 40, 40], 48, 8, 280)).toBeGreaterThanOrEqual(1)
  })
})
