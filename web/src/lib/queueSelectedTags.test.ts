/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { queueTracksFromTagDetail } from './queueSelectedTags'
import type { TagDetail } from '../types/tag'

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
