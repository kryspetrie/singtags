import { describe, expect, it } from 'vitest'
import {
  isLabsReceiveFullscreenQuery,
  isWirelessReceiveRoute,
  WIRELESS_RX_PATH,
} from './labsTransferNav'

describe('labsTransferNav', () => {
  it('detects wireless receive routes', () => {
    expect(isWirelessReceiveRoute({ name: 'wireless-rx', path: WIRELESS_RX_PATH, query: {} })).toBe(
      true,
    )
    expect(isWirelessReceiveRoute({ name: 'wireless-transfer', path: '/wireless', query: {} })).toBe(
      false,
    )
    expect(
      isWirelessReceiveRoute({ name: 'wireless-transfer', path: '/wireless', query: { mode: 'receive' } }),
    ).toBe(true)
  })

  it('detects fullscreen receive query', () => {
    expect(isLabsReceiveFullscreenQuery({ fullscreen: null })).toBe(true)
    expect(isLabsReceiveFullscreenQuery({ fullscreen: '1' })).toBe(true)
    expect(isLabsReceiveFullscreenQuery({})).toBe(false)
  })
})
