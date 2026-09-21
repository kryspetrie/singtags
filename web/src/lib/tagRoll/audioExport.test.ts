/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyTagRollProject } from './normalize'
import {
  createTagStudioServices,
  setTagStudioServicesForTests,
} from '../../composition/tagStudio'
import type { AudioBounce } from '../../ports/AudioBounce'

const zipMock = vi.hoisted(() => ({
  buildZip: vi.fn(() => new Uint8Array([1, 2, 3])),
  downloadBlob: vi.fn(),
}))

vi.mock('../../download/zip', () => zipMock)

import { downloadTagRollAudio } from './audioExport'

describe('downloadTagRollAudio', () => {
  const bounce = vi.fn()

  beforeEach(() => {
    bounce.mockReset()
    zipMock.buildZip.mockClear()
    zipMock.downloadBlob.mockClear()
    const audioBounce: AudioBounce = { bounce }
    setTagStudioServicesForTests(
      createTagStudioServices({
        audioBounce,
      }),
    )
  })

  afterEach(() => {
    setTagStudioServicesForTests(null)
  })

  it('downloads a single mix file directly via AudioBounce port', async () => {
    const p = createEmptyTagRollProject({ title: 'Solo Mix' })
    bounce.mockResolvedValue([
      {
        partId: 'mix',
        label: 'Mix',
        filename: 'Solo Mix - Mix.mp3',
        bytes: new Uint8Array([9, 9, 9]).buffer,
      },
    ])
    await downloadTagRollAudio(p, { mix: true, perPart: false, partLeft: false, format: 'mp3' })
    expect(bounce).toHaveBeenCalledWith(
      p,
      expect.objectContaining({ mix: true, perPart: false, partLeft: false, format: 'mp3' }),
    )
    expect(zipMock.downloadBlob).toHaveBeenCalledOnce()
    expect(zipMock.buildZip).not.toHaveBeenCalled()
    expect(zipMock.downloadBlob.mock.calls[0]![1]).toBe('Solo Mix - Mix.mp3')
  })

  it('zips part-left packs and forces mix on in bounce', async () => {
    const p = createEmptyTagRollProject({ title: 'Learning Pack' })
    bounce.mockResolvedValue([
      {
        partId: 'mix',
        label: 'Mix',
        filename: 'Learning Pack - Mix.wav',
        bytes: new ArrayBuffer(4),
      },
      {
        partId: 'lead',
        label: 'Lead',
        filename: 'Learning Pack - Lead.wav',
        bytes: new ArrayBuffer(4),
      },
    ])
    await downloadTagRollAudio(p, {
      mix: false,
      perPart: false,
      partLeft: true,
      format: 'wav',
    })
    expect(bounce).toHaveBeenCalledWith(
      p,
      expect.objectContaining({ mix: true, partLeft: true, format: 'wav' }),
    )
    expect(zipMock.buildZip).toHaveBeenCalledOnce()
    expect(zipMock.downloadBlob.mock.calls[0]![1]).toMatch(/part-left/)
  })

  it('throws when bounce yields no tracks', async () => {
    const p = createEmptyTagRollProject()
    bounce.mockResolvedValue([])
    await expect(
      downloadTagRollAudio(p, { mix: true, perPart: false, partLeft: false }),
    ).rejects.toThrow(/Nothing to render/)
  })
})
