/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import InfoTips from './InfoTips.vue'

describe('InfoTips', () => {
  it('toggles the popover on click', async () => {
    const w = mount(InfoTips, {
      props: { label: 'How-to' },
      slots: { default: '<p>Step one</p>' },
      attachTo: document.body,
    })
    expect(w.find('.info-tips').classes()).not.toContain('open')
    await w.get('button[aria-label="How-to"]').trigger('click')
    expect(w.find('.info-tips').classes()).toContain('open')
    expect(w.text()).toContain('Step one')
    w.unmount()
  })

  it('end-aligns the popover when there is little room on the right', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 })
    const w = mount(InfoTips, {
      props: { label: 'How-to' },
      slots: { default: '<p>Long tip copy</p>' },
      attachTo: document.body,
    })
    const root = w.find('.info-tips').element as HTMLElement
    root.getBoundingClientRect = () =>
      ({
        left: 300,
        right: 328,
        top: 40,
        bottom: 68,
        width: 28,
        height: 28,
        x: 300,
        y: 40,
        toJSON: () => ({}),
      }) as DOMRect
    await w.get('button[aria-label="How-to"]').trigger('click')
    await flushPromises()
    expect(w.find('.info-tips').classes()).toContain('align-end')
    w.unmount()
  })

  it('opens above when there is little room below', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    const w = mount(InfoTips, {
      props: { label: 'How-to' },
      slots: { default: '<p>Bottom bar tip</p>' },
      attachTo: document.body,
    })
    const root = w.find('.info-tips').element as HTMLElement
    root.getBoundingClientRect = () =>
      ({
        left: 120,
        right: 148,
        top: 360,
        bottom: 388,
        width: 28,
        height: 28,
        x: 120,
        y: 360,
        toJSON: () => ({}),
      }) as DOMRect
    await w.get('button[aria-label="How-to"]').trigger('click')
    await flushPromises()
    expect(w.find('.info-tips').classes()).toContain('align-above')
    w.unmount()
  })
})
