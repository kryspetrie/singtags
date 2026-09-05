/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import HomeView from './HomeView.vue'
import FavoritesView from './FavoritesView.vue'
import PitchPipeView from './PitchPipeView.vue'
import RecentView from './RecentView.vue'
import TagView from './TagView.vue'
import { useCatalogStore } from '../stores/catalog'
import { useFavoritesStore } from '../stores/favorites'
import { usePracticeStore } from '../stores/practice'
import { usePreferencesStore } from '../stores/preferences'
import { useRecentStore } from '../stores/recent'
import { useUserCollectionsStore } from '../stores/userCollections'

vi.mock('../audio/pitchPlayer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../audio/pitchPlayer')>()
  return {
    ...actual,
    PitchPlayer: class {
      async start(): Promise<void> {}
      stop(): void {}
      dispose(): void {}
    },
    keyToTonicNote: () => 'C4',
    formatKeyShiftLabel: (key: string | null | undefined, shift: number) => {
      if (!key) return shift ? `shift:${shift}` : '(Use +/- to choose key)'
      if (!shift) return key
      return `${key} ${shift > 0 ? '+' : ''}${shift}`
    },
    transposeKeyLabel: (key: string, n: number) => (n ? `${key}+${n}` : key),
    MIN_PITCH_SEMITONES: -12,
    MAX_PITCH_SEMITONES: 12,
    clampPitchSemitones: (n: number) => Math.max(-12, Math.min(12, Math.round(Number(n)) || 0)),
    CHROMATIC_NOTES: ['C3', 'C#3', 'D3'],
  }
})

vi.mock('../components/TagPlayer.vue', () => ({
  default: {
    name: 'TagPlayer',
    props: ['parts', 'pitchSemitones'],
    emits: ['transform', 'update:pitchSemitones', 'ended'],
    template: '<div data-testid="tag-player" />',
  },
}))

vi.mock('../components/SheetViewer.vue', () => ({
  default: {
    name: 'SheetViewer',
    props: ['pages', 'payKeyEnabled', 'keyLabel', 'shift'],
    template: '<div data-testid="sheet" />',
  },
}))

vi.mock('../lib/prepareSheet', () => ({
  prepareDefaultSheet: vi.fn(async () => ({ pages: [], owned: [] })),
  revokePreparedSheet: vi.fn(),
}))

vi.mock('../composables/useTagDetail', async () => {
  const { ref, computed } = await import('vue')
  return {
    useTagDetail: () => {
      const detail = ref({
        tag_id: 3,
        title: 'Practice Me',
        arranger: 'A',
        key: 'Bb',
        writ_key: 'Major:Bb',
        audio: { lead: 'media/3/lead.m4a' },
        sheet_pages: ['sheets/3/p1.webp'],
      })
      return {
        detail,
        error: ref(null),
        fromCache: ref(false),
        audioParts: ref({ lead: 'media/3/lead.m4a' }),
        availableAudioParts: ref(['lead']),
        hasLowerQualityAudio: ref(false),
        resolvePart: vi.fn(async () => 'media/3/lead.m4a'),
        sheetPages: computed(() => ['sheets/3/p1.webp']),
        sheetAssets: computed(() => ({
          imageSets: [{ id: 'pages', label: 'Pages', paths: ['sheets/3/p1.webp'] }],
          pdfs: [],
          canChooseFormat: false,
        })),
        preparedSheet: ref({ pages: ['sheets/3/p1.webp'], owned: [] }),
        loading: ref(false),
        sheetPreparing: ref(false),
        mediaSource: ref('network'),
        load: vi.fn(async () => {}),
        toSummary: () => ({
          id: 3,
          title: 'Practice Me',
          arranger: 'A',
          key: 'Bb',
          rating: null,
          type: null,
          collection: null,
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        }),
      }
    },
  }
})

function makeRouter(routes: Parameters<typeof createRouter>[0]['routes']) {
  return createRouter({ history: createMemoryHistory(), routes })
}

describe('view smoke tests', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('HomeView loads catalog and shows results', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    usePreferencesStore().dismissBrowseWelcome()
    const catalog = useCatalogStore()
    vi.spyOn(catalog, 'load').mockImplementation(async () => {
      catalog.$patch({
        loaded: true,
        loading: false,
        tags: [
          {
            id: 1,
            title: 'My Tag',
            arranger: 'A',
            key: 'C',
            rating: 4,
            type: 'Barbershop',
            collection: null,
            hasSheet: true,
            audioParts: ['lead'],
            sheet: null,
          },
        ],
      })
    })
    const favorites = useFavoritesStore()
    vi.spyOn(favorites, 'ensureLoaded').mockResolvedValue()

    const router = makeRouter([
      { path: '/', component: HomeView },
      { path: '/tag/:id', component: { template: '<div />' } },
    ])
    await router.push('/')
    const w = mount(HomeView, {
      global: {
        plugins: [pinia, router],
        stubs: { SearchChips: true, EmptyState: true, RouterLink: true },
      },
    })
    await flushPromises()
    expect(catalog.loaded).toBe(true)
    expect(w.find('.search-toolbar').exists()).toBe(true)
    expect(w.find('button.scan-qr-btn').exists()).toBe(true)
    w.unmount()
  })

  it('FavoritesView Sing mode tags favorite links with fullscreen=1', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const favorites = useFavoritesStore()
    const practice = usePracticeStore()
    vi.spyOn(favorites, 'ensureLoaded').mockResolvedValue()
    favorites.$patch({
      records: [
        {
          tagId: 9,
          starredAt: '2026-01-02T00:00:00.000Z',
          summary: {
            id: 9,
            title: 'Sing Me',
            arranger: null,
            key: 'G',
            rating: null,
            type: null,
            collection: null,
            hasSheet: true,
            audioParts: [],
            sheet: null,
          },
          detail: null,
          offlineMedia: false,
        },
      ],
      loaded: true,
    })
    practice.resetFromStarred([9])

    const router = makeRouter([
      { path: '/favorites', component: FavoritesView },
      { path: '/tag/:id', component: { template: '<div />' } },
    ])
    await router.push('/favorites')
    const w = mount(FavoritesView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          EmptyState: true,
          RouterLink: {
            props: ['to'],
            template: '<a class="fav-link-stub" :data-to="JSON.stringify(to)"><slot /></a>',
          },
        },
      },
    })
    await flushPromises()
    const prefs = usePreferencesStore()
    expect(prefs.singMode).toBe(false)
    prefs.setSingMode(true)
    await flushPromises()
    expect(prefs.singMode).toBe(true)
    const tos = w.findAll('.fav-link-stub').map((a) => JSON.parse(a.attributes('data-to') || '{}'))
    expect(tos.some((t) => t.path === '/tag/9' && t.query?.fullscreen === '1')).toBe(true)
    w.unmount()
  })

  it('FavoritesView sorts and reorders', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const favorites = useFavoritesStore()
    const practice = usePracticeStore()
    vi.spyOn(favorites, 'ensureLoaded').mockResolvedValue()
    favorites.$patch({
      records: [
        {
          tagId: 2,
          starredAt: '2026-01-02T00:00:00.000Z',
          summary: {
            id: 2,
            title: 'Second',
            arranger: null,
            key: 'G',
            rating: null,
            type: null,
            collection: null,
            hasSheet: false,
            audioParts: [],
            sheet: null,
          },
          detail: null,
          offlineMedia: false,
        },
        {
          tagId: 1,
          starredAt: '2026-01-01T00:00:00.000Z',
          summary: {
            id: 1,
            title: 'First',
            arranger: null,
            key: 'C',
            rating: null,
            type: null,
            collection: null,
            hasSheet: false,
            audioParts: [],
            sheet: null,
          },
          detail: null,
          offlineMedia: false,
        },
      ],
      loaded: true,
    })
    practice.resetFromStarred([2, 1])

    const router = makeRouter([
      { path: '/favorites', component: FavoritesView },
      { path: '/tag/:id', component: { template: '<div />' } },
    ])
    await router.push('/favorites')
    const w = mount(FavoritesView, {
      global: {
        plugins: [pinia, router],
        stubs: { EmptyState: true, RouterLink: true },
      },
    })
    await flushPromises()
    expect(practice.order).toEqual([2, 1])
    expect(w.find('.drag-handle').exists()).toBe(true)
    expect(w.text()).not.toMatch(/Start practice|Auto-advance|Reset order/)
    const sortSelect = w.find('select[aria-label="View favorites by"]')
    expect(sortSelect.exists()).toBe(true)
    expect((sortSelect.element as HTMLSelectElement).value).toBe('custom')
    practice.reorder(1, 0)
    expect(practice.order).toEqual([1, 2])
    await sortSelect.setValue('favorited-new')
    // Preview only — persisted custom order unchanged until Apply
    expect(practice.order).toEqual([1, 2])
    const applyBtn = w.find('button.sort-apply')
    expect(applyBtn.attributes('disabled')).toBeUndefined()
    await applyBtn.trigger('click')
    expect(practice.order).toEqual([2, 1])
    expect((sortSelect.element as HTMLSelectElement).value).toBe('custom')
    expect(applyBtn.attributes('disabled')).toBeDefined()
    await sortSelect.setValue('title')
    expect(practice.order).toEqual([2, 1])
    await applyBtn.trigger('click')
    expect(practice.order).toEqual([1, 2])
    w.unmount()
  })

  it('FavoritesView selects tags for collections and shows membership chips', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const favorites = useFavoritesStore()
    const practice = usePracticeStore()
    const collections = useUserCollectionsStore()
    vi.spyOn(favorites, 'ensureLoaded').mockResolvedValue()
    favorites.$patch({
      records: [
        {
          tagId: 2,
          starredAt: '2026-01-02T00:00:00.000Z',
          summary: {
            id: 2,
            title: 'Second',
            arranger: null,
            key: 'G',
            rating: null,
            type: null,
            collection: null,
            hasSheet: false,
            audioParts: [],
            sheet: null,
          },
          detail: null,
          offlineMedia: false,
        },
        {
          tagId: 1,
          starredAt: '2026-01-01T00:00:00.000Z',
          summary: {
            id: 1,
            title: 'First',
            arranger: null,
            key: 'C',
            rating: null,
            type: null,
            collection: null,
            hasSheet: true,
            audioParts: [],
            sheet: null,
          },
          detail: null,
          offlineMedia: true,
        },
      ],
      loaded: true,
    })
    practice.resetFromStarred([2, 1])
    collections.create('Contest set', [1])

    const router = makeRouter([
      { path: '/favorites', component: FavoritesView },
      { path: '/tag/:id', component: { template: '<div />' } },
    ])
    await router.push('/favorites')
    const w = mount(FavoritesView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          EmptyState: true,
          RouterLink: {
            props: ['to'],
            template: '<a class="row-link"><slot /></a>',
          },
          CollectionPickerSheet: {
            props: ['open', 'tagIds', 'title'],
            emits: ['close', 'done'],
            template:
              '<div v-if="open" data-testid="picker">{{ title }}:{{ tagIds.join(",") }}</div>',
          },
        },
      },
    })
    await flushPromises()

    expect(w.find('.col-chip').exists()).toBe(true)
    expect(w.find('.col-chip').text()).toContain('Contest set')
    expect(w.find('button.chip-add').exists()).toBe(false)

    await w.get('.col-chip').trigger('click')
    await flushPromises()
    expect(w.text()).toMatch(/in “Contest set”/)
    await w.get('.col-chip').trigger('click')
    await flushPromises()
    expect(w.text()).not.toMatch(/in “Contest set”/)

    const sel = w.findAll('button.sel-btn')
    expect(sel.length).toBeGreaterThan(0)
    await sel[0]!.trigger('click')
    await flushPromises()
    const bar = document.body.querySelector('.selection-bar')
    expect(bar?.textContent).toMatch(/1 selected/)
    expect(bar?.querySelector('button[aria-label="Add to collection"]')).toBeTruthy()
    expect(bar?.querySelector('button[aria-label="Queue download"]')).toBeTruthy()
    const addBtn = bar!.querySelector('button[aria-label="Add to collection"]') as HTMLButtonElement
    expect(addBtn).toBeTruthy()
    addBtn.click()
    await flushPromises()
    expect(w.find('[data-testid="picker"]').text()).toContain('Add to collection:2')
    w.unmount()
  })

  it('RecentView selects tags for collections', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const catalog = useCatalogStore()
    const favorites = useFavoritesStore()
    const recent = useRecentStore()
    vi.spyOn(catalog, 'load').mockResolvedValue()
    vi.spyOn(favorites, 'ensureLoaded').mockResolvedValue()
    catalog.$patch({
      loaded: true,
      loading: false,
      tags: [
        {
          id: 7,
          title: 'Recent One',
          arranger: null,
          key: 'C',
          rating: null,
          type: null,
          collection: null,
          hasSheet: true,
          audioParts: [],
          sheet: null,
        },
        {
          id: 8,
          title: 'Recent Two',
          arranger: null,
          key: 'G',
          rating: null,
          type: null,
          collection: null,
          hasSheet: false,
          audioParts: [],
          sheet: null,
        },
      ],
    })
    recent.$patch({
      entries: [
        { id: 7, opens: 3, lastOpenedAt: '2026-01-02T00:00:00.000Z' },
        { id: 8, opens: 1, lastOpenedAt: '2026-01-01T00:00:00.000Z' },
      ],
    })

    const router = makeRouter([
      { path: '/recent', component: RecentView },
      { path: '/tag/:id', component: { template: '<div />' } },
    ])
    await router.push('/recent')
    const w = mount(RecentView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          EmptyState: true,
          RouterLink: {
            props: ['to'],
            template: '<a class="row-link"><slot /></a>',
          },
          CollectionPickerSheet: {
            props: ['open', 'tagIds', 'title'],
            emits: ['close', 'done'],
            template:
              '<div v-if="open" data-testid="picker">{{ title }}:{{ tagIds.join(",") }}</div>',
          },
        },
      },
    })
    await flushPromises()

    const sel = w.findAll('button.sel-btn')
    expect(sel.length).toBe(2)
    await sel[0]!.trigger('click')
    await flushPromises()
    const bar = document.body.querySelector('.selection-bar')
    expect(bar?.textContent).toMatch(/1 selected/)
    expect(bar?.querySelector('button[aria-label="Favorite selected tags"]')).toBeTruthy()
    expect(bar?.querySelector('button[aria-label="Add to collection"]')).toBeTruthy()
    expect(bar?.querySelector('button[aria-label="Optical transfer"]')).toBeFalsy()
    expect(bar?.querySelector('button[aria-label="Queue download"]')).toBeTruthy()
    const addBtn = bar!.querySelector('button[aria-label="Add to collection"]') as HTMLButtonElement
    expect(addBtn).toBeTruthy()
    addBtn.click()
    await flushPromises()
    expect(w.find('[data-testid="picker"]').text()).toContain('Add to collection:7')
    w.unmount()
  })

  it('PitchPipeView renders note grid', async () => {
    const w = mount(PitchPipeView, { global: { plugins: [createPinia()] } })
    expect(w.text()).toMatch(/Pitch|F3|pipe/i)
    expect(w.findAll('button.note').length).toBeGreaterThanOrEqual(13)
    w.unmount()
  })

  it('OpticalTransferView renders send tab with queue UI', async () => {
    const OpticalTransferView = (await import('./OpticalTransferView.vue')).default
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/tx', name: 'tx', component: OpticalTransferView }],
    })
    await router.push('/tx')
    await router.isReady()
    const w = mount(OpticalTransferView, {
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    expect(w.text()).toMatch(/Optical transfer/)
    expect(w.text()).toMatch(/Transfer queue/)
    expect(w.text()).toMatch(/Add files/)
    w.unmount()
  })

  it('HomeView selects tags, queues, and stars selection', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    usePreferencesStore().dismissBrowseWelcome()
    const catalog = useCatalogStore()
    vi.spyOn(catalog, 'load').mockImplementation(async () => {
      catalog.$patch({
        loaded: true,
        loading: false,
        tags: [
          {
            id: 1,
            title: 'My Tag',
            arranger: 'A',
            key: 'C',
            rating: 4,
            type: 'Barbershop',
            collection: null,
            hasSheet: true,
            audioParts: ['lead'],
            sheet: null,
          },
          {
            id: 2,
            title: 'Other',
            arranger: 'B',
            key: 'G',
            rating: 3,
            type: null,
            collection: null,
            hasSheet: false,
            audioParts: ['bass'],
            sheet: null,
          },
        ],
      })
    })
    const favorites = useFavoritesStore()
    vi.spyOn(favorites, 'ensureLoaded').mockResolvedValue()
    vi.spyOn(favorites, 'starMany').mockResolvedValue(1)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            tag_id: 1,
            title: 'My Tag',
            audio: { lead: 'media/1/lead.m4a', bass: 'media/1/bass.m4a' },
          }),
          { status: 200 },
        ),
      ),
    )

    const router = makeRouter([
      { path: '/', component: HomeView },
      { path: '/tag/:id', component: { template: '<div />' } },
      { path: '/queue', component: { template: '<div />' } },
    ])
    await router.push('/')
    const w = mount(HomeView, {
      global: {
        plugins: [pinia, router],
        stubs: { SearchChips: true, EmptyState: true, RouterLink: true },
      },
    })
    await flushPromises()
    catalog.toggleSelect(1)
    await w.vm.$nextTick()
    const bar = document.body.querySelector('.selection-bar')
    expect(bar).toBeTruthy()
    await (bar!.querySelector('button[aria-label="Queue download"]') as HTMLButtonElement).click()
    await flushPromises()
    await (bar!.querySelector('button[aria-label="Favorite selected tags"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(favorites.starMany).toHaveBeenCalled()
    expect(w.find('[aria-label="Search tags"]').exists()).toBe(true)
    w.unmount()
  })

  it('HomeView hides select buttons on narrow until long-press, then clear exits', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    usePreferencesStore().dismissBrowseWelcome()

    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => {
        const narrow = String(query).includes('max-width: 639px')
        return {
          matches: narrow,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
          onchange: null,
        }
      }),
    )

    const core = {
      version: 1,
      tags: [
        {
          id: 1,
          title: 'My Tag',
          arranger: 'A',
          key: 'C',
          rating: 4,
          type: 'Barbershop',
          collection: null,
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
        {
          id: 2,
          title: 'Other',
          arranger: 'B',
          key: 'G',
          rating: 3,
          type: null,
          collection: null,
          hasSheet: false,
          audioParts: ['bass'],
          sheet: null,
        },
      ],
    }
    const gz = await new Response(
      new Blob([JSON.stringify(core)]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('core.json.gz')) return new Response(gz, { status: 200 })
        if (String(url).includes('expansions.json')) {
          return new Response(JSON.stringify({ map: {} }), { status: 200 })
        }
        return new Response(null, { status: 404 })
      }),
    )

    vi.spyOn(useFavoritesStore(), 'ensureLoaded').mockResolvedValue()
    const catalog = useCatalogStore()
    await catalog.load()
    expect(catalog.error).toBeNull()
    expect(catalog.results.length).toBeGreaterThan(0)

    const router = makeRouter([
      { path: '/', component: HomeView },
      { path: '/tag/:id', component: { template: '<div />' } },
    ])
    await router.push('/')
    const w = mount(HomeView, {
      global: {
        plugins: [pinia, router],
        stubs: { SearchChips: true, EmptyState: true, RouterLink: true, ScrubRail: true },
      },
    })
    await flushPromises()

    expect(w.find('.list-row').exists()).toBe(true)
    expect(w.find('.sel-btn').exists()).toBe(false)

    vi.useFakeTimers()
    const row = w.find('.list-row')
    await row.trigger('pointerdown', { button: 0, clientX: 10, clientY: 10 })
    await vi.advanceTimersByTimeAsync(450)
    await flushPromises()
    await w.vm.$nextTick()

    expect(catalog.selectedIds.has(1)).toBe(true)
    expect(w.findAll('.sel-btn').length).toBeGreaterThan(0)

    catalog.clearSelection()
    await w.vm.$nextTick()
    expect(w.find('.sel-btn').exists()).toBe(false)

    w.unmount()
    vi.useRealTimers()
  })

  it('HomeView row star toggles icon immediately', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    usePreferencesStore().dismissBrowseWelcome()
    const catalog = useCatalogStore()
    const tag = {
      id: 7,
      title: 'Star Me',
      arranger: 'A',
      key: 'C',
      rating: 4,
      type: 'Barbershop',
      collection: null,
      hasSheet: true,
      audioParts: ['lead'],
      sheet: null,
    }
    const favorites = useFavoritesStore()
    vi.spyOn(favorites, 'ensureLoaded').mockResolvedValue()
    vi.spyOn(favorites, 'toggle').mockImplementation(async () => {
      favorites.$patch({
        records: [
          {
            tagId: 7,
            starredAt: '2026-01-01T00:00:00.000Z',
            summary: tag,
            detail: null,
            offlineMedia: false,
          },
        ],
      })
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input)
        if (url.includes('core.json')) {
          return new Response(JSON.stringify({ tags: [tag] }), { status: 200 })
        }
        if (url.includes('expansions.json')) {
          return new Response(JSON.stringify({ map: {} }), { status: 200 })
        }
        if (url.includes('lyrics.json')) {
          return new Response(JSON.stringify({ docs: [] }), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      }),
    )

    const router = makeRouter([
      { path: '/', component: HomeView },
      { path: '/tag/:id', component: { template: '<div />' } },
    ])
    await router.push('/')
    const w = mount(HomeView, {
      global: {
        plugins: [pinia, router],
        stubs: { SearchChips: true, EmptyState: true, RouterLink: true },
      },
    })
    await flushPromises()
    expect(catalog.results.length).toBeGreaterThan(0)
    const starBtn = w.find('button.row-fav')
    expect(starBtn.text()).toBe('♡')
    await starBtn.trigger('click')
    await w.vm.$nextTick()
    expect(starBtn.text()).toBe('♥')
    w.unmount()
  })

  it('HomeView shows dismissable welcome dialog once', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const catalog = useCatalogStore()
    vi.spyOn(catalog, 'load').mockImplementation(async () => {
      catalog.$patch({ loaded: true, loading: false, tags: [] })
    })
    vi.spyOn(useFavoritesStore(), 'ensureLoaded').mockResolvedValue()

    const router = makeRouter([{ path: '/', component: HomeView }])
    await router.push('/')
    const w = mount(HomeView, {
      global: {
        plugins: [pinia, router],
        stubs: { SearchChips: true, EmptyState: true, RouterLink: true },
      },
    })
    await flushPromises()
    expect(document.body.textContent).toMatch(/Welcome to SingTags/)
    expect(document.body.textContent).toMatch(/mirror/i)
    expect(document.body.textContent).toMatch(/barbershoptags\.com/)
    expect(document.body.textContent).toMatch(/Install App/)
    const installBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /^Install App$/.test((b.textContent || '').trim()),
    )
    expect(installBtn).toBeTruthy()
    const continueBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /Continue/.test(b.textContent || ''),
    )
    expect(continueBtn).toBeTruthy()
    await continueBtn!.click()
    expect(usePreferencesStore().browseWelcomeDismissed).toBe(true)
    w.unmount()
    document.body.innerHTML = ''
  })

  it('FavoritesView export, apply sort, and unstar', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const favorites = useFavoritesStore()
    const practice = usePracticeStore()
    vi.spyOn(favorites, 'ensureLoaded').mockResolvedValue()
    vi.spyOn(favorites, 'unstar').mockResolvedValue()
    favorites.$patch({
      records: [
        {
          tagId: 1,
          starredAt: '2026-01-01T00:00:00.000Z',
          summary: {
            id: 1,
            title: 'First',
            arranger: 'A',
            key: 'C',
            rating: null,
            type: null,
            collection: null,
            hasSheet: false,
            audioParts: [],
            sheet: null,
          },
          detail: null,
          offlineMedia: false,
        },
        {
          tagId: 2,
          starredAt: '2026-01-02T00:00:00.000Z',
          summary: {
            id: 2,
            title: 'Second',
            arranger: null,
            key: null,
            rating: null,
            type: null,
            collection: null,
            hasSheet: false,
            audioParts: [],
            sheet: null,
          },
          detail: null,
          offlineMedia: true,
        },
      ],
      loaded: true,
    })
    practice.resetFromStarred([1, 2])

    const click = vi.fn()
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
      if (tag === 'a') {
        return { click, href: '', download: '' } as unknown as HTMLAnchorElement
      }
      return realCreate(tag, options)
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const router = makeRouter([
      { path: '/favorites', component: FavoritesView },
      { path: '/tag/:id', component: { template: '<div />' } },
    ])
    await router.push('/favorites')
    const w = mount(FavoritesView, {
      attachTo: document.body,
      global: { plugins: [pinia, router], stubs: { EmptyState: true, RouterLink: true } },
    })
    await flushPromises()
    await w.get('button[aria-label="More favorites actions"]').trigger('click')
    await flushPromises()
    await w.findAll('button').find((b) => b.text().includes('Backup & restore'))!.trigger('click')
    await flushPromises()
    // FilterSheet reveals slot content after paint (double rAF).
    const backupBtn = await vi.waitFor(() => {
      const btn = Array.from(document.body.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes('Backup favorites'),
      )
      expect(btn).toBeTruthy()
      return btn as HTMLButtonElement
    })
    backupBtn.click()
    expect(click).toHaveBeenCalled()
    await w.find('select[aria-label="View favorites by"]').setValue('favorited-new')
    await w.find('button.sort-apply').trigger('click')
    expect(practice.order).toEqual([2, 1])
    expect(
      (w.find('select[aria-label="View favorites by"]').element as HTMLSelectElement).value,
    ).toBe('custom')
    const starBtn = w.find('button.row-fav')
    expect(starBtn.attributes('title')).toMatch(/Unfavorite/)
    await starBtn.trigger('click')
    expect(favorites.unstar).toHaveBeenCalledWith(2)
    w.unmount()
  })

  it('PitchPipeView plays notes and moves focus with arrows', async () => {
    const pinia = createPinia()
    const w = mount(PitchPipeView, { attachTo: document.body, global: { plugins: [pinia] } })
    const prefs = usePreferencesStore(pinia)
    const notes = w.findAll('button.note')
    expect(notes.length).toBeGreaterThanOrEqual(13)
    await notes[0]!.trigger('pointerdown')
    expect(notes[0]!.attributes('aria-pressed')).toBe('true')
    await notes[0]!.trigger('pointerup')
    await notes[0]!.trigger('keydown', { key: 'ArrowRight' })
    await notes[0]!.trigger('keydown', { key: ' ' })
    await notes[0]!.trigger('keyup', { key: ' ' })
    const detune = w.get('input[type="range"]')
    await detune.setValue(25)
    expect(w.text()).toContain('25')
    const concertA = w.get('select[aria-label="Concert A frequency"]')
    expect(concertA.element.value).toBe('custom')
    await concertA.setValue('432')
    expect(prefs.pitchPipeAHz).toBe(432)
    expect(prefs.pitchPipeDetuneCents).toBe(-32)
    expect((detune.element as HTMLInputElement).value).toBe('-32')
    w.unmount()
  })

  it('TagView favorites and ignores dead practice query', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const catalog = useCatalogStore()
    vi.spyOn(catalog, 'load').mockResolvedValue()
    catalog.$patch({
      tags: [
        {
          id: 3,
          title: 'Practice Me',
          arranger: 'A',
          key: 'Bb',
          rating: 4,
          type: null,
          collection: null,
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
      ],
      loaded: true,
      loading: false,
    })
    const favorites = useFavoritesStore()
    vi.spyOn(favorites, 'ensureLoaded').mockResolvedValue()
    vi.spyOn(favorites, 'get').mockResolvedValue(undefined)
    vi.spyOn(favorites, 'toggle').mockResolvedValue()
    vi.spyOn(favorites, 'isStarred').mockReturnValue(false)

    const router = makeRouter([
      { path: '/tag/:id', name: 'tag', component: TagView, props: true },
      { path: '/favorites', component: { template: '<div />' } },
    ])
    await router.push({ path: '/tag/3', query: { set: 'practice', shift: '1' } })
    const w = mount(TagView, {
      props: { id: '3' },
      global: {
        plugins: [pinia, router],
        stubs: { EmptyState: true, RouterLink: true },
      },
    })
    await flushPromises()
    await flushPromises()

    expect(w.text()).toContain('Practice Me')
    expect(w.text()).not.toMatch(/Practice set|Auto-advance/)
    expect(w.findAll('button').some((b) => b.text() === 'Exit')).toBe(false)

    const starBtn = w.findAll('button').find((b) => /favorite/i.test(b.text()))
    expect(starBtn).toBeTruthy()
    await starBtn!.trigger('click')
    expect(favorites.toggle).toHaveBeenCalled()
    w.unmount()
  })
})
