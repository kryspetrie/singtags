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
import TagView from './TagView.vue'
import { useCatalogStore } from '../stores/catalog'
import { useStarsStore } from '../stores/stars'
import { usePracticeStore } from '../stores/practice'
import { usePreferencesStore } from '../stores/preferences'

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
    const stars = useStarsStore()
    vi.spyOn(stars, 'ensureLoaded').mockResolvedValue()

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
    w.unmount()
  })

  it('FavoritesView sorts and reorders', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const stars = useStarsStore()
    const practice = usePracticeStore()
    vi.spyOn(stars, 'ensureLoaded').mockResolvedValue()
    stars.$patch({
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
    const sortSelect = w.find('select[aria-label="Sort favorites"]')
    expect(sortSelect.exists()).toBe(true)
    expect((sortSelect.element as HTMLSelectElement).value).toBe('custom')
    practice.reorder(1, 0)
    expect(practice.order).toEqual([1, 2])
    await sortSelect.setValue('starred-new')
    // Preview only — persisted custom order unchanged until Apply
    expect(practice.order).toEqual([1, 2])
    const applyBtn = w.findAll('button').find((b) => b.text() === 'Apply sort')!
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

  it('PitchPipeView renders note grid', async () => {
    const w = mount(PitchPipeView, { global: { plugins: [createPinia()] } })
    expect(w.text()).toMatch(/Pitch|F3|pipe/i)
    expect(w.findAll('button.note').length).toBeGreaterThanOrEqual(13)
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
    const stars = useStarsStore()
    vi.spyOn(stars, 'ensureLoaded').mockResolvedValue()
    vi.spyOn(stars, 'starMany').mockResolvedValue(1)
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
    await [...bar!.querySelectorAll('button')].find((b) => b.textContent?.includes('Add to zip'))!.click()
    await flushPromises()
    await [...bar!.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Favorite')!.click()
    await flushPromises()
    expect(stars.starMany).toHaveBeenCalled()
    expect(w.find('[aria-label="Search tags"]').exists()).toBe(true)
    w.unmount()
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
    const stars = useStarsStore()
    vi.spyOn(stars, 'ensureLoaded').mockResolvedValue()
    vi.spyOn(stars, 'toggle').mockImplementation(async () => {
      stars.$patch({
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
    vi.spyOn(useStarsStore(), 'ensureLoaded').mockResolvedValue()

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
    const stars = useStarsStore()
    const practice = usePracticeStore()
    vi.spyOn(stars, 'ensureLoaded').mockResolvedValue()
    vi.spyOn(stars, 'unstar').mockResolvedValue()
    stars.$patch({
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
    await w.findAll('button').find((b) => b.text().includes('Backup & restore'))!.trigger('click')
    await flushPromises()
    const backupBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('Backup favorites'),
    )
    expect(backupBtn).toBeTruthy()
    backupBtn!.click()
    expect(click).toHaveBeenCalled()
    await w.find('select[aria-label="Sort favorites"]').setValue('starred-new')
    await w.findAll('button').find((b) => b.text() === 'Apply sort')!.trigger('click')
    expect(practice.order).toEqual([2, 1])
    expect(
      (w.find('select[aria-label="Sort favorites"]').element as HTMLSelectElement).value,
    ).toBe('custom')
    const starBtn = w.find('button.row-fav')
    expect(starBtn.attributes('title')).toMatch(/Unfavorite/)
    await starBtn.trigger('click')
    expect(stars.unstar).toHaveBeenCalledWith(2)
    w.unmount()
  })

  it('PitchPipeView plays notes and moves focus with arrows', async () => {
    const w = mount(PitchPipeView, { attachTo: document.body, global: { plugins: [createPinia()] } })
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
    w.unmount()
  })

  it('TagView stars, queues, exits practice, and advances on ended', async () => {
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
        {
          id: 4,
          title: 'Next',
          arranger: 'A',
          key: 'C',
          rating: 3,
          type: null,
          collection: null,
          hasSheet: false,
          audioParts: ['lead'],
          sheet: null,
        },
      ],
      loaded: true,
      loading: false,
    })
    vi.spyOn(catalog, 'load').mockResolvedValue()
    const practice = usePracticeStore()
    practice.resetFromStarred([3, 4])
    practice.autoAdvance = true
    const stars = useStarsStore()
    vi.spyOn(stars, 'ensureLoaded').mockResolvedValue()
    vi.spyOn(stars, 'get').mockResolvedValue(undefined)
    vi.spyOn(stars, 'toggle').mockResolvedValue()
    vi.spyOn(stars, 'isStarred').mockReturnValue(false)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('metadata.json') || url.includes('/tags/')) {
          return new Response(
            JSON.stringify({
              tag_id: 3,
              title: 'Practice Me',
              arranger: 'A',
              key: 'Bb',
              writ_key: 'Major:Bb',
              audio: { lead: 'media/3/lead.m4a' },
              sheet_pages: ['sheets/3/p1.webp'],
            }),
            { status: 200 },
          )
        }
        return new Response(new Uint8Array([1]), { status: 200 })
      }),
    )

    const router = makeRouter([
      { path: '/tag/:id', name: 'tag', component: TagView, props: true },
      { path: '/favorites', component: { template: '<div />' } },
    ])
    await router.push({ path: '/tag/3', query: { set: 'practice', shift: '1' } })
    const push = vi.spyOn(router, 'push')
    const replace = vi.spyOn(router, 'replace')
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
    const starBtn = w.findAll('button').find((b) => /favorite/i.test(b.text()))
    expect(starBtn).toBeTruthy()
    await starBtn!.trigger('click')
    expect(stars.toggle).toHaveBeenCalled()

    const queueBtn = w.findAll('button').find((b) => /queue/i.test(b.text()) && !/Favorite/i.test(b.text()))
    if (queueBtn) {
      await queueBtn.trigger('click')
      await flushPromises()
    }

    await w.findAll('button').find((b) => b.text() === 'Exit')!.trigger('click')
    expect(replace).toHaveBeenCalled()

    // re-enter practice and fire ended
    await router.push({ path: '/tag/3', query: { set: 'practice' } })
    await flushPromises()
    const player = w.findComponent({ name: 'TagPlayer' })
    if (player.exists()) {
      await player.vm.$emit('ended')
      await flushPromises()
      expect(push).toHaveBeenCalled()
    }
    w.unmount()
  })
})
