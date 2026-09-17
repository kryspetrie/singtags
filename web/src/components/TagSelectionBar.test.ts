/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TagSelectionBar from './TagSelectionBar.vue'
import { usePreferencesStore } from '../stores/preferences'

describe('TagSelectionBar', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    setActivePinia(createPinia())
  })

  function mountBar(props: Record<string, unknown> = {}) {
    const pinia = createPinia()
    setActivePinia(pinia)
    return mount(TagSelectionBar, {
      props: { count: 2, toolbarLabel: 'Selected tags', ...props },
      global: { plugins: [pinia] },
    })
  }

  it('shows unfavorited heart icon by default', () => {
    mountBar()
    const bar = document.body.querySelector('.selection-bar')
    const fav = bar?.querySelector('button[aria-label="Favorite selected tags"]')
    expect(fav).toBeTruthy()
    expect(fav?.textContent).toBe('♡')
  })

  it('hides favorite when showFavorite is false', () => {
    mountBar({ showFavorite: false, toolbarLabel: 'Selected favorites' })
    const bar = document.body.querySelector('.selection-bar')
    expect(bar?.querySelector('button[aria-label="Favorite selected tags"]')).toBeFalsy()
  })

  it('does not show optical transfer for catalog selection', () => {
    mountBar()
    expect(document.body.querySelector('button[aria-label="Optical transfer"]')).toBeFalsy()
  })

  it('labels the queue action Queue Downloads', () => {
    mountBar()
    const bar = document.body.querySelector('.selection-bar')
    const btn = bar?.querySelector('button[aria-label="Queue downloads"]')
    expect(btn).toBeTruthy()
    expect(btn?.textContent).toMatch(/Queue Downloads/)
  })

  it('hides Queue Downloads when zip exports are disabled', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    usePreferencesStore().setPrimaryNavHidden('queue', true)
    mount(TagSelectionBar, {
      props: { count: 2, toolbarLabel: 'Selected tags' },
      global: { plugins: [pinia] },
    })
    const bar = document.body.querySelector('.selection-bar')
    expect(bar?.querySelector('button[aria-label="Queue downloads"]')).toBeFalsy()
  })
})
