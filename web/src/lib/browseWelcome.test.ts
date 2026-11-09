/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { shouldOfferBrowseWelcome } from './browseWelcome'

describe('shouldOfferBrowseWelcome', () => {
  it('offers on clean root Browse when not dismissed', () => {
    expect(
      shouldOfferBrowseWelcome({ dismissed: false, pathname: '/', search: '' }),
    ).toBe(true)
    expect(
      shouldOfferBrowseWelcome({ dismissed: false, pathname: '/', search: '?' }),
    ).toBe(true)
  })

  it('never offers after dismissal', () => {
    expect(
      shouldOfferBrowseWelcome({ dismissed: true, pathname: '/', search: '' }),
    ).toBe(false)
  })

  it('never offers on tag or other non-browse paths', () => {
    expect(
      shouldOfferBrowseWelcome({
        dismissed: false,
        pathname: '/tag/31',
        search: '',
      }),
    ).toBe(false)
    expect(
      shouldOfferBrowseWelcome({
        dismissed: false,
        pathname: '/favorites',
        search: '',
      }),
    ).toBe(false)
    expect(
      shouldOfferBrowseWelcome({
        dismissed: false,
        pathname: '/settings',
        search: '',
      }),
    ).toBe(false)
  })

  it('never offers on Browse deep links (filters / list position)', () => {
    expect(
      shouldOfferBrowseWelcome({
        dismissed: false,
        pathname: '/',
        search: '?at=1204',
      }),
    ).toBe(false)
    expect(
      shouldOfferBrowseWelcome({
        dismissed: false,
        pathname: '/',
        search: '?q=rose',
      }),
    ).toBe(false)
    expect(
      shouldOfferBrowseWelcome({
        dismissed: false,
        pathname: '/',
        search: '?col=Classic',
      }),
    ).toBe(false)
  })
})
