/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import OpticalReceiveInvite from './OpticalReceiveInvite.vue'
import { OPTICAL_RX_PATH } from '../lib/decimen/opticalTransferNav'
import { qrDataUrl } from '../lib/qr'

vi.mock('../lib/qr', () => ({
  qrDataUrl: vi.fn(async (_text: string, size = 200) => `data:image/png;base64,qr-${size}`),
}))

describe('OpticalReceiveInvite', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(qrDataUrl).mockClear()
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn(async () => {}) },
    })
  })

  it('shows a readonly /rx URL, inline QR, and copies it', async () => {
    const router = createRouter({
      history: createMemoryHistory('/'),
      routes: [{ path: OPTICAL_RX_PATH, name: 'rx', component: { template: '<div />' } }],
    })
    await router.push('/')
    const w = mount(OpticalReceiveInvite, {
      global: { plugins: [router] },
    })
    await flushPromises()
    const input = w.get('#optical-receive-url')
    expect((input.element as HTMLInputElement).value).toContain('/rx')
    expect((input.element as HTMLInputElement).value).not.toContain('mode=receive')
    expect(w.find('.inline-qr').exists()).toBe(true)
    await w.get('button.copy-btn').trigger('click')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      (input.element as HTMLInputElement).value,
    )
    w.unmount()
  })
})
