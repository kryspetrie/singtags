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
  audioRecorderEnabled: true,
  singTogetherEnabled: true,
  opticalTransferEnabled: true,
  webrtcTransferEnabled: true,
  osShareTransferEnabled: true,
}

const ALL_OFF: PrimaryNavGates = {
  localLibraryEnabled: false,
  audioRecorderEnabled: false,
  singTogetherEnabled: false,
  opticalTransferEnabled: false,
  webrtcTransferEnabled: false,
  osShareTransferEnabled: false,
}

describe('primaryNav', () => {
  it('normalizes order: drops unknowns, appends missing defaults', () => {
    expect(normalizePrimaryNavOrder(['roulette', 'browse', 'nope', 'browse'])).toEqual([
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

  it('skips gated pages when building available order', () => {
    expect(availablePrimaryNavOrder(DEFAULT_PRIMARY_NAV_ORDER, ALL_OFF)).toEqual([
      'browse',
      'recent',
      'favorites',
      'pitch-pipe',
      'roulette',
      'settings',
      'labs',
      'queue',
    ])
    expect(availablePrimaryNavOrder(DEFAULT_PRIMARY_NAV_ORDER, ALL_ON)).toHaveLength(
      DEFAULT_PRIMARY_NAV_ORDER.length,
    )
  })

  it('hides non-lab pages from available order', () => {
    expect(
      availablePrimaryNavOrder(DEFAULT_PRIMARY_NAV_ORDER, ALL_OFF, ['roulette', 'recent']),
    ).toEqual(['browse', 'favorites', 'pitch-pipe', 'settings', 'labs', 'queue'])
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
    expect(primaryNavIdForRouteName('os-share-transfer')).toBe('share')
    expect(primaryNavIdForRouteName('labs-pitch-pipe-sound')).toBe('labs')
    expect(primaryNavIdForRouteName('tag')).toBeNull()
  })

  it('clamps bottom-bar pin capacity by width', () => {
    expect(maxBottomNavPins(288)).toBe(5) // 288/48 - 1 = 5
    expect(maxBottomNavPins(240)).toBe(4)
    expect(maxBottomNavPins(96)).toBe(1)
    expect(resolvePrimaryNavPinCount(8, 5)).toBe(5)
    expect(resolvePrimaryNavPinCount(3, 8)).toBe(3)
  })

  it('fits desktop pins by dropping from the right', () => {
    // more=40, pins=80 each, gap=8 → 40+88*n
    expect(fitNavPinsToWidth([80, 80, 80, 80, 80], 40, 8, 400)).toBe(4) // 40+88*4=392
    expect(fitNavPinsToWidth([80, 80, 80, 80, 80], 40, 8, 392)).toBe(4)
    expect(fitNavPinsToWidth([80, 80, 80, 80, 80], 40, 8, 300)).toBe(2)
    expect(fitNavPinsToWidth([80, 80, 80, 80, 80], 40, 8, 50)).toBe(1)
    expect(fitNavPinsToWidth([80, 80], 40, 8, 1000)).toBe(2)
  })

  it('pins more than the default when pinCount is raised', () => {
    const pinned = pinnedPrimaryNavIds(DEFAULT_PRIMARY_NAV_ORDER, ALL_ON, [], 7)
    expect(pinned).toHaveLength(7)
    expect(morePrimaryNavIds(DEFAULT_PRIMARY_NAV_ORDER, ALL_ON, [], 7)[0]).toBe('recorder')
  })
})
