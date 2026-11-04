/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TagListRowContent from './TagListRowContent.vue'
import type { TagSummary } from '../types/tag'

vi.mock('../stores/catalog', () => ({
  useCatalogStore: () => ({
    cacheReadyByTag: new Map(),
  }),
}))

vi.mock('../stores/ratings', () => ({
  useRatingsStore: () => ({
    revision: 0,
    starsFor: () => null,
  }),
}))

function tag(partial: Partial<TagSummary> & { id: number }): TagSummary {
  return {
    title: 'Test Tag',
    altTitle: null,
    arranger: 'Arranger',
    key: 'Bb',
    writKey: null,
    rating: null,
    ratingCount: null,
    downloads: null,
    type: null,
    collection: null,
    classic: null,
    year: 2000,
    parts: 4,
    hasSheet: true,
    hasLyrics: true,
    audioParts: ['lead'],
    sheet: null,
    sheetPages: [],
    ...partial,
  }
}

describe('TagListRowContent lyrics row', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
  })

  it('reserves a lyrics row when hasLyrics is true and snippet prop is passed', () => {
    const w = mount(TagListRowContent, {
      props: { tag: tag({ id: 1, hasLyrics: true }), lyricsSnippet: null },
    })
    expect(w.find('.lyrics-snip').exists()).toBe(true)
    expect(w.find('.lyrics-snip').classes()).not.toContain('ready')
  })

  it('omits the lyrics row when hasLyrics is false', () => {
    const w = mount(TagListRowContent, {
      props: { tag: tag({ id: 2, hasLyrics: false }), lyricsSnippet: null },
    })
    expect(w.find('.lyrics-snip').exists()).toBe(false)
  })

  it('keeps a reserved row for older indexes missing hasLyrics', () => {
    const t = tag({ id: 3 })
    delete t.hasLyrics
    const w = mount(TagListRowContent, {
      props: { tag: t, lyricsSnippet: null },
    })
    expect(w.find('.lyrics-snip').exists()).toBe(true)
  })

  it('does not show a lyrics row when the prop is omitted (Favorites/Recent)', () => {
    const w = mount(TagListRowContent, {
      props: { tag: tag({ id: 4, hasLyrics: true }) },
    })
    expect(w.find('.lyrics-snip').exists()).toBe(false)
  })
})
