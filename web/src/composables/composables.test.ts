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
import {
  reconnectMediaPromptVisible,
  reconnectMediaPlan,
  acceptReconnectMediaPrompt,
  dismissReconnectMediaPrompt,
  reconnectMediaPromptMessage,
} from './useReconnectCaches'
import { offlineBannerText } from './useOfflineBanner'
import { useFavoritesStore } from '../stores/favorites'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { useOfflineModeStore } from '../stores/offlineMode'
import type { TagDetail } from '../types/tag'

vi.mock('../lib/prepareSheet', () => ({
  prepareDefaultSheet: vi.fn(async () => ({ pages: ['blob:prepared'], owned: [] })),
  revokePreparedSheet: vi.fn(),
}))

describe('useOnline', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('tracks browser online/offline events', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    setActivePinia(createPinia())
    useOfflineModeStore().init()
    const Comp = defineComponent({
      setup() {
        return useOnline()
      },
      template: '<span>{{ offline }}</span>',
    })
    const w = mount(Comp, { global: { plugins: [getActivePinia()!] } })
    expect(w.text()).toBe('false')
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
    await nextTick()
    expect(w.text()).toBe('true')
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    window.dispatchEvent(new Event('online'))
    await nextTick()
    expect(w.text()).toBe('false')
    w.unmount()
  })

  it('reflects manual offline without browser offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    setActivePinia(createPinia())
    const mode = useOfflineModeStore()
    mode.init()
    const Comp = defineComponent({
      setup() {
        return useOnline()
      },
      template: '<span>{{ offline }}</span>',
    })
    const w = mount(Comp, { global: { plugins: [getActivePinia()!] } })
    mode.setManualOffline(true)
    await nextTick()
    expect(w.text()).toBe('true')
    mode.setManualOffline(false)
    await nextTick()
    expect(w.text()).toBe('false')
    w.unmount()
  })
})

describe('offlineBannerText', () => {
  it('returns null when online', () => {
    expect(offlineBannerText(false, '2026-01-01', 'Offline — songbook sheets ready')).toBeNull()
  })

  it('warns when offline without catalog cache', () => {
    expect(offlineBannerText(true, null, 'Offline status unknown')).toMatch(/catalog not cached/)
  })

  it('uses library status when catalog is cached', () => {
    expect(offlineBannerText(true, '2026-01-01', 'Offline — songbook sheets ready')).toBe(
      'Offline — songbook sheets ready',
    )
  })
})

describe('useReconnectCaches', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    dismissReconnectMediaPrompt()
  })

  it('shows a reconnect prompt for missing starred audio and paused packs (does not auto-download)', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    setActivePinia(createPinia())
    useOfflineModeStore().init()
    const favorites = useFavoritesStore()
    const offlineLib = useOfflineLibraryStore()
    favorites.records = [
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
    favorites.loaded = true
    offlineLib.sheetsStatus = 'paused'
    offlineLib.audioStatus = 'idle'

    const ensureAudio = vi.spyOn(favorites, 'ensureAudioForAllStarred').mockResolvedValue(1)
    const startPack = vi.spyOn(offlineLib, 'startPack').mockResolvedValue()
    vi.spyOn(favorites, 'ensureLoaded').mockResolvedValue()

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
    await vi.waitFor(() => expect(reconnectMediaPromptVisible.value).toBe(true))
    expect(reconnectMediaPlan.value).toEqual({
      favoritesAudio: true,
      resumeSheets: true,
      resumeAudio: false,
    })
    expect(ensureAudio).not.toHaveBeenCalled()
    expect(startPack).not.toHaveBeenCalled()

    await acceptReconnectMediaPrompt()
    await flushPromises()
    expect(reconnectMediaPromptVisible.value).toBe(false)
    expect(ensureAudio).toHaveBeenCalled()
    expect(startPack).toHaveBeenCalledWith('sheets')
    expect(startPack).not.toHaveBeenCalledWith('audio')
    w.unmount()
  })

  it('dismissReconnectMediaPrompt hides without downloading', async () => {
    reconnectMediaPlan.value = {
      favoritesAudio: true,
      resumeSheets: false,
      resumeAudio: false,
    }
    reconnectMediaPromptVisible.value = true
    dismissReconnectMediaPrompt()
    expect(reconnectMediaPromptVisible.value).toBe(false)
    expect(reconnectMediaPlan.value).toBeNull()
  })

  it('reconnectMediaPromptMessage lists pending work', () => {
    expect(
      reconnectMediaPromptMessage({
        favoritesAudio: true,
        resumeSheets: false,
        resumeAudio: false,
      }),
    ).toMatch(/favorites/i)
    expect(
      reconnectMediaPromptMessage({
        favoritesAudio: true,
        resumeSheets: true,
        resumeAudio: true,
      }),
    ).toMatch(/sheet/i)
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
    audio: { lead: 'media/7/lead.m4a' },
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

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    const { sheetsPack, audioPack } = await import('../offline/libraryPack')
    await sheetsPack.clear()
    await audioPack.clear()
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
    expect(api.availableAudioParts.value).toEqual(['lead'])
    // Default part is warmed in the background so TagPlayer can paint without a blank first load.
    expect(api.audioParts.value).toEqual({ lead: 'media/7/lead.m4a' })
    expect(api.sheetPages.value).toEqual(['sheets/7/pages/page-01.webp'])
    expect(api.sheetAssets.value.pdfs).toEqual([])
    expect(api.toSummary()?.id).toBe(7)
    expect(api.error.value).toBeNull()
    w.unmount()
  })

  it('prefers pack metadata online so sheets are not blocked on network fetch', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(detail), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    const { sheetsPack } = await import('../offline/libraryPack')
    const { tagDetailUrl } = await import('../lib/mediaUrl')
    const packed: TagDetail = {
      ...detail,
      sheet_pages: ['sheets/7/pages/page-01.webp'],
      sheet: 'sheets/7/sheet.pdf',
    }
    await sheetsPack.put(
      tagDetailUrl('7'),
      new Response(JSON.stringify(packed), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const { api, w } = mountApi('7')
    await api.load()
    await flushPromises()
    expect(api.detail.value?.tag_id).toBe(7)
    expect(api.fromCache.value).toBe(true)
    expect(api.sheetPreparing.value).toBe(false)
    expect(api.sheetAssets.value.imageSets[0]?.paths).toEqual(['sheets/7/pages/page-01.webp'])
    expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes('/tags/7/metadata.json'))).toBe(
      false,
    )
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
    const favorites = useFavoritesStore()
    vi.spyOn(favorites, 'ensureLoaded').mockResolvedValue()
    vi.spyOn(favorites, 'get').mockResolvedValue({
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

  it('does not show bogus Image-file alternates when pages resolve to blob URLs', async () => {
    // Typical Tag Shop layout: PDF primary + Sheet.png + Preview.webp mirrors of pages.
    const shopDetail: TagDetail = {
      ...detail,
      sheet: 'sheets/7/Hello - Sheet.pdf',
      sheets: [
        'sheets/7/Hello - Sheet.pdf',
        'sheets/7/Hello - Sheet.png',
        'sheets/7/Hello - Sheet Preview.webp',
      ],
      sheet_preview: 'sheets/7/preview.webp',
      sheet_pages: ['sheets/7/preview.webp'],
    }
    const { api, w, pinia } = mountApi('7')
    setActivePinia(pinia)
    const favorites = useFavoritesStore()
    vi.spyOn(favorites, 'ensureLoaded').mockResolvedValue()
    vi.spyOn(favorites, 'get').mockResolvedValue({
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
        sheet: shopDetail.sheet,
      },
      detail: shopDetail,
      audioBlobs: {
        lead: { path: 'media/7/lead.m4a', mime: 'audio/mp4', data: new ArrayBuffer(4) },
      },
      sheetBlobs: [
        { path: 'sheets/7/preview.webp', mime: 'image/webp', data: new ArrayBuffer(2) },
      ],
      offlineMedia: true,
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sheet-page')

    await api.load()
    await flushPromises()
    // Catalog classification: pages only (png/preview are mirrors). Blob URLs must not
    // reintroduce those uploads as selectable “Image file” options.
    expect(api.sheetAssets.value.imageSets.map((s) => s.label)).toEqual(['Pages'])
    expect(api.sheetAssets.value.imageSets[0]?.paths).toEqual(['blob:sheet-page'])
    expect(api.sheetAssets.value.canChooseFormat).toBe(false)
    expect(api.sheetAssets.value.pdfs).toHaveLength(1)
    w.unmount()
  })

  it('sets error when network and cache both missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
    const { api, w } = mountApi('99')
    await api.load()
    expect(api.error.value).toMatch(/Missing tag|500|not cached/i)
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

  it('detects pack audio after loading online (offline resolve covered by reload test)', async () => {
    const tagged: TagDetail = {
      ...detail,
      sheet: null,
      sheet_pages: [],
      sheets: [],
      audio_tiers: {
        lead: {
          original: 'media/7/lead.m4a',
          playback: 'media/7/lead.playback.opus',
          ultra_solo: 'media/7/lead.solo.opus',
        },
      },
      audio_layout_summary: { ultra_low: 'mono_solos' },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(tagged), { status: 200 })),
    )
    const { api, w, pinia } = mountApi('7')
    setActivePinia(pinia)
    const offlineMode = useOfflineModeStore()
    offlineMode.init()

    const { audioPack, sheetsPack } = await import('../offline/libraryPack')
    const { mediaUrl, tagDetailUrl } = await import('../lib/mediaUrl')
    await audioPack.put(
      mediaUrl('media/7/lead.solo.opus'),
      new Response(new Uint8Array([9, 9, 9]), { headers: { 'Content-Type': 'audio/ogg' } }),
    )
    // Detail must resolve even if the fetch patch bypasses vi.stubGlobal('fetch').
    await sheetsPack.put(
      mediaUrl(tagDetailUrl('7')),
      new Response(JSON.stringify(tagged), { headers: { 'Content-Type': 'application/json' } }),
    )

    await api.load()
    await flushPromises()
    expect(api.hasPackAudio.value).toBe(true)
    w.unmount()
  })

  it('lists pack audio when loading a tag while already offline (reload)', async () => {
    const tagged: TagDetail = {
      ...detail,
      audio_tiers: {
        lead: {
          original: 'media/7/lead.m4a',
          playback: 'media/7/lead.playback.opus',
          ultra_solo: 'media/7/lead.solo.opus',
        },
      },
      audio_layout_summary: { ultra_low: 'mono_solos' },
    }
    localStorage.setItem('singtags.manualOffline', '1')
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const { api, w, pinia } = mountApi('7')
    setActivePinia(pinia)
    const offlineMode = useOfflineModeStore()
    offlineMode.init()
    expect(offlineMode.offline).toBe(true)

    const favorites = useFavoritesStore()
    vi.spyOn(favorites, 'ensureLoaded').mockResolvedValue()
    vi.spyOn(favorites, 'get').mockResolvedValue({
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
      detail: tagged,
      audioBlobs: {
        lead: { path: 'media/7/lead.m4a', mime: 'audio/mp4', data: new ArrayBuffer(8) },
      },
      offlineMedia: true,
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:star-lead')

    await api.load()
    await flushPromises()
    expect(api.detail.value?.tag_id).toBe(7)
    expect(api.availableAudioParts.value).toContain('lead')
    expect(api.audioParts.value.lead).toBe('blob:star-lead')
    w.unmount()
  })
})
