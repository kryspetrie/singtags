/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TagShareSheet from './TagShareSheet.vue'
import { usePreferencesStore } from '../stores/preferences'
import { qrDataUrl } from '../lib/qr'

vi.mock('../lib/qr', () => ({
  qrDataUrl: vi.fn(async (_text: string, size = 200) => `data:image/png;base64,qr-${size}`),
}))

describe('TagShareSheet', () => {
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

  it('opens with QR already generated, copy, enlarge, and fullscreen switch', async () => {
    usePreferencesStore().setShareFullscreen(false)
    const w = mount(TagShareSheet, {
      props: {
        open: true,
        url: 'https://example.com/tag/1',
        barbershopUrl: 'https://www.barbershoptags.com/tag-1-Hello',
        title: 'Hello',
      },
      attachTo: document.body,
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    const root = document.body
    expect(root.textContent).toMatch(/Copy link/)
    expect(root.textContent).toMatch(/Enlarge QR/)
    expect(root.textContent).toMatch(/Fullscreen/)
    expect(root.textContent).toMatch(/barbershoptags\.com/)
    expect(root.querySelector('img.share-qr')).toBeTruthy()
    expect(qrDataUrl).toHaveBeenCalledWith('https://example.com/tag/1', 200)

    const fsSwitch = root.querySelector(
      'input.setting-switch[aria-label="Open fullscreen sheet"]',
    ) as HTMLInputElement
    expect(fsSwitch).toBeTruthy()
    expect(fsSwitch.checked).toBe(false)
    fsSwitch.checked = true
    fsSwitch.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(usePreferencesStore().shareFullscreen).toBe(true)

    const copyBtn = [...root.querySelectorAll('button')].find((b) =>
      (b.textContent || '').includes('Copy link'),
    )
    expect(copyBtn).toBeTruthy()
    copyBtn!.click()
    await flushPromises()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.com/tag/1')
    w.unmount()
  })

  it('toggles to barbershoptags.com link and regenerates QR', async () => {
    const w = mount(TagShareSheet, {
      props: {
        open: true,
        url: 'https://example.com/tag/2?fullscreen=1',
        barbershopUrl: 'https://www.barbershoptags.com/tag-2-Song',
      },
      attachTo: document.body,
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    const bhs = document.body.querySelector(
      'input.setting-switch[aria-label="Link to barbershoptags.com"]',
    ) as HTMLInputElement
    expect(bhs).toBeTruthy()
    bhs.checked = true
    bhs.dispatchEvent(new Event('change'))
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    expect(usePreferencesStore().shareBarbershopTags).toBe(true)
    expect(document.body.querySelector('input.setting-switch[aria-label="Open fullscreen sheet"]')).toBeNull()
    const urlInput = document.body.querySelector('#tag-share-url') as HTMLInputElement
    expect(urlInput.value).toBe('https://www.barbershoptags.com/tag-2-Song')
    expect(qrDataUrl).toHaveBeenCalledWith('https://www.barbershoptags.com/tag-2-Song', 200)

    const copyBtn = [...document.body.querySelectorAll('button')].find((b) =>
      (b.textContent || '').includes('Copy link'),
    )
    copyBtn!.click()
    await flushPromises()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://www.barbershoptags.com/tag-2-Song',
    )
    w.unmount()
  })

  it('keeps SingTags URL when shift/detune is present even if barbershop toggle is on', async () => {
    usePreferencesStore().setShareBarbershopTags(true)
    const singUrl = 'https://example.com/tag/9?shift=2&detune=-32'
    const w = mount(TagShareSheet, {
      props: {
        open: true,
        url: singUrl,
        barbershopUrl: 'https://www.barbershoptags.com/tag-9-Song',
      },
      attachTo: document.body,
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    expect(document.body.textContent).toMatch(/Pitch shift \/ detune needs a SingTags link/)
    const urlInput = document.body.querySelector('#tag-share-url') as HTMLInputElement
    expect(urlInput.value).toBe(singUrl)
    expect(qrDataUrl).toHaveBeenCalledWith(singUrl, 200)
    w.unmount()
  })

  it('enlarges QR in a fullscreen overlay with top chrome size controls', async () => {
    const w = mount(TagShareSheet, {
      props: {
        open: true,
        url: 'https://example.com/tag/2',
      },
      attachTo: document.body,
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    const enlargeBtn = [...document.body.querySelectorAll('button')].find(
      (b) => (b.textContent || '').trim() === 'Enlarge QR',
    )
    expect(enlargeBtn).toBeTruthy()
    enlargeBtn!.click()
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    const overlay = document.body.querySelector('.qr-enlarge')
    expect(overlay).toBeTruthy()
    expect(overlay!.querySelector('.qr-enlarge-chrome')).toBeTruthy()
    expect(overlay!.querySelector('.chrome-btn.exit')).toBeTruthy()
    expect(overlay!.textContent).not.toMatch(/×/)
    expect(qrDataUrl).toHaveBeenCalledWith('https://example.com/tag/2', 1024)

    const larger = overlay!.querySelector('[aria-label="Make QR larger"]') as HTMLButtonElement
    const smaller = overlay!.querySelector('[aria-label="Make QR smaller"]') as HTMLButtonElement
    expect(larger).toBeTruthy()
    expect(smaller).toBeTruthy()
    larger.click()
    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(document.body.querySelector('.qr-enlarge')).toBeNull()
    w.unmount()
  })
})
