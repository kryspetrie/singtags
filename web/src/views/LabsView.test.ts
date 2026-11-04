/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { isDriveSyncEnabled } from '../lib/google/googleAuth'
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

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not expose Optical Transfer or Audio Recorder labs toggles', async () => {
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(w.find('input[aria-label="Optical Transfer"]').exists()).toBe(false)
    expect(w.find('input[aria-label="Audio Recorder"]').exists()).toBe(false)
    expect(w.find('input[aria-label="OS Share Handoff"]').exists()).toBe(false)
    expect(w.text()).toMatch(/Optical Transfer and Audio Recorder live under More/)
    w.unmount()
  })

  it('shows my library off by default', async () => {
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(usePreferencesStore().localLibraryEnabled).toBe(false)
    expect(w.get('input[aria-label="My Library"]').element).toHaveProperty('checked', false)
    w.unmount()
  })

  it('toggles my library', async () => {
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    await w.get('input[aria-label="My Library"]').setValue(true)
    expect(usePreferencesStore().localLibraryEnabled).toBe(true)
    w.unmount()
  })

  it('toggles wireless labs flag', async () => {
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(usePreferencesStore().webrtcTransferEnabled).toBe(false)
    await w.get('input[aria-label="Wireless Transfer"]').setValue(true)
    expect(usePreferencesStore().webrtcTransferEnabled).toBe(true)
    w.unmount()
  })

  it('toggles sing together labs flag', async () => {
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(usePreferencesStore().singTogetherEnabled).toBe(false)
    await w.get('input[aria-label="Sing Together"]').setValue(true)
    expect(usePreferencesStore().singTogetherEnabled).toBe(true)
    w.unmount()
  })

  it('toggles tag studio labs flag (Coach included)', async () => {
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(usePreferencesStore().tagRollEnabled).toBe(false)
    await w.get('input[aria-label="Tag Studio"]').setValue(true)
    expect(usePreferencesStore().tagRollEnabled).toBe(true)
    expect(w.text()).toMatch(/More → Tag Studio/)
    w.unmount()
  })

  it('does not expose a separate Arranging labs toggle', async () => {
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(w.find('input[aria-label="Arranging"]').exists()).toBe(false)
    w.unmount()
  })

  it('does not expose a Tag Roulette Labs toggle', async () => {
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(w.find('input[aria-label="Tag Roulette"]').exists()).toBe(false)
    w.unmount()
  })

  it('keeps Google Drive sync off by default and states the beta-tester requirement', async () => {
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', 'test-client.apps.googleusercontent.com')
    const w = mount(LabsView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(isDriveSyncEnabled()).toBe(false)
    const toggle = w.get('input[aria-label="Google Drive sync"]')
    expect(toggle.element).toHaveProperty('checked', false)
    expect(w.text()).toMatch(/must.*be added by Krys as a beta tester/i)
    expect(w.text()).toMatch(/Off — enable after Krys adds your email/)
    w.unmount()
  })
})
