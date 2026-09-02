/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import OfflineOpticalTransferPrompt from './OfflineOpticalTransferPrompt.vue'
import { OPTICAL_RX_PATH, opticalReceiveRoute } from '../lib/decimen/opticalTransferNav'

describe('OfflineOpticalTransferPrompt', () => {
  it('links to /rx for receive mode', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: OPTICAL_RX_PATH, name: 'rx', component: { template: '<div />' } }],
    })
    const w = mount(OfflineOpticalTransferPrompt, {
      global: { plugins: [router] },
    })
    const link = w.get('a.prompt-action')
    expect(link.attributes('href')).toBe('/rx')
    expect(link.attributes('aria-label')).toBe('Receive tags with optical transfer')
    expect(opticalReceiveRoute).toEqual({ name: 'rx' })
    w.unmount()
  })
})
