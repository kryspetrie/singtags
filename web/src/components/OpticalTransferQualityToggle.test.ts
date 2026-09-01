/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OpticalTransferQualityToggle from './OpticalTransferQualityToggle.vue'

describe('OpticalTransferQualityToggle', () => {
  it('always renders and disables when high quality is unavailable', () => {
    const w = mount(OpticalTransferQualityToggle, {
      props: {
        available: false,
        modelValue: false,
      },
    })
    expect(w.text()).toMatch(/High quality/)
    expect(w.text()).toMatch(/No upgraded PDF/)
    expect(w.get('[role="switch"]').attributes('disabled')).toBeDefined()
  })

  it('enables switch when upgraded PDFs are available', () => {
    const w = mount(OpticalTransferQualityToggle, {
      props: {
        available: true,
        modelValue: false,
      },
    })
    expect(w.get('[role="switch"]').attributes('disabled')).toBeUndefined()
  })
})
