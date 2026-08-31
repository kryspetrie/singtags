/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { router } from './index'

describe('router', () => {
  it('registers primary routes', () => {
    const names = router.getRoutes().map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['home', 'tag', 'recent', 'favorites', 'pitch-pipe', 'queue']))
  })
})
