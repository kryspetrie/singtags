/**
 * @vitest-environment happy-dom
 *
 * Sing / fullscreen chrome: compact toolbar, Tag vs ✕, auto-enter, pages, wake lock.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SheetViewer from './SheetViewer.vue'
import { resetWakeLockForTests, wakeLockHoldersForTests } from '../lib/wakeLock'

vi.mock('../lib/contentCrop', () => ({
  cropImageUrl: vi.fn(async (url: string) => ({ url, revoke: false })),
  cropDrawnCanvas: vi.fn(async () => 'blob:cropped'),
  findContentBounds: vi.fn(() => null),
}))

vi.mock('../lib/pdfRender', () => ({
  DEFAULT_PDF_RENDER_DPI: 300,
  renderPdfToPageUrls: vi.fn(async () => ['blob:pdf-1']),
}))

describe('SheetViewer sing chrome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetWakeLockForTests()
    Element.prototype.scrollIntoView = vi.fn()
    const release = vi.fn(async () => {})
    const sentinel = { released: false, release, addEventListener: vi.fn() }
    vi.stubGlobal('navigator', {
      wakeLock: { request: vi.fn(async () => sentinel) },
    })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
  })

  afterEach(() => {
    resetWakeLockForTests()
    vi.unstubAllGlobals()
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''
  })

  async function mountFs(
    props: Record<string, unknown> = {},
    pages = ['sheets/1/p1.webp'],
  ) {
    const w = mount(SheetViewer, {
      props: {
        pages,
        baseUrl: '/library/',
        payKeyEnabled: true,
        keyLabel: 'Bb',
        singControls: true,
        ...props,
      },
      attachTo: document.body,
    })
    await flushPromises()
    if (!props.autoEnterFullscreen) {
      await w.get('button.fs-fab').trigger('click')
      await flushPromises()
      await new Promise((r) => setTimeout(r, 60))
      await flushPromises()
    } else {
      await flushPromises()
      await new Promise((r) => setTimeout(r, 60))
      await flushPromises()
    }
    return w
  }

  it('defaults to compact chrome: Pitch ±, more, exit (Play/Share/Tag behind ⋮)', async () => {
    const w = await mountFs()
    expect(w.find('.chrome.compact').exists()).toBe(true)
    expect(w.find('button.pitch-fab').exists()).toBe(true)
    expect(w.find('.chrome-shift').exists()).toBe(true)
    expect(w.find('.chrome-shift').text()).not.toMatch(/Reset/)
    expect(w.find('button.play-menu').exists()).toBe(false)
    expect(w.find('button.share').exists()).toBe(false)
    expect(w.find('button.tag-page').exists()).toBe(false)
    expect(w.find('button.more').exists()).toBe(true)
    expect(w.find('button.exit').exists()).toBe(true)
    expect(w.find('.chrome-play').exists()).toBe(false)
    w.unmount()
  })

  it('hides Play and playback chrome when singControls is off (no tracks)', async () => {
    const w = await mountFs({ singControls: false })
    expect(w.find('button.pitch-fab').exists()).toBe(true)
    expect(w.find('button.play-menu').exists()).toBe(false)
    expect(w.find('.chrome-play').exists()).toBe(false)
    expect(w.find('.chrome-shift').exists()).toBe(false)
    await w.get('button.more').trigger('click')
    await flushPromises()
    expect(w.find('button.play-menu').exists()).toBe(false)
    expect(w.find('button.share').exists()).toBe(true)
    expect(w.find('button.tag-page').exists()).toBe(true)
    expect(w.find('.chrome-play').exists()).toBe(false)
    expect(w.find('.chrome-shift').exists()).toBe(false)
    w.unmount()
  })

  it('more expands menu inline when space allows; ⋮ stays highlighted and ✕ stays put', async () => {
    const w = await mountFs({ shift: 1 })
    expect(w.find('.chrome-shift').exists()).toBe(true)
    expect(w.find('.chrome-more').exists()).toBe(false)
    expect(w.find('button.more').exists()).toBe(true)
    expect(w.find('button.more').classes()).not.toContain('is-expanded')
    expect(w.find('button.exit').exists()).toBe(true)

    await w.get('button.more').trigger('click')
    await flushPromises()
    expect(w.find('.chrome.compact').exists()).toBe(false)
    expect(w.find('.chrome-more').exists()).toBe(true)
    expect(w.find('.chrome-more button.tag-page').text()).toBe('Tag Page')
    expect(w.find('button.play-menu').exists()).toBe(true)
    expect(w.find('button.share').exists()).toBe(true)
    expect(w.find('.chrome-play').exists()).toBe(false)
    expect(w.find('button.more').classes()).toContain('is-expanded')
    // Primary chrome stays put
    expect(w.find('.chrome-trailing button.more').exists()).toBe(true)
    expect(w.find('.chrome-trailing button.exit').exists()).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))
    await flushPromises()
    expect(w.find('.chrome.compact').exists()).toBe(true)
    expect(w.find('.chrome-more').exists()).toBe(false)
    expect(w.find('button.play-menu').exists()).toBe(false)
    expect(w.find('button.more').classes()).not.toContain('is-expanded')
    w.unmount()
  })

  it('Play from ⋮ pops out playback controls and hides ⋮; Close stops and restores', async () => {
    const w = await mountFs({ playReady: true, duration: 12, currentTime: 3 })
    expect(w.find('button.more').exists()).toBe(true)
    expect(w.find('.chrome-play').exists()).toBe(false)

    await w.get('button.more').trigger('click')
    await flushPromises()
    await w.get('button.play-menu').trigger('click')
    await flushPromises()
    expect(w.emitted('play-toggle')).toBeTruthy()
    expect(w.find('.chrome-play').exists()).toBe(true)
    expect(w.find('button.play-menu').exists()).toBe(false)
    expect(w.find('button.more').exists()).toBe(false)
    expect(w.find('button.play-close').exists()).toBe(true)

    await w.get('button.play-close').trigger('click')
    await flushPromises()
    expect(w.emitted('play-stop')).toBeTruthy()
    expect(w.find('.chrome-play').exists()).toBe(false)
    expect(w.find('button.more').exists()).toBe(true)
    w.unmount()
  })

  it('Tag exits fullscreen without exit-origin; Escape matches ✕ (exit-origin)', async () => {
    const w = await mountFs({ exitOriginLabel: 'Browse' })
    await w.get('button.more').trigger('click')
    await flushPromises()
    await w.get('button.tag-page').trigger('click')
    await flushPromises()
    expect(w.emitted('fullscreen-change')?.at(-1)).toEqual([false])
    expect(w.emitted('exit-origin')).toBeFalsy()

    await w.get('button.fs-fab').trigger('click')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 60))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(w.emitted('exit-origin')).toBeTruthy()
    expect(w.emitted('fullscreen-change')?.at(-1)).toEqual([false])
    w.unmount()
  })

  it('exit and Escape emit exit-origin with list label', async () => {
    const w = await mountFs({ exitOriginLabel: 'Favorites' })
    const exit = w.get('button.exit')
    expect(exit.attributes('aria-label')).toContain('Favorites')
    await exit.trigger('click')
    await flushPromises()
    expect(w.emitted('exit-origin')).toBeTruthy()
    w.unmount()
  })

  it('auto-enters fullscreen when autoEnterFullscreen and pages are ready', async () => {
    const w = mount(SheetViewer, {
      props: {
        pages: ['sheets/1/p1.webp'],
        baseUrl: '/library/',
        payKeyEnabled: true,
        singControls: true,
        autoEnterFullscreen: true,
      },
      attachTo: document.body,
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 60))
    await flushPromises()
    expect(w.emitted('fullscreen-change')?.[0]).toEqual([true])
    expect(w.find('.chrome').exists()).toBe(true)
    w.unmount()
  })

  it('acquires sheet wake lock on fullscreen enter and releases on exit', async () => {
    const w = await mountFs()
    expect(wakeLockHoldersForTests()).toContain('sheet')
    await w.get('button.more').trigger('click')
    await flushPromises()
    await w.get('button.tag-page').trigger('click')
    await flushPromises()
    expect(wakeLockHoldersForTests()).not.toContain('sheet')
    w.unmount()
  })

  it('advances pages in fullscreen without scrollIntoView', async () => {
    const w = await mountFs({}, ['sheets/1/p1.webp', 'sheets/1/p2.webp'])
    await w.get('button.more').trigger('click')
    await flushPromises()
    const pages = w.get('.chrome-pages')
    expect(pages.text()).toContain('1/2')
    await pages.get('[aria-label="Next page"]').trigger('click')
    await flushPromises()
    expect(pages.text()).toContain('2/2')
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    w.unmount()
  })

  it('pitch fab sizes to max label sample without ellipsis or Reset', async () => {
    const w = await mountFs({ keyLabel: 'Bb +12 (Bb Major)', shift: 2 })
    const fab = w.get('button.pitch-fab')
    expect(fab.find('.pitch-label-sizer').exists()).toBe(true)
    expect(fab.find('.pitch-label').text()).toBe('Bb +12 (Bb Major)')
    expect(fab.find('.pitch-label').attributes('style') || '').not.toMatch(/ellipsis/)
    expect(w.find('.chrome-shift').text()).toMatch(/[−+\-]/)
    expect(w.find('.chrome-shift').text()).not.toMatch(/Reset/i)
    w.unmount()
  })
})
