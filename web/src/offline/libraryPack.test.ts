/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPackStore } from './libraryPack'

describe('libraryPack pathname index', () => {
  beforeEach(() => {
    vi.stubGlobal('caches', undefined)
  })

  it('resolves relative lookup after absolute put without rescanning', async () => {
    const pack = createPackStore('audio')
    await pack.clear()
    const absolute = 'http://127.0.0.1:5173/library/media/1/lead.solo.opus'
    const relative = '/library/media/1/lead.solo.opus'
    const body = new Uint8Array([1, 2, 3, 4])
    await pack.put(
      absolute,
      new Response(body, { headers: { 'Content-Type': 'audio/ogg' } }),
    )

    const listSpy = vi.spyOn(pack, 'listUrls')
    const hit = await pack.get(relative)
    expect(hit).not.toBeNull()
    expect(new Uint8Array(await hit!.arrayBuffer())).toEqual(body)
    // Pathname index must answer misses without calling listUrls on the hot path.
    expect(listSpy).not.toHaveBeenCalled()
    listSpy.mockRestore()
    await pack.clear()
  })
})
