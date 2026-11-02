/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'

describe('ConfirmDialog', () => {
  it('renders cancel + danger confirm using shared btn classes', () => {
    const w = mount(ConfirmDialog, {
      props: {
        open: true,
        title: 'Delete?',
        message: 'This cannot be undone.',
        confirmLabel: 'Delete',
      },
      attachTo: document.body,
    })
    const buttons = [...document.body.querySelectorAll('.confirm-root button.btn')]
    expect(buttons.length).toBeGreaterThanOrEqual(2)
    const confirm = buttons.find((b) => b.classList.contains('btn-danger'))
    expect(confirm?.textContent).toMatch(/Delete/)
    expect(buttons.some((b) => b.textContent?.includes('Cancel'))).toBe(true)
    w.unmount()
  })

  it('uses btn-primary when danger is false', () => {
    const w = mount(ConfirmDialog, {
      props: {
        open: true,
        title: 'Continue?',
        message: 'OK to proceed.',
        danger: false,
        confirmLabel: 'Continue',
      },
      attachTo: document.body,
    })
    const confirm = document.body.querySelector('.confirm-root button.btn-primary')
    expect(confirm?.textContent).toMatch(/Continue/)
    w.unmount()
  })
})
