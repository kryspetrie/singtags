/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import LabsView from './LabsView.vue'
import { usePreferencesStore } from '../stores/preferences'

describe('LabsView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  it('shows optical transfer on and list buttons off by default', async () => {
    const w = mount(LabsView)
    await flushPromises()
    const prefs = usePreferencesStore()
    expect(prefs.opticalTransferEnabled).toBe(true)
    expect(prefs.opticalTransferListButtons).toBe(false)
    expect(w.get('input[aria-label="Optical Transfer"]').element).toHaveProperty('checked', true)
    expect(w.get('input[aria-label="Optical Transfer list buttons"]').element).toHaveProperty(
      'checked',
      false,
    )
    w.unmount()
  })

  it('toggles optical transfer and disables nested list buttons when off', async () => {
    const w = mount(LabsView)
    await flushPromises()
    await w.get('input[aria-label="Optical Transfer"]').setValue(false)
    expect(usePreferencesStore().opticalTransferEnabled).toBe(false)
    expect(
      (w.get('input[aria-label="Optical Transfer list buttons"]').element as HTMLInputElement)
        .disabled,
    ).toBe(true)
    w.unmount()
  })
})
