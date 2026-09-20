/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadMixPanMap,
  loadMixSelectedMap,
  loadPartsMode,
  loadPrimaryNavHidden,
  loadPrimaryNavOrder,
  loadPrimaryNavPinCount,
  loadSideMap,
} from './loaders'
import {
  LIBRARY_PARTS_MODE_KEY,
  MIX_PAN_KEY,
  MIX_PAN_KEY_V1,
  MIX_SELECTED_KEY,
  PRIMARY_NAV_HIDDEN_KEY,
  PRIMARY_NAV_ORDER_KEY,
  PRIMARY_NAV_PIN_COUNT_KEY,
} from './keys'

describe('preferences loaders', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads library parts mode', () => {
    expect(loadPartsMode()).toBe('all')
    localStorage.setItem(LIBRARY_PARTS_MODE_KEY, 'custom')
    expect(loadPartsMode()).toBe('custom')
    localStorage.setItem(LIBRARY_PARTS_MODE_KEY, 'invalid')
    expect(loadPartsMode()).toBe('all')
  })

  it('loads solo side map', () => {
    localStorage.setItem('solo', JSON.stringify({ lead: 'right', bad: 'center' }))
    expect(loadSideMap('solo')).toEqual({ lead: 'right' })
    expect(loadSideMap('missing')).toEqual({})
  })

  it('migrates v1 mix pan strings into v2 settings', () => {
    localStorage.setItem(MIX_PAN_KEY_V1, JSON.stringify({ lead: 'right', bari: 'left' }))
    expect(loadMixPanMap()).toEqual({
      lead: { mode: 'right', value: 1 },
      bari: { mode: 'left', value: -1 },
    })
    localStorage.setItem(
      MIX_PAN_KEY,
      JSON.stringify({ bass: { mode: 'custom', value: 0.25 } }),
    )
    expect(loadMixPanMap().bass).toEqual({ mode: 'custom', value: 0.25 })
  })

  it('loads mix selected map', () => {
    localStorage.setItem(MIX_SELECTED_KEY, JSON.stringify({ lead: true, bari: 'yes' }))
    expect(loadMixSelectedMap()).toEqual({ lead: true })
  })

  it('loads primary nav order, hidden, and pin count', () => {
    expect(loadPrimaryNavOrder()[0]).toBe('browse')
    localStorage.setItem(
      PRIMARY_NAV_ORDER_KEY,
      JSON.stringify(['roulette', 'browse', 'favorites', 'recent', 'pitch-pipe', 'queue']),
    )
    expect(loadPrimaryNavOrder()[0]).toBe('roulette')

    localStorage.setItem(PRIMARY_NAV_HIDDEN_KEY, JSON.stringify(['queue']))
    expect(loadPrimaryNavHidden()).toContain('queue')

    localStorage.setItem(PRIMARY_NAV_PIN_COUNT_KEY, '8')
    expect(loadPrimaryNavPinCount()).toBe(8)
  })
})
