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
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(usePreferencesStore().opticalTransferEnabled).toBe(true)
    expect(w.get('input[aria-label="Optical Transfer"]').element).toHaveProperty('checked', true)
    w.unmount()
  })

  it('shows local library off by default', async () => {
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(usePreferencesStore().localLibraryEnabled).toBe(false)
    expect(w.get('input[aria-label="Local Library"]').element).toHaveProperty('checked', false)
    w.unmount()
  })

  it('toggles optical transfer', async () => {
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    await w.get('input[aria-label="Optical Transfer"]').setValue(false)
    expect(usePreferencesStore().opticalTransferEnabled).toBe(false)
    w.unmount()
  })

  it('toggles local library', async () => {
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    await w.get('input[aria-label="Local Library"]').setValue(true)
    expect(usePreferencesStore().localLibraryEnabled).toBe(true)
    w.unmount()
  })

  it('defaults tag roulette off and toggles on', async () => {
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(usePreferencesStore().tagRouletteEnabled).toBe(false)
    expect(w.get('input[aria-label="Tag Roulette"]').element).toHaveProperty('checked', false)
    await w.get('input[aria-label="Tag Roulette"]').setValue(true)
    expect(usePreferencesStore().tagRouletteEnabled).toBe(true)
    expect(w.text()).toContain('More → Tag Roulette')
    expect(w.text()).not.toContain('Open Tag Roulette')
    w.unmount()
  })

  it('links to the pitch pipe sound lab', async () => {
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(w.text()).toContain('Pitch pipe sound')
    expect(w.text()).toContain('Open sound lab')
    w.unmount()
  })
})
