/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GoogleDriveCacheOfferDialog from './GoogleDriveCacheOfferDialog.vue'
import { __resetGoogleAuthForTests } from '../lib/google/googleAuth'
import { __resetDriveCacheSyncForTests } from '../lib/google/driveCacheSync'

const probeDriveCachePresence = vi.fn()
const applyDriveCacheOffer = vi.fn(async () => undefined)

vi.mock('../lib/google/driveCacheSync', async () => {
  const actual = await vi.importActual<typeof import('../lib/google/driveCacheSync')>(
    '../lib/google/driveCacheSync',
  )
  return {
    ...actual,
    probeDriveCachePresence: (...args: unknown[]) => probeDriveCachePresence(...args),
    applyDriveCacheOffer: (...args: unknown[]) => applyDriveCacheOffer(...args),
  }
})

describe('GoogleDriveCacheOfferDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetGoogleAuthForTests()
    __resetDriveCacheSyncForTests()
    setActivePinia(createPinia())
    probeDriveCachePresence.mockReset()
    applyDriveCacheOffer.mockReset()
    applyDriveCacheOffer.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('offers restore copy when Drive already has packs', async () => {
    probeDriveCachePresence.mockResolvedValue({
      sheets: { present: true, files: 12, bytes: 1_000_000, tags: 4 },
      audio: { present: false, files: 0, bytes: 0, tags: 0 },
    })

    const w = mount(GoogleDriveCacheOfferDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    await flushPromises()

    expect(probeDriveCachePresence).toHaveBeenCalled()
    const text = document.body.textContent || ''
    expect(text).toMatch(/already has SingTags song files/i)
    expect(text).toMatch(/for this device only/i)
    expect(text).toMatch(/Enable local sheet music cache from your Drive/)
    expect(text).toMatch(/Enable local track cache and sync/)
    expect(text).toMatch(/Already on Drive/)
    const checks = [...document.body.querySelectorAll('input.cache-check')] as HTMLInputElement[]
    expect(checks).toHaveLength(2)
    expect(checks.every((c) => !c.checked)).toBe(true)
    w.unmount()
  })

  it('offers first-time sync copy when Drive is empty', async () => {
    probeDriveCachePresence.mockResolvedValue({
      sheets: { present: false, files: 0, bytes: 0, tags: 0 },
      audio: { present: false, files: 0, bytes: 0, tags: 0 },
    })

    const w = mount(GoogleDriveCacheOfferDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    await flushPromises()

    const text = document.body.textContent || ''
    expect(text).toMatch(/on this device/i)
    expect(text).toMatch(/Enable local sheet music cache and sync/)
    expect(text).toMatch(/Enable local track cache and sync/)
    w.unmount()
  })

  it('Sync with defaults off applies no cache and closes immediately', async () => {
    probeDriveCachePresence.mockResolvedValue({
      sheets: { present: true, files: 1, bytes: 10 },
      audio: { present: true, files: 2, bytes: 20 },
    })

    const w = mount(GoogleDriveCacheOfferDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    await flushPromises()

    const syncBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /^Sync$/.test((b.textContent || '').trim()),
    ) as HTMLButtonElement
    syncBtn.click()
    await flushPromises()

    expect(applyDriveCacheOffer).toHaveBeenCalledWith(
      expect.objectContaining({ sheets: false, audio: false }),
    )
    expect(w.emitted('decided')?.[0]).toEqual([{ sheets: false, audio: false }])
    expect(w.emitted('close')).toBeTruthy()
    w.unmount()
  })

  it('Sync applies checked prefs and closes before the download finishes', async () => {
    probeDriveCachePresence.mockResolvedValue({
      sheets: { present: true, files: 1, bytes: 10 },
      audio: { present: true, files: 2, bytes: 20 },
    })

    const w = mount(GoogleDriveCacheOfferDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    await flushPromises()

    const checks = [...document.body.querySelectorAll('input.cache-check')] as HTMLInputElement[]
    for (const c of checks) c.click()
    await flushPromises()

    let release: (() => void) | undefined
    applyDriveCacheOffer.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    const syncBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /^Sync$/.test((b.textContent || '').trim()),
    ) as HTMLButtonElement
    syncBtn.click()
    await flushPromises()

    expect(w.emitted('close')).toBeTruthy()
    expect(w.emitted('decided')?.[0]).toEqual([{ sheets: true, audio: true }])
    expect(applyDriveCacheOffer).toHaveBeenCalledWith(
      expect.objectContaining({ sheets: true, audio: true }),
    )
    release?.()
    await flushPromises()
    w.unmount()
  })
})
