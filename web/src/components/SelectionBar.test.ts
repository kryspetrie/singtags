/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SelectionBar from './SelectionBar.vue'

describe('SelectionBar', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('hides when count is 0', () => {
    mount(SelectionBar, {
      props: { count: 0, toolbarLabel: 'Selected' },
      attachTo: document.body,
    })
    expect(document.body.querySelector('.selection-bar')).toBeNull()
  })

  it('shows count text and emits clear', () => {
    const w = mount(SelectionBar, {
      props: { count: 1, toolbarLabel: 'Selected tuplet', countText: 'Triplet · Lead' },
      attachTo: document.body,
    })
    const bar = document.body.querySelector('.selection-bar')
    expect(bar?.textContent).toMatch(/Triplet · Lead/)
    expect(bar?.getAttribute('aria-label')).toBe('Selected tuplet')
    const clear = document.body.querySelector(
      '.selection-bar .btn-ghost',
    ) as HTMLButtonElement | null
    expect(clear).toBeTruthy()
    clear!.click()
    expect(w.emitted('clear')).toBeTruthy()
    w.unmount()
  })

  it('renders slot actions', () => {
    const w = mount(SelectionBar, {
      props: { count: 1, toolbarLabel: 'Selected' },
      slots: { default: '<button type="button" class="btn">Edit</button>' },
      attachTo: document.body,
    })
    const bar = document.body.querySelector('.selection-bar')
    expect(bar?.textContent).toMatch(/Edit/)
    w.unmount()
  })
})
