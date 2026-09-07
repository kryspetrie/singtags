/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import {
  queueSelectedTags,
  queueTracksFromTagDetail,
} from './queueSelectedTags'
import type { TagDetail } from '../types/tag'
import type { QueueTrack } from '../download/zip'

function detail(partial: Partial<TagDetail> & Pick<TagDetail, 'tag_id'>): TagDetail {
  return {
    title: 'Test',
    sheets: [],
    audio: {},
    ...partial,
  } as TagDetail
}

describe('queueTracksFromTagDetail', () => {
  const d = detail({
    tag_id: 1,
    title: 'Hello',
    sheet: 'tags/1/sheet.pdf',
    sheets: ['tags/1/sheet.pdf'],
    audio: {
      lead: 'tags/1/lead.mp3',
      bari: 'tags/1/bari.mp3',
      mix: 'tags/1/mix.mp3',
    },
  })

  it('queues sheets only', () => {
    const items = queueTracksFromTagDetail(d, 'sheets')
    expect(items.every((i) => i.kind === 'sheet')).toBe(true)
    expect(items.length).toBeGreaterThan(0)
  })

  it('queues tracks without mix when parts exist', () => {
    const items = queueTracksFromTagDetail(d, 'tracks')
    expect(items.every((i) => i.kind === 'audio')).toBe(true)
    expect(items.map((i) => i.part)).not.toContain('mix')
    expect(items.map((i) => i.part).sort()).toEqual(['bari', 'lead'])
  })

  it('queues everything', () => {
    const items = queueTracksFromTagDetail(d, 'all')
    expect(items.some((i) => i.kind === 'sheet')).toBe(true)
    expect(items.some((i) => i.kind === 'audio')).toBe(true)
  })
})

describe('queueSelectedTags', () => {
  const rich = detail({
    tag_id: 10,
    title: 'Rich',
    sheet: 'tags/10/sheet.pdf',
    sheets: ['tags/10/sheet.pdf'],
    audio: { lead: 'tags/10/lead.mp3' },
  })
  const bare = detail({
    tag_id: 11,
    title: 'Bare',
    sheets: [],
    audio: {},
  })

  it('queues all tags that load with matching assets', async () => {
    const queued: QueueTrack[] = []
    const result = await queueSelectedTags({
      ids: [10, 12],
      mode: 'sheets',
      offline: false,
      loadDetail: async (id) => (id === 10 ? rich : rich),
      addMany: (items) => queued.push(...items),
    })
    expect(result.ok).toBe(2)
    expect(result.skipped).toBe(0)
    expect(result.message).toBe('Queued sheets from 2 tag(s).')
    expect(queued.length).toBeGreaterThan(0)
  })

  it('skips missing details with offline wording', async () => {
    const result = await queueSelectedTags({
      ids: [10, 99],
      mode: 'tracks',
      offline: true,
      loadDetail: async (id) => (id === 10 ? rich : null),
      addMany: () => {},
    })
    expect(result.ok).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.message).toContain('not cached on device')
  })

  it('skips missing details with online wording', async () => {
    const result = await queueSelectedTags({
      ids: [99],
      mode: 'all',
      offline: false,
      loadDetail: async () => null,
      addMany: () => {},
    })
    expect(result.ok).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.message).toBe('Queued sheets and tracks from 0 tag(s); skipped 1.')
  })

  it('skips details with no matching assets for mode', async () => {
    const result = await queueSelectedTags({
      ids: [11],
      mode: 'tracks',
      offline: false,
      loadDetail: async () => bare,
      addMany: () => {},
    })
    expect(result.ok).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.message).toContain('skipped 1')
  })

  it('returns empty-ids message without queueing', async () => {
    const addMany = vi.fn()
    const result = await queueSelectedTags({
      ids: [],
      mode: 'sheets',
      offline: false,
      loadDetail: async () => rich,
      addMany,
    })
    expect(result.ok).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.message).toBe('No files queued.')
    expect(addMany).not.toHaveBeenCalled()
  })

  it('uses offline empty message when selection is empty', async () => {
    const result = await queueSelectedTags({
      ids: [],
      mode: 'sheets',
      offline: true,
      loadDetail: async () => null,
      addMany: () => {},
    })
    expect(result.message).toBe(
      'No cached tag details — open tags online once, or reconnect.',
    )
  })
})
