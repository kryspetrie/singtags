/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { decodeQrFromFile, probeCameraAccess } from './qrDecode'

vi.mock('jsqr', () => ({
  default: vi.fn(() => null),
}))

describe('qrDecode', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('probeCameraAccess is false without mediaDevices', async () => {
    vi.stubGlobal('navigator', {})
    await expect(probeCameraAccess()).resolves.toBe(false)
  })

  it('probeCameraAccess starts and stops a short-lived stream', async () => {
    const stop = vi.fn()
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop }],
    }))
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
    })
    await expect(probeCameraAccess()).resolves.toBe(true)
    expect(getUserMedia).toHaveBeenCalled()
    expect(stop).toHaveBeenCalled()
  })

  it('probeCameraAccess is false when getUserMedia rejects', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw new Error('denied')
        }),
      },
    })
    await expect(probeCameraAccess()).resolves.toBe(false)
  })

  it('decodeQrFromFile returns null when no code is found', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        width: 10,
        height: 10,
        close: vi.fn(),
      })),
    )
    // Canvas 2d in happy-dom may be limited — force a safe path by stubbing getContext.
    const getContext = HTMLCanvasElement.prototype.getContext
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      type: string,
    ) {
      if (type !== '2d') return getContext.call(this, type as '2d')
      return {
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({
          data: new Uint8ClampedArray(4),
          width: 1,
          height: 1,
        })),
      } as unknown as CanvasRenderingContext2D
    })

    const file = new File([new Uint8Array([1, 2, 3])], 'qr.png', { type: 'image/png' })
    await expect(decodeQrFromFile(file)).resolves.toBeNull()
  })
})
