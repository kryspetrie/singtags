/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TagQrScanner from './TagQrScanner.vue'

vi.mock('../lib/qrDecode', () => ({
  decodeQrFromVideo: vi.fn(async () => null),
  decodeQrFromFile: vi.fn(async () => 'https://example.com/tag/7'),
}))

describe('TagQrScanner', () => {
  beforeEach(() => {
    const stop = vi.fn()
    const stream = {
      getTracks: () => [{ stop }],
    }
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => stream),
      },
    })
    HTMLMediaElement.prototype.play = vi.fn(async () => undefined) as typeof HTMLMediaElement.prototype.play
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      set() {
        /* happy-dom rejects fake MediaStream; ignore in tests */
      },
      get() {
        return null
      },
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('shows camera UI with choose-photo and cancel', async () => {
    const w = mount(TagQrScanner, {
      props: { open: true },
      attachTo: document.body,
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 30))
    await flushPromises()

    expect(document.body.querySelector('.qr-scan')).toBeTruthy()
    expect(document.body.textContent).toMatch(/Choose photo/)
    expect(document.body.textContent).toMatch(/Cancel/)
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled()
    w.unmount()
  })

  it('emits detected when a photo file contains a QR payload', async () => {
    const w = mount(TagQrScanner, {
      props: { open: true },
      attachTo: document.body,
    })
    await flushPromises()

    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: {
        0: file,
        length: 1,
        item: (i: number) => (i === 0 ? file : null),
      },
    })
    input.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(w.emitted('detected')?.[0]).toEqual(['https://example.com/tag/7'])
    w.unmount()
  })
})
