/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'
import { navigateBack } from './navigateBack'

function mockRouter(): Router {
  return {
    back: vi.fn(),
    push: vi.fn(),
  } as unknown as Router
}

describe('navigateBack', () => {
  it('uses history.back when an in-app previous entry exists', () => {
    const router = mockRouter()
    vi.stubGlobal('history', { state: { back: '/', current: '/tag/1' } })
    navigateBack(router, '/')
    expect(router.back).toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('falls back to push when there is no history back entry', () => {
    const router = mockRouter()
    vi.stubGlobal('history', { state: { back: null, current: '/tag/1' } })
    navigateBack(router, '/favorites')
    expect(router.back).not.toHaveBeenCalled()
    expect(router.push).toHaveBeenCalledWith('/favorites')
  })
})
