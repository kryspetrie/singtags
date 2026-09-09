/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import OpticalTransferView from './OpticalTransferView.vue'
import { prepareCollectionTransfer } from '../lib/decimen/prepareCollectionTransfer'
import { anyHighResTransferAvailable } from '../lib/decimen/loadTagForTransfer'
import { useCatalogStore } from '../stores/catalog'

vi.mock('../lib/decimen/loadTagForTransfer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/decimen/loadTagForTransfer')>()
  return {
    ...actual,
    anyHighResTransferAvailable: vi.fn(async () => false),
  }
})

vi.mock('../lib/decimen/sendStream', () => ({
  DecimenSendStream: class {
    stop = vi.fn()
    start = vi.fn(async () => undefined)
    resumeTransmission = vi.fn()
    setDisplayScale = vi.fn()
  },
}))

vi.mock('../lib/decimen/receiveCapture', () => ({
  DecimenReceiveCapture: class {
    attachVideo = vi.fn()
    start = vi.fn()
    stop = vi.fn()
  },
}))

vi.mock('../lib/decimen/prepareCollectionTransfer', () => ({
  prepareCollectionTransfer: vi.fn(),
}))

import { OPTICAL_RX_PATH, OPTICAL_TX_PATH } from '../lib/decimen/opticalTransferNav'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: OPTICAL_TX_PATH, name: 'tx', component: OpticalTransferView },
      { path: OPTICAL_RX_PATH, name: 'rx', component: OpticalTransferView },
    ],
  })
  await router.push(OPTICAL_TX_PATH)
  await router.isReady()
  return mount(OpticalTransferView, {
    attachTo: document.body,
    global: {
      plugins: [router],
    },
  })
}

describe('OpticalTransferView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
    vi.mocked(prepareCollectionTransfer).mockReset()
    vi.mocked(anyHighResTransferAvailable).mockResolvedValue(false)
  })

  it('queues files when the hidden input changes', async () => {
    const w = await mountView()
    await flushPromises()

    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()

    const file = new File([new Uint8Array([1, 2, 3])], 'note.txt', { type: 'text/plain' })
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: {
        0: file,
        length: 1,
        item: (i: number) => (i === 0 ? file : null),
      },
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    await flushPromises()

    expect(w.text()).toMatch(/note\.txt/)
    expect(w.text()).toMatch(/1 file/)
    w.unmount()
  })

  it('uses a label wired to the hidden file input', async () => {
    const w = await mountView()
    await flushPromises()

    const label = document.body.querySelector('label.file-add')
    const input = label?.querySelector('input[type="file"]')
    expect(label).toBeTruthy()
    expect(input).toBeTruthy()
    expect(label?.textContent).toMatch(/Add files/)
    w.unmount()
  })

  it('shows a copyable receive invite link on the send tab', async () => {
    const w = await mountView()
    await flushPromises()
    expect(w.text()).toMatch(/Sending to someone without SingTags/)
    const input = document.body.querySelector('#optical-receive-url') as HTMLInputElement | null
    expect(input?.value).toContain('/rx')
    expect(input?.value).not.toContain('mode=receive')
    expect(w.text()).toMatch(/Receive link/)
    expect(document.body.querySelector('button.copy-btn[aria-label="Copy receive link"]')).toBeTruthy()
    expect(w.text()).toMatch(/Receive link QR/)
    w.unmount()
  })

  it('shows scan mode next to queue actions', async () => {
    const w = await mountView()
    await flushPromises()

    expect(document.body.querySelector('details.send-settings')).toBeNull()
    expect(document.body.querySelector('.queue-actions select[aria-label="Transfer scan mode"]')).toBeTruthy()
    expect(document.body.querySelector('select[aria-label="Transfer density"]')).toBeNull()
    expect(document.body.querySelector('select[aria-label="Transfer frame rate"]')).toBeNull()
    expect(document.body.querySelector('button[aria-label="Make QR smaller"]')).toBeTruthy()
    expect(document.body.querySelector('button[aria-label="Make QR larger"]')).toBeTruthy()
    expect(w.text()).toMatch(/Auto/)
    expect(w.text()).toMatch(/Ultra/)
    expect(w.text()).toMatch(/Balanced/)
    expect(w.text()).toMatch(/Reliable/)
    expect(w.text()).toMatch(/Fast/)
    expect(w.text()).toMatch(/Fastest/)
    w.unmount()
  })

  it('opens receive tab on /rx', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: OPTICAL_TX_PATH, name: 'tx', component: OpticalTransferView },
        { path: OPTICAL_RX_PATH, name: 'rx', component: OpticalTransferView },
      ],
    })
    await router.push(OPTICAL_RX_PATH)
    await router.isReady()
    const w = mount(OpticalTransferView, {
      attachTo: document.body,
      global: { plugins: [router] },
    })
    await flushPromises()

    const receiveTab = document.body.querySelector('[role="tab"][aria-selected="true"]')
    expect(receiveTab?.textContent).toMatch(/Receive/)
    expect(w.text()).toMatch(/Receive to this device/)
    expect(w.text()).toMatch(/Start receiving/)
    w.unmount()
  })

  it('shows Start receiving on the receive tab without opening the live overlay on /tx', async () => {
    const w = await mountView()
    await flushPromises()
    const tabs = [...document.body.querySelectorAll('[role="tab"]')]
    const receive = tabs.find((el) => el.textContent?.includes('Receive'))
    expect(receive).toBeTruthy()
    ;(receive as HTMLElement).click()
    await flushPromises()
    expect(w.text()).toMatch(/Start receiving/)
    const overlay = document.body.querySelector('.optical-receive') as HTMLElement | null
    expect(overlay).toBeTruthy()
    expect(getComputedStyle(overlay!).display).toBe('none')
    w.unmount()
  })

  it('prepares collection transfer from route tags without hanging', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const catalog = useCatalogStore()
    catalog.$patch({
      loaded: true,
      tags: [
        {
          id: 7,
          title: 'One',
          arranger: null,
          key: 'C',
          rating: null,
          type: null,
          collection: null,
          hasSheet: true,
          audioParts: [],
          sheet: null,
        },
      ],
    })
    vi.mocked(prepareCollectionTransfer).mockResolvedValue({
      collectionName: 'Browse',
      allTagIds: [7],
      batches: [
        {
          manifest: {
            v: 1,
            collectionName: 'Browse',
            batchIndex: 0,
            batchCount: 1,
            tagIds: [7],
            allTagIds: [7],
          },
          file: new File([new Uint8Array([1])], 'singtags-collection-browse-1-of-1.bundle'),
          containerBytes: 1,
          tagCount: 1,
        },
      ],
      skipped: [],
    })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: OPTICAL_TX_PATH, name: 'tx', component: OpticalTransferView },
        { path: OPTICAL_RX_PATH, name: 'rx', component: OpticalTransferView },
      ],
    })
    await router.push({ path: OPTICAL_TX_PATH, query: { tags: '7', name: 'Browse' } })
    await router.isReady()
    const w = mount(OpticalTransferView, {
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    await flushPromises()

    expect(prepareCollectionTransfer).toHaveBeenCalled()
    expect(w.text()).toMatch(/Browse/)
    expect(w.text()).toMatch(/1 tag/)
    expect(w.text()).not.toMatch(/Preparing collection…/)
    w.unmount()
  })

  it('keeps picked files after the input value is cleared', async () => {
    const w = await mountView()
    await flushPromises()

    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([1, 2, 3])], 'live-list.txt', { type: 'text/plain' })
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: {
        0: file,
        length: 1,
        item: (i: number) => (i === 0 ? file : null),
        [Symbol.iterator]: function* () {
          yield file
        },
      },
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(w.text()).toMatch(/live-list\.txt/)
    w.unmount()
  })
})
