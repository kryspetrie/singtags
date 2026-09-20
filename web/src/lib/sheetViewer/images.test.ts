/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { waitForStageImages } from './images'

describe('sheetViewer/images', () => {
  it('waitForStageImages resolves for complete images', async () => {
    const stage = document.createElement('div')
    const img = document.createElement('img')
    Object.defineProperty(img, 'complete', { value: true })
    stage.append(img)
    await expect(waitForStageImages(stage)).resolves.toBeUndefined()
  })

  it('waitForStageImages resolves after load event', async () => {
    vi.useFakeTimers()
    const stage = document.createElement('div')
    const img = document.createElement('img')
    Object.defineProperty(img, 'complete', { value: false })
    stage.append(img)
    const p = waitForStageImages(stage)
    img.dispatchEvent(new Event('load'))
    await p
    vi.useRealTimers()
  })
})
