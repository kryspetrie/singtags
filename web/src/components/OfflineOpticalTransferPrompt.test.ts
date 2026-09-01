/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import OfflineOpticalTransferPrompt from './OfflineOpticalTransferPrompt.vue'
import { opticalReceiveRoute } from '../lib/decimen/opticalTransferNav'

describe('OfflineOpticalTransferPrompt', () => {
  it('links to receive mode on the optical transfer page', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/optical-transfer', name: 'optical-transfer', component: { template: '<div />' } }],
    })
    const w = mount(OfflineOpticalTransferPrompt, {
      global: { plugins: [router] },
    })
    const link = w.get('a')
    expect(link.attributes('href')).toBe('/optical-transfer?mode=receive')
    expect(link.attributes('aria-label')).toBe('Receive tags with optical transfer')
    expect(w.text()).toMatch(/Transfer/)
    expect(opticalReceiveRoute).toEqual({
      name: 'optical-transfer',
      query: { mode: 'receive' },
    })
  })
})
