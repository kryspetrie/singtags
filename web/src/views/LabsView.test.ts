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

  it('shows optical transfer on by default', async () => {
    const w = mount(LabsView)
    await flushPromises()
    expect(usePreferencesStore().opticalTransferEnabled).toBe(true)
    expect(w.get('input[aria-label="Optical Transfer"]').element).toHaveProperty('checked', true)
    w.unmount()
  })

  it('toggles optical transfer', async () => {
    const w = mount(LabsView)
    await flushPromises()
    await w.get('input[aria-label="Optical Transfer"]').setValue(false)
    expect(usePreferencesStore().opticalTransferEnabled).toBe(false)
    w.unmount()
  })
})
