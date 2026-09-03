/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  OPTICAL_RX_PATH,
  OPTICAL_TX_PATH,
  isOpticalReceiveRoute,
  navigateToOpticalTransfer,
  opticalReceiveAbsoluteHref,
  opticalReceiveRoute,
} from './opticalTransferNav'

describe('opticalTransferNav', () => {
  it('builds an absolute receive URL at /rx', async () => {
    const router = createRouter({
      history: createMemoryHistory('/'),
      routes: [
        { path: OPTICAL_TX_PATH, name: 'tx', component: { template: '<div />' } },
        { path: OPTICAL_RX_PATH, name: 'rx', component: { template: '<div />' } },
      ],
    })
    await router.push('/')
    const href = opticalReceiveAbsoluteHref(router)
    expect(href).toContain('/rx')
    expect(href).not.toContain('mode=receive')
    expect(opticalReceiveRoute.name).toBe('rx')
  })

  it('detects receive from /rx and legacy mode query', () => {
    expect(
      isOpticalReceiveRoute({ name: 'rx', path: '/rx', query: {} }),
    ).toBe(true)
    expect(
      isOpticalReceiveRoute({ name: 'tx', path: '/tx', query: { mode: 'receive' } }),
    ).toBe(true)
    expect(
      isOpticalReceiveRoute({ name: 'tx', path: '/tx', query: {} }),
    ).toBe(false)
  })

  it('navigates local library docs onto /tx with openNow', async () => {
    const router = createRouter({
      history: createMemoryHistory('/'),
      routes: [
        { path: OPTICAL_TX_PATH, name: 'tx', component: { template: '<div />' } },
        { path: OPTICAL_RX_PATH, name: 'rx', component: { template: '<div />' } },
      ],
    })
    await router.push('/')
    await navigateToOpticalTransfer(router, {
      localDocIds: ['a', 'b'],
      localAssetIdsByEntry: { a: ['x'], b: ['y', 'z'] },
      openNow: true,
    })
    expect(router.currentRoute.value.name).toBe('tx')
    expect(router.currentRoute.value.query.localDocs).toBe('a,b')
    expect(router.currentRoute.value.query.openNow).toBe('1')
    expect(router.currentRoute.value.query.localAssets).toBe('a:x,b:y+z')
  })
})