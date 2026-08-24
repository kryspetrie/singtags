/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, getActivePinia, setActivePinia } from 'pinia'
import { useOnline } from './useOnline'
import { useObjectUrls } from './useObjectUrls'
import { useTagDetail } from './useTagDetail'
import { useReconnectCaches } from './useReconnectCaches'
import { useStarsStore } from '../stores/stars'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import type { TagDetail } from '../types/tag'

vi.mock('../lib/prepareSheet', () => ({
  prepareDefaultSheet: vi.fn(async () => ({ pages: ['blob:prepared'], owned: [] })),
  revokePreparedSheet: vi.fn(),
}))

describe('useOnline', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tracks online/offline events', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    const Comp = defineComponent({
      setup() {
        return useOnline()
      },
      template: '<span>{{ offline }}</span>',
    })
    const w = mount(Comp)
    expect(w.text()).toBe('false')
    window.dispatchEvent(new Event('offline'))
    await nextTick()
    expect(w.text()).toBe('true')
    window.dispatchEvent(new Event('online'))
    await nextTick()
    expect(w.text()).toBe('false')
    w.unmount()
  })
})

describe('useReconnectCaches', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('caches missing starred audio and resumes paused packs when back online', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    setActivePinia(createPinia())
    const stars = useStarsStore()
    const offlineLib = useOfflineLibraryStore()
    stars.records = [
      {
        tagId: 1,
        starredAt: '2026-01-01T00:00:00.000Z',
        summary: {
          id: 1,
          title: 'A',
          arranger: null,
          key: null,
          rating: null,
          type: null,
          collection: null,
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
        detail: null,
        offlineMedia: false,
        quotaWarning: null,
      },
    ]
    stars.loaded = true
    offlineLib.sheetsStatus = 'paused'
    offlineLib.audioStatus = 'idle'

    const ensureAudio = vi.spyOn(stars, 'ensureAudioForAllStarred').mockResolvedValue(1)
    const startPack = vi.spyOn(offlineLib, 'startPack').mockResolvedValue()
    vi.spyOn(stars, 'ensureLoaded').mockResolvedValue()

    const Comp = defineComponent({
      setup() {
        useReconnectCaches()
        return useOnline()
      },
      template: '<span>{{ offline }}</span>',
    })
    const w = mount(Comp, { global: { plugins: [getActivePinia()!] } })
    await nextTick()
    expect(w.text()).toBe('true')

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
    window.dispatchEvent(new Event('online'))
    await flushPromises()

    expect(ensureAudio).toHaveBeenCalled()
    expect(startPack).toHaveBeenCalledWith('sheets')
    expect(startPack).not.toHaveBeenCalledWith('audio')
    w.unmount()
  })
})

describe('useObjectUrls', () => {
  it('tracks and revokes blob URLs on unmount', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const Comp = defineComponent({
      setup() {
        const api = useObjectUrls()
        api.track('blob:test-1')
        api.track('blob:test-2')
        return api
      },
      template: '<div />',
    })
    const w = mount(Comp)
    w.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:test-1')
    expect(revoke).toHaveBeenCalledWith('blob:test-2')
    revoke.mockRestore()
  })
})

describe('useTagDetail', () => {
  const detail: TagDetail = {
    tag_id: 7,
    title: 'Hello',
    arranger: 'A',
    key: 'C',
    audio: { lead: 'media/7/lead.mp4' },
    sheet: 'sheets/7/pages/page-01.webp',
  }

  function mountApi(id: string | ReturnType<typeof ref<string>>) {
    let api!: ReturnType<typeof useTagDetail>
    const Comp = defineComponent({
      setup() {
        api = useTagDetail(id)
        return () => null
      },
    })
    const pinia = createPinia()
    setActivePinia(pinia)
    const w = mount(Comp, { global: { plugins: [pinia] } })
    return { api, w, pinia }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads network detail and builds summary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(detail), { status: 200 })),
    )
    const { api, w } = mountApi('7')
    await api.load()
    await flushPromises()
    expect(api.detail.value?.title).toBe('Hello')
    expect(api.sheetPages.value).toEqual(['sheets/7/pages/page-01.webp'])
    expect(api.sheetAssets.value.pdfs).toEqual([])
    expect(api.toSummary()?.id).toBe(7)
    expect(api.error.value).toBeNull()
    w.unmount()
  })

  it('exposes pdf separately and does not treat it as an image page', async () => {
    const pdfDetail: TagDetail = {
      ...detail,
      sheet: 'sheets/7/sheet.pdf',
      sheet_pages: ['sheets/7/pages/page-01.webp'],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(pdfDetail), { status: 200 })),
    )
    const { api, w } = mountApi('7')
    await api.load()
    expect(api.sheetPages.value).toEqual(['sheets/7/pages/page-01.webp'])
    expect(api.sheetAssets.value.pdfs.map((p) => p.path)).toEqual(['sheets/7/sheet.pdf'])
    w.unmount()
  })

  it('pdf-only tags leave sheetPages empty', async () => {
    const pdfOnly: TagDetail = {
      ...detail,
      sheet: 'sheets/7/sheet.pdf',
      sheet_pages: [],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(pdfOnly), { status: 200 })),
    )
    const { api, w } = mountApi('7')
    await api.load()
    expect(api.sheetPages.value).toEqual([])
    expect(api.sheetAssets.value.pdfs.map((p) => p.path)).toEqual(['sheets/7/sheet.pdf'])
    w.unmount()
  })

  it('resolves multiple sheets into image sets and pdfs', async () => {
    const multi: TagDetail = {
      ...detail,
      sheet: 'sheets/7/a.pdf',
      sheets: ['sheets/7/a.pdf', 'sheets/7/b.pdf', 'sheets/7/scan.jpg'],
      sheet_pages: ['sheets/7/pages/page-01.webp'],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(multi), { status: 200 })),
    )
    const { api, w } = mountApi('7')
    await api.load()
    expect(api.sheetAssets.value.pdfs).toHaveLength(2)
    expect(api.sheetAssets.value.imageSets.map((s) => s.label)).toEqual([
      'Pages',
      'scan.jpg',
    ])
    w.unmount()
  })

  it('falls back to starred cache when fetch fails', async () => {
    const { api, w, pinia } = mountApi('7')
    setActivePinia(pinia)
    const stars = useStarsStore()
    vi.spyOn(stars, 'ensureLoaded').mockResolvedValue()
    vi.spyOn(stars, 'get').mockResolvedValue({
      tagId: 7,
      starredAt: '2026-01-01T00:00:00.000Z',
      summary: {
        id: 7,
        title: 'Hello',
        arranger: 'A',
        key: 'C',
        rating: null,
        type: null,
        collection: null,
        hasSheet: true,
        audioParts: ['lead'],
        sheet: null,
      },
      detail,
      audioBlobs: {
        lead: { path: 'x', mime: 'audio/mp4', data: new ArrayBuffer(4) },
      },
      sheetBlobs: [{ path: 'y', mime: 'image/webp', data: new ArrayBuffer(2) }],
      offlineMedia: true,
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cached')

    await api.load()
    expect(api.fromCache.value).toBe(true)
    expect(api.detail.value?.tag_id).toBe(7)
    expect(api.audioParts.value.lead).toBe('blob:cached')
    expect(api.sheetPages.value).toEqual(['blob:cached'])
    w.unmount()
  })

  it('sets error when network and cache both missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
    const { api, w } = mountApi('99')
    await api.load()
    expect(api.error.value).toMatch(/Missing tag|500/)
    expect(api.toSummary()).toBeNull()
    w.unmount()
  })

  it('uses a clear offline message when tag is not cached', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    const { api, w } = mountApi('99')
    await api.load()
    expect(api.error.value).toMatch(/isn.?t cached/i)
    expect(api.detail.value).toBeNull()
    w.unmount()
  })
})
