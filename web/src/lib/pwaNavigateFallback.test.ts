import { describe, expect, it } from 'vitest'
import { LIBRARY_MEDIA_NAV_DENY, pwaNavigationGetsSpaShell } from './pwaNavigateFallback'

describe('pwaNavigationGetsSpaShell', () => {
  it('serves SPA for Local Library routes and other app paths', () => {
    expect(pwaNavigationGetsSpaShell('/')).toBe(true)
    expect(pwaNavigationGetsSpaShell('/library')).toBe(true)
    expect(pwaNavigationGetsSpaShell('/library/abc-123')).toBe(true)
    expect(pwaNavigationGetsSpaShell('/library/playlists/pl1')).toBe(true)
    expect(pwaNavigationGetsSpaShell('/tag/42')).toBe(true)
    expect(pwaNavigationGetsSpaShell('/favorites')).toBe(true)
  })

  it('denies SPA shell for catalog media files under /library/', () => {
    expect(pwaNavigationGetsSpaShell('/library/Some Tag/lead.m4a')).toBe(false)
    expect(pwaNavigationGetsSpaShell('/library/media/1/lead.solo.opus')).toBe(false)
    expect(pwaNavigationGetsSpaShell('/library/sheets/1/pages/page-01.webp')).toBe(false)
    expect(pwaNavigationGetsSpaShell('/library/sheets/1/sheet.pdf?x=1')).toBe(false)
    expect(LIBRARY_MEDIA_NAV_DENY.test('/library/a/b.json')).toBe(true)
  })

  it('denies /api/', () => {
    expect(pwaNavigationGetsSpaShell('/api/health')).toBe(false)
  })
})
