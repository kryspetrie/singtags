/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TagSelectionBar from './TagSelectionBar.vue'

describe('TagSelectionBar', () => {
  it('shows unfavorited heart icon by default', () => {
    document.body.innerHTML = ''
    mount(TagSelectionBar, {
      props: { count: 2, toolbarLabel: 'Selected tags' },
    })
    const bar = document.body.querySelector('.selection-bar')
    const fav = bar?.querySelector('button[aria-label="Favorite selected tags"]')
    expect(fav).toBeTruthy()
    expect(fav?.textContent).toBe('♡')
  })

  it('hides favorite when showFavorite is false', () => {
    document.body.innerHTML = ''
    mount(TagSelectionBar, {
      props: { count: 2, toolbarLabel: 'Selected favorites', showFavorite: false },
    })
    const bar = document.body.querySelector('.selection-bar')
    expect(bar?.querySelector('button[aria-label="Favorite selected tags"]')).toBeFalsy()
  })
})
