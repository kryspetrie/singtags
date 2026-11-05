/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import CacheTransferDetailsDialog from './CacheTransferDetailsDialog.vue'
import { __resetDriveCacheSyncForTests, driveCacheSyncState } from '../lib/google/driveCacheSync'
import { useCatalogStore } from '../stores/catalog'

describe('CacheTransferDetailsDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    __resetDriveCacheSyncForTests()
  })

  it('lists tags for an in-progress Drive upload', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const catalog = useCatalogStore()
    catalog.tags = [{ id: 9, title: 'Let Me Call You Sweetheart' } as (typeof catalog.tags)[number]]

    driveCacheSyncState.status = 'uploading'
    driveCacheSyncState.done = 1
    driveCacheSyncState.total = 2
    driveCacheSyncState.tagIds = [9, 4]
    driveCacheSyncState.finishedTagIds = [9]
    driveCacheSyncState.message = 'Uploading song cache to Google Drive…'

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/settings', component: { template: '<div />' } },
      ],
    })
    await router.push('/')

    const w = mount(CacheTransferDetailsDialog, {
      attachTo: document.body,
      props: { open: true },
      global: { plugins: [pinia, router] },
    })
    await flushPromises()

    const text = document.body.textContent || ''
    expect(text).toMatch(/Uploading to Google Drive/)
    expect(text).toMatch(/1 of 2 tags/)
    expect(text).toMatch(/Let Me Call You Sweetheart/)
    expect(text).toMatch(/Tag 4/)
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy()
    w.unmount()
  })
})
