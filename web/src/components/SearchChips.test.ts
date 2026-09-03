/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SearchChips from './SearchChips.vue'
import { EMPTY_FILTERS } from '../search/filters'

const base = {
  open: true,
  filters: { ...EMPTY_FILTERS },
  years: [2024, 2020, 2010, 2000],
  arrangers: ['Paul', 'Other Arranger', 'Zoe'],
  types: ['Barbershop', 'Religious'],
  collections: ['Classic', 'New'],
}

function chip(w: ReturnType<typeof mount>, text: string | RegExp) {
  return w.findAll('button.chip').find((b) =>
    typeof text === 'string' ? b.text().includes(text) : text.test(b.text()),
  )!
}

async function openFilters(w: ReturnType<typeof mount>): Promise<void> {
  if (!w.props('open')) await w.setProps({ open: true })
}

function bodyBtn(text: string | RegExp) {
  return [...document.body.querySelectorAll('button')].find((b) =>
    typeof text === 'string' ? b.textContent?.includes(text) : text.test(b.textContent ?? ''),
  ) as HTMLButtonElement
}

/** FilterSheet mounts slot content after paint (double rAF). */
async function waitBodyBtn(text: string | RegExp): Promise<HTMLButtonElement> {
  return vi.waitFor(() => {
    const btn = bodyBtn(text)
    expect(btn).toBeTruthy()
    return btn
  })
}

async function waitBodySelect(label: string): Promise<HTMLSelectElement> {
  return vi.waitFor(() => {
    const el = document.body.querySelector(
      `select[aria-label="${label}"]`,
    ) as HTMLSelectElement | null
    expect(el).toBeTruthy()
    return el as HTMLSelectElement
  })
}

async function waitBodyInput(label: string): Promise<HTMLInputElement> {
  return vi.waitFor(() => {
    const el = document.body.querySelector(
      `input[aria-label="${label}"]`,
    ) as HTMLInputElement | null
    expect(el).toBeTruthy()
    return el as HTMLInputElement
  })
}

describe('SearchChips', () => {
  it('toggles has sheet filter on and off', async () => {
    const wrapper = mount(SearchChips, { props: base })
    await openFilters(wrapper)
    await chip(wrapper, 'Has sheet').trigger('click')
    expect(wrapper.emitted('patch')?.[0]?.[0]).toEqual({ hasSheet: true })
    await wrapper.setProps({ filters: { ...EMPTY_FILTERS, hasSheet: true } })
    await chip(wrapper, 'Has sheet').trigger('click')
    expect(wrapper.emitted('patch')?.at(-1)?.[0]).toEqual({ hasSheet: null })
  })

  it('cycles audio, opens rating sheet, and sets rating', async () => {
    const w = mount(SearchChips, { props: base, attachTo: document.body })
    await openFilters(w)
    await chip(w, 'Has audio').trigger('click')
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ hasAudio: true })
    await w.setProps({ filters: { ...EMPTY_FILTERS, hasAudio: true } })
    await chip(w, 'Has audio').trigger('click')
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ hasAudio: null })
    await chip(w, 'Min rating').trigger('click')
    await flushPromises()
    ;(await waitBodyBtn('★ 4+')).click()
    await flushPromises()
    expect(w.emitted('patch')?.some((e) => (e[0] as { minRating?: number }).minRating === 4)).toBe(
      true,
    )
    await chip(w, 'Min rating').trigger('click')
    await flushPromises()
    ;(await waitBodyBtn('Any')).click()
    await flushPromises()
    expect(w.emitted('patch')?.some((e) => (e[0] as { minRating: null }).minRating === null)).toBe(
      true,
    )
    w.unmount()
  })

  it('sets year range from selects', async () => {
    const w = mount(SearchChips, { props: base, attachTo: document.body })
    await openFilters(w)
    await chip(w, 'Year').trigger('click')
    await flushPromises()
    const from = await waitBodySelect('Year from')
    const to = await waitBodySelect('Year to')
    from.value = '2010'
    from.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ yearMin: 2010, yearMax: null })
    await w.setProps({ filters: { ...EMPTY_FILTERS, yearMin: 2010 } })
    to.value = '2020'
    to.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ yearMin: 2010, yearMax: 2020 })
    w.unmount()
  })

  it('sets the cached media filter', async () => {
    const w = mount(SearchChips, { props: base, attachTo: document.body })
    await chip(w, 'Cached on device').trigger('click')
    await flushPromises()
    const select = await waitBodySelect('Cached on device')
    select.value = 'both'
    select.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ cached: 'both' })
    w.unmount()
  })

  it('filters arrangers and toggles type/collection', async () => {
    const w = mount(SearchChips, { props: base, attachTo: document.body })
    await openFilters(w)
    await chip(w, 'Arranger').trigger('click')
    await flushPromises()
    const input = await waitBodyInput('Search arrangers')
    input.value = 'paul'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    ;(await waitBodyBtn(/Paul/)).click()
    await flushPromises()
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ arrangers: ['Paul'] })

    await chip(w, 'Type').trigger('click')
    await flushPromises()
    ;(await waitBodyBtn('Religious')).click()
    await flushPromises()
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ types: ['Religious'] })

    await chip(w, 'Collection').trigger('click')
    await flushPromises()
    ;(await waitBodyBtn('Classic')).click()
    await flushPromises()
    expect(w.emitted('patch')?.at(-1)?.[0]).toEqual({ collections: ['Classic'] })
    w.unmount()
  })

  it('emits clear when filters active', async () => {
    const w = mount(SearchChips, {
      props: { ...base, filters: { ...EMPTY_FILTERS, yearMin: 2010 } },
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

  it('keeps filter chips collapsed when closed', () => {
    const w = mount(SearchChips, { props: { ...base, open: false } })
    expect((w.find('.chip-row').element as HTMLElement).style.display).toBe('none')
  })
})
