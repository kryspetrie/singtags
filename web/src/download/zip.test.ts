/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildZip,
  downloadBlob,
  fetchBytes,
  sampleUrl,
  zipQueueTracks,
  MAX_QUEUE_TRACKS,
} from './zip'

describe('zip helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sampleUrl and fetchBytes', async () => {
    expect(sampleUrl('media/1/lead.m4a')).toBe('/sample-data/media/1/lead.m4a')
    expect(sampleUrl('/abs')).toBe('/abs')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2]), { status: 200 })))
    const bytes = await fetchBytes('/x')
    expect([...bytes]).toEqual([1, 2])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    await expect(fetchBytes('/missing')).rejects.toThrow(/404/)
  })

  it('downloadBlob creates an anchor click', () => {
    const click = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      href: '',
      download: '',
    } as unknown as HTMLAnchorElement)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    downloadBlob(new Uint8Array([1]), 'a.bin', 'application/octet-stream')
    expect(click).toHaveBeenCalled()
  })

  it('zipQueueTracks fetches audio and sheet files', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([10, 20, 30]), { status: 200 })),
    )
    const click = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      href: '',
      download: '',
    } as unknown as HTMLAnchorElement)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const progress: number[] = []
    await zipQueueTracks(
      [
        { tagId: 1, title: 'Hello World!', part: 'lead', path: 'media/1/lead.m4a' },
        {
          kind: 'sheet',
          tagId: 1,
          title: 'Hello World!',
          part: 'pdf-x',
          path: 'sheets/1/hello.pdf',
          label: 'PDF',
        },
      ],
      {
        onProgress: (d, t) => progress.push(d / t),
        defaultFormat: 'm4a',
        encodeQuality: 'original',
      },
    )
    expect(progress).toEqual([0.5, 1])
    expect(click).toHaveBeenCalled()
  })

  it('rejects oversized queues', async () => {
    const tracks = Array.from({ length: MAX_QUEUE_TRACKS + 1 }, (_, i) => ({
      tagId: i,
      title: 't',
      part: 'lead' as const,
      path: 'x',
    }))
    await expect(zipQueueTracks(tracks)).rejects.toThrow(/limited/)
  })

  it('buildZip returns bytes', () => {
    expect(buildZip([{ name: 'a.txt', data: new Uint8Array([1]) }]).byteLength).toBeGreaterThan(0)
  })

  it('queueTrackZipPath supports flat and folder layouts', async () => {
    const { queueTrackZipPath } = await import('./zip')
    const t = { tagId: 12, title: 'Hello World!' }
    expect(queueTrackZipPath(t, 'lead.m4a', 'folders')).toBe('12-Hello_World_/lead.m4a')
    expect(queueTrackZipPath(t, 'lead.m4a', 'flat')).toBe('12-Hello_World_-lead.m4a')
  })
})
