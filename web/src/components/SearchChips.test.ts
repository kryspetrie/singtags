/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SearchChips from './SearchChips.vue'
import { EMPTY_FILTERS } from '../search/filters'

const base = {
  filters: { ...EMPTY_FILTERS },
  keys: ['C', 'G', 'Bb'],
  arrangers: ['Paul', 'Other Arranger', 'Zoe'],
  types: ['Barbershop', 'Religious'],
  collections: ['Classic', 'New'],
  lyricsLoaded: true,
}

function chip(w: ReturnType<typeof mount>, text: string | RegExp) {
  return w.findAll('button.chip').find((b) =>
    typeof text === 'string' ? b.text().includes(text) : text.test(b.text()),
  )!
}

function bodyBtn(text: string | RegExp) {
  return [...document.body.querySelectorAll('button')].find((b) =>
    typeof text === 'string' ? b.textContent?.includes(text) : text.test(b.textContent ?? ''),
  ) as HTMLButtonElement
}

describe('SearchChips', () => {
  it('emits patch for full text toggle', async () => {
    const wrapper = mount(SearchChips, { props: { ...base, types: [], collections: [] } })
    await wrapper.get('button[aria-pressed]').trigger('click')
    expect(wrapper.emitted('patch')?.[0]?.[0]).toEqual({ fullText: true })
  })

  it('cycles has sheet filter through on / off / any', async () => {
    const wrapper = mount(SearchChips, { props: base })
    await chip(wrapper, 'Has sheet').trigger('click')
    expect(wrapper.emitted('patch')?.[0]?.[0]).toEqual({ hasSheet: true })
    await wrapper.setProps({ filters: { ...EMPTY_FILTERS, hasSheet: true } })
    await chip(wrapper, 'Has sheet').trigger('click')
    expect(wrapper.emitted('patch')?.at(-1)?.[0]).toEqual({ hasSheet: false })
    await wrapper.setProps({ filters: { ...EMPTY_FILTERS, hasSheet: false } })
    await chip(wrapper, 'No sheet').trigger('click')
    expect(wrapper.emitted('patch')?.at(-1)?.[0]).toEqual({ hasSheet: null })
  })

  it('cycles audio, opens rating sheet, and sets rating', async () => {
    const w = mount(SearchChips, { props: base, attachTo: document.body })
    await chip(w, 'Has audio').trigger('click')
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ hasAudio: true })
    await chip(w, 'Min rating').trigger('click')
    await flushPromises()
    bodyBtn('★ 4+').click()
    await flushPromises()
    expect(w.emitted('patch')?.some((e) => (e[0] as { minRating?: number }).minRating === 4)).toBe(
      true,
    )
    await chip(w, 'Min rating').trigger('click')
    await flushPromises()
    bodyBtn('Any').click()
    await flushPromises()
    expect(w.emitted('patch')?.some((e) => (e[0] as { minRating: null }).minRating === null)).toBe(
      true,
    )
    w.unmount()
  })

  it('toggles keys and removes active key chips', async () => {
    const w = mount(SearchChips, {
      props: { ...base, filters: { ...EMPTY_FILTERS, keys: ['C'] } },
      attachTo: document.body,
    })
    await chip(w, 'Key').trigger('click')
    await flushPromises()
    bodyBtn(/^G$/).click()
    await flushPromises()
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ keys: ['C', 'G'] })
    await w.setProps({ filters: { ...EMPTY_FILTERS, keys: ['C', 'G'] } })
    await w.findAll('button.chip.sm').find((b) => b.text().startsWith('C'))!.trigger('click')
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ keys: ['G'] })
    w.unmount()
  })

  it('filters arrangers and toggles type/collection', async () => {
    const w = mount(SearchChips, { props: base, attachTo: document.body })
    await chip(w, 'Arranger').trigger('click')
    await flushPromises()
    const input = document.body.querySelector('input[aria-label="Search arrangers"]') as HTMLInputElement
    input.value = 'paul'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    bodyBtn(/Paul/).click()
    await flushPromises()
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ arrangers: ['Paul'] })

    await chip(w, 'Type').trigger('click')
    await flushPromises()
    bodyBtn('Religious').click()
    await flushPromises()
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ types: ['Religious'] })

    await chip(w, 'Collection').trigger('click')
    await flushPromises()
    bodyBtn('Classic').click()
    await flushPromises()
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ collections: ['Classic'] })
    w.unmount()
  })

  it('shows FTS pending warning and blocks full text while loading', async () => {
    const w = mount(SearchChips, {
      props: {
        ...base,
        lyricsLoaded: false,
        lyricsLoading: true,
        filters: { ...EMPTY_FILTERS },
      },
    })
    const fts = chip(w, 'Full text')
    expect(fts.attributes('disabled')).toBeDefined()
    await w.setProps({
      filters: { ...EMPTY_FILTERS, fullText: true },
      lyricsLoading: false,
      lyricsLoaded: false,
    })
    expect(w.text()).toMatch(/searching titles until the lyrics index/)
    expect(w.emitted('ensure-lyrics')).toBeTruthy()
  })

  it('emits clear when filters active', async () => {
    const w = mount(SearchChips, {
      props: { ...base, filters: { ...EMPTY_FILTERS, keys: ['C'], fullText: true } },
    })
    await chip(w, 'Clear').trigger('click')
    expect(w.emitted('clear')).toBeTruthy()
  })

  it('removes arranger from active row', async () => {
    const w = mount(SearchChips, {
      props: { ...base, filters: { ...EMPTY_FILTERS, arrangers: ['Paul'] } },
    })
    await w.findAll('button.chip.sm').find((b) => b.text().includes('Paul'))!.trigger('click')
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ arrangers: [] })
  })
})
