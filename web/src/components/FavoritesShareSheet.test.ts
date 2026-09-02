/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import FavoritesShareSheet from './FavoritesShareSheet.vue'
import { qrDataUrl } from '../lib/qr'

vi.mock('../lib/qr', () => ({
  qrDataUrl: vi.fn(async (_text: string, size = 200) => `data:image/png;base64,qr-${size}`),
}))

describe('FavoritesShareSheet', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(async () => undefined) },
    })
    vi.mocked(qrDataUrl).mockClear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens with QR, copy link, and enlarge controls', async () => {
    const url = 'https://example.com/favorites?import=abc'
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    const w = mount(FavoritesShareSheet, {
      props: {
        open: true,
        url,
        tagCount: 3,
        tagIds: [1, 2, 3],
        title: 'Contest set',
      },
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    const root = document.body
    expect(root.textContent).toMatch(/Copy link/)
    expect(root.querySelector('button[aria-label="Transfer optically"]')).toBeFalsy()
    expect(root.textContent).toMatch(/Enlarge QR/)
    expect(root.textContent).toMatch(/3 tags/)
    expect(root.querySelector('img.share-qr')).toBeTruthy()
    expect(qrDataUrl).toHaveBeenCalledWith(url, 200)

    const copyBtn = [...root.querySelectorAll('button')].find((b) =>
      (b.textContent || '').includes('Copy link'),
    )
    copyBtn!.click()
    await flushPromises()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(url)
    w.unmount()
  })

  it('enlarges QR in a fullscreen overlay with zoom controls', async () => {
    const url = 'https://example.com/favorites?import=abc'
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    const w = mount(FavoritesShareSheet, {
      props: {
        open: true,
        url,
        tagCount: 2,
        tagIds: [1, 2],
      },
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    const enlargeBtn = [...document.body.querySelectorAll('button')].find(
      (b) => (b.textContent || '').trim() === 'Enlarge QR',
    )
    enlargeBtn!.click()
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    const overlay = document.body.querySelector('.qr-enlarge')
    expect(overlay).toBeTruthy()
    expect(overlay!.querySelector('.qr-enlarge-chrome')).toBeTruthy()
    expect(qrDataUrl).toHaveBeenCalledWith(url, 1024)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(document.body.querySelector('.qr-enlarge')).toBeNull()
    w.unmount()
  })
})
