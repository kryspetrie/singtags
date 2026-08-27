/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useQueueStore } from './queue'

vi.mock('../download/zip', async () => {
  const actual = await vi.importActual<typeof import('../download/zip')>('../download/zip')
  return {
    ...actual,
    zipQueueTracks: vi.fn(async (_tracks: unknown, opts?: { onProgress?: (d: number, t: number) => void; signal?: AbortSignal }) => {
      opts?.onProgress?.(1, 1)
      if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    }),
  }
})

describe('queue store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('addMany, remove, clear, and track helpers', () => {
    const q = useQueueStore()
    q.addMany([
      { tagId: 1, title: 'A', part: 'lead', path: 'a' },
      { tagId: 1, title: 'A', part: 'bass', path: 'b' },
    ])
    expect(q.count).toBe(2)
    q.setPlaybackTransform({ pitchSemitones: 2, speed: 0.9 })
    expect(q.playbackTransform.pitchSemitones).toBe(2)
    q.updateTrack(1, 'lead', { format: 'mp3' })
    expect(q.tracks.find((t) => t.part === 'lead')?.format).toBe('mp3')
    q.remove(1, 'bass')
    expect(q.count).toBe(1)
    q.clear()
    expect(q.count).toBe(0)
  })

  it('downloadZip updates progress and cancel aborts', async () => {
    const q = useQueueStore()
    q.add({ tagId: 1, title: 'A', part: 'lead', path: 'a' })
    const p = q.downloadZip()
    q.cancelZip()
    await p
    expect(q.busy).toBe(false)
  })

  it('hits max track limit and records zip errors', async () => {
    const { zipQueueTracks, MAX_QUEUE_TRACKS } = await import('../download/zip')
    const q = useQueueStore()
    for (let i = 0; i < MAX_QUEUE_TRACKS; i++) {
      q.add({ tagId: i, title: 't', part: 'lead', path: 'x' })
    }
    q.add({ tagId: 9999, title: 'overflow', part: 'lead', path: 'x' })
    expect(q.error).toMatch(/limited/)
    q.clear()
    q.add({ tagId: 1, title: 'A', part: 'lead', path: 'a' })
    vi.mocked(zipQueueTracks).mockRejectedValueOnce(new Error('network down'))
    await q.downloadZip()
    expect(q.error).toBe('network down')
  })

  it('tolerates corrupt persisted queue', () => {
    localStorage.setItem('singtags.zipQueue.v2', '{bad')
    setActivePinia(createPinia())
    const q = useQueueStore()
    expect(q.tracks).toEqual([])
  })
})
