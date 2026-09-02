/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import OpticalReceiveInviteOverlay from './OpticalReceiveInviteOverlay.vue'
import { qrDataUrl } from '../lib/qr'

vi.mock('../lib/qr', () => ({
  qrDataUrl: vi.fn(async (_text: string, size = 200) => `data:image/png;base64,qr-${size}`),
}))

describe('OpticalReceiveInviteOverlay', () => {
  beforeEach(() => {
    vi.mocked(qrDataUrl).mockClear()
    document.body.innerHTML = ''
  })

  it('shows receive QR, start button, and large URL footer', async () => {
    mount(OpticalReceiveInviteOverlay, {
      attachTo: document.body,
      props: {
        open: true,
        url: 'https://example.test/rx',
      },
    })
    await flushPromises()
    expect(document.body.querySelector('.receive-qr')).toBeTruthy()
    expect(document.body.textContent).toMatch(/Start QR transfer/)
    expect(document.body.querySelector('.receive-url-footer')?.textContent).toBe(
      'https://example.test/rx',
    )
    document.body.innerHTML = ''
  })

  it('emits start when the transfer button is clicked', async () => {
    const w = mount(OpticalReceiveInviteOverlay, {
      attachTo: document.body,
      props: {
        open: true,
        url: 'https://example.test/rx',
      },
    })
    await flushPromises()
    const startBtn = document.body.querySelector('.start-btn') as HTMLButtonElement
    expect(startBtn).toBeTruthy()
    startBtn.click()
    expect(w.emitted('start')).toHaveLength(1)
    w.unmount()
    document.body.innerHTML = ''
  })
})
