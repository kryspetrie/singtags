/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TagDetail } from '../types/tag'

const fetchCached = vi.fn()
const sheetsGet = vi.fn()
const getStarred = vi.fn()
const getTransferredTag = vi.fn()

vi.mock('./manualOfflineFetch', () => ({
  fetchCached: (...args: unknown[]) => fetchCached(...args),
}))
vi.mock('../offline/libraryPack', () => ({
  sheetsPack: {
    get: (...args: unknown[]) => sheetsGet(...args),
  },
}))
vi.mock('../offline/favoritesDb', () => ({
  getStarred: (...args: unknown[]) => getStarred(...args),
}))
vi.mock('../offline/transferredDb', () => ({
  getTransferredTag: (...args: unknown[]) => getTransferredTag(...args),
}))

import { loadTagDetailCached } from './loadTagDetailCached'

function detail(id: number, title: string): TagDetail {
  return { tag_id: id, title } as TagDetail
}

describe('loadTagDetailCached', () => {
  beforeEach(() => {
    fetchCached.mockReset()
    sheetsGet.mockReset()
    getStarred.mockReset()
    getTransferredTag.mockReset()
  })

  it('returns fetchCached JSON when ok', async () => {
    const d = detail(1, 'From cache')
    fetchCached.mockResolvedValue(new Response(JSON.stringify(d), { status: 200 }))
    await expect(loadTagDetailCached(1)).resolves.toEqual(d)
    expect(sheetsGet).not.toHaveBeenCalled()
    expect(getStarred).not.toHaveBeenCalled()
  })

  it('falls through to sheets pack when fetch fails', async () => {
    const d = detail(2, 'From pack')
    fetchCached.mockRejectedValue(new Error('offline'))
    sheetsGet.mockResolvedValue(new Response(JSON.stringify(d), { status: 200 }))
    await expect(loadTagDetailCached(2)).resolves.toEqual(d)
    expect(getStarred).not.toHaveBeenCalled()
  })

  it('falls through to starred detail when pack misses', async () => {
    const d = detail(3, 'From star')
    fetchCached.mockResolvedValue(new Response('missing', { status: 404 }))
    sheetsGet.mockResolvedValue(null)
    getStarred.mockResolvedValue({ tagId: 3, detail: d })
    await expect(loadTagDetailCached(3)).resolves.toEqual(d)
    expect(getTransferredTag).not.toHaveBeenCalled()
  })

  it('does not read transferred unless opted in', async () => {
    fetchCached.mockResolvedValue(new Response('missing', { status: 404 }))
    sheetsGet.mockResolvedValue(null)
    getStarred.mockResolvedValue(undefined)
    await expect(loadTagDetailCached(4)).resolves.toBeNull()
    expect(getTransferredTag).not.toHaveBeenCalled()
  })

  it('reads transferred when includeTransferred is true', async () => {
    const d = detail(5, 'From transfer')
    fetchCached.mockResolvedValue(new Response('missing', { status: 404 }))
    sheetsGet.mockResolvedValue(null)
    getStarred.mockResolvedValue(undefined)
    getTransferredTag.mockResolvedValue({ tagId: 5, detail: d })
    await expect(loadTagDetailCached(5, { includeTransferred: true })).resolves.toEqual(d)
  })
})
