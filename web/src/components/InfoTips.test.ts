/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
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
})
