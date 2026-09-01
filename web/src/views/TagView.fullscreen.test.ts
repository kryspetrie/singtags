/**
 * @vitest-environment happy-dom
 *
 * TagView wiring for sing fullscreen entry, query cleanup, and ✕ → list origin.
 */
import 'fake-indexeddb/auto'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import TagView from './TagView.vue'
import { useCatalogStore } from '../stores/catalog'
import { useFavoritesStore } from '../stores/favorites'
import {
  clearTagReturnOrigin,
  setTagReturnOriginForTests,
} from '../lib/tagReturn'

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
      if (!key) return shift ? `shift:${shift}` : ''
      if (!shift) return key
      return `${key} ${shift > 0 ? '+' : ''}${shift}`
    },
    transposeKeyLabel: (key: string, n: number) => (n ? `${key}+${n}` : key),
    MIN_PITCH_SEMITONES: -12,
    MAX_PITCH_SEMITONES: 12,
    clampPitchSemitones: (n: number) => Math.max(-12, Math.min(12, Math.round(Number(n)) || 0)),
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
  default: defineComponent({
    name: 'SheetViewer',
    props: {
      autoEnterFullscreen: { type: Boolean, default: false },
      exitOriginLabel: { type: String, default: '' },
      singControls: { type: Boolean, default: false },
      imageSets: { type: Array, default: () => [] },
      pdfs: { type: Array, default: () => [] },
      payKeyEnabled: Boolean,
      keyLabel: String,
      shift: Number,
      playing: Boolean,
      playReady: Boolean,
      currentTime: Number,
      duration: Number,
    },
    emits: ['fullscreen-change', 'exit-origin', 'share', 'pay-down', 'pay-up', 'shift-delta', 'shift-reset', 'play-toggle', 'seek'],
    template: `
      <div data-testid="sheet-stub">
        <span data-testid="auto-fs">{{ autoEnterFullscreen ? '1' : '0' }}</span>
        <span data-testid="exit-label">{{ exitOriginLabel }}</span>
        <button type="button" data-testid="fs-on" @click="$emit('fullscreen-change', true)">on</button>
        <button type="button" data-testid="fs-off" @click="$emit('fullscreen-change', false)">off</button>
        <button type="button" data-testid="exit-origin" @click="$emit('exit-origin')">exit</button>
      </div>
    `,
  }),
}))

vi.mock('../lib/prepareSheet', () => ({
  prepareDefaultSheet: vi.fn(async () => ({ pages: ['sheets/3/p1.webp'], owned: [] })),
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
        hasPackAudio: ref(false),
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

describe('TagView fullscreen / sing entry', () => {
  beforeEach(() => {
    localStorage.clear()
    clearTagReturnOrigin()
    setActivePinia(createPinia())
  })

  async function mountTag(query: Record<string, string> = {}) {
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
    vi.spyOn(favorites, 'isStarred').mockReturnValue(false)

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div>Browse</div>' } },
        { path: '/favorites', name: 'favorites', component: { template: '<div>Fav</div>' } },
        { path: '/tag/:id', name: 'tag', component: TagView, props: true },
      ],
    })
    await router.push({ path: '/tag/3', query })
    await router.isReady()

    const w = mount(TagView, {
      props: { id: '3' },
      global: { plugins: [pinia, router] },
    })
    await flushPromises()
    return { w, router, pinia }
  }

  it('passes autoEnterFullscreen when ?fullscreen=1', async () => {
    const { w } = await mountTag({ fullscreen: '1' })
    expect(w.get('[data-testid="auto-fs"]').text()).toBe('1')
    w.unmount()
  })

  it('does not auto-enter without fullscreen query', async () => {
    const { w } = await mountTag({})
    expect(w.get('[data-testid="auto-fs"]').text()).toBe('0')
    w.unmount()
  })

  it('writes fullscreen=1 when sheet enters fullscreen', async () => {
    const { w, router } = await mountTag({})
    const replace = vi.spyOn(router, 'replace')
    await w.get('[data-testid="fs-on"]').trigger('click')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))
    await flushPromises()
    expect(replace).toHaveBeenCalled()
    const arg = replace.mock.calls.at(-1)?.[0] as { path?: string; query?: Record<string, unknown> }
    expect(arg.query?.fullscreen).toBe('1')
    w.unmount()
  })

  it('clears fullscreen (and legacy sheet/sing) query when sheet exits fullscreen', async () => {
    const { w, router } = await mountTag({ fullscreen: '1', sheet: '1', sing: '1' })
    const replace = vi.spyOn(router, 'replace')
    await w.get('[data-testid="fs-off"]').trigger('click')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))
    await flushPromises()
    expect(replace).toHaveBeenCalled()
    const arg = replace.mock.calls.at(-1)?.[0] as { path?: string; query?: Record<string, unknown> }
    expect(arg.query?.fullscreen).toBeUndefined()
    expect(arg.query?.sheet).toBeUndefined()
    expect(arg.query?.sing).toBeUndefined()
    w.unmount()
  })

  it('✕ exit-origin navigates back to captured list origin', async () => {
    setTagReturnOriginForTests({
      name: 'favorites',
      fullPath: '/favorites',
      label: 'Favorites',
      scrollY: 0,
    })
    const { w, router } = await mountTag({ fullscreen: '1' })
    expect(w.get('[data-testid="exit-label"]').text()).toBe('Favorites')
    const push = vi.spyOn(router, 'push')
    await w.get('[data-testid="exit-origin"]').trigger('click')
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/favorites')
    w.unmount()
  })

  it('✕ on a direct fullscreen link stays on the tag page', async () => {
    clearTagReturnOrigin()
    const { w, router } = await mountTag({ fullscreen: '1' })
    expect(w.get('[data-testid="exit-label"]').text()).toBe('tag page')
    const push = vi.spyOn(router, 'push')
    const back = vi.spyOn(router, 'back')
    await w.get('[data-testid="exit-origin"]').trigger('click')
    await flushPromises()
    expect(push).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
    w.unmount()
  })

  it('passes Browse exit label when no origin was captured', async () => {
    clearTagReturnOrigin()
    const { w } = await mountTag({ fullscreen: '1' })
    expect(w.get('[data-testid="exit-label"]').text()).toBe('tag page')
    w.unmount()
  })
})
