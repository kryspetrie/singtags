import { describe, expect, it } from 'vitest'
import { barbershopTagsTagUrl, barbershopTagsTitleSlug } from './barbershopTags'
import { buildTagDetailRows } from './tagDetailMeta'
import type { TagDetail } from '../types/tag'

describe('barbershopTagsTagUrl', () => {
  it('builds slugged tag URLs', () => {
    expect(barbershopTagsTitleSlug("Farmer's Insurance")).toBe('Farmers-Insurance')
    expect(barbershopTagsTagUrl(2457, 'Watching Over You')).toBe(
      'https://www.barbershoptags.com/tag-2457-Watching-Over-You',
    )
    expect(barbershopTagsTagUrl(42, null)).toBe('https://www.barbershoptags.com/tag-42')
  })
})

describe('buildTagDetailRows', () => {
  it('omits empty fields and links source', () => {
    const rows = buildTagDetailRows({
      tag_id: 7,
      title: 'Hello',
      alt_title: null,
      arranger: 'A',
      key: 'C',
      writ_key: 'C',
      audio: { lead: 'x.m4a' },
      sheet: null,
    })
    expect(rows.some((r) => r.label === 'Arranger')).toBe(true)
    expect(rows.some((r) => r.label === 'Written key')).toBe(false)
    expect(rows.some((r) => r.label === 'Alt title')).toBe(false)
    const source = rows.find((r) => r.label === 'Source')
    expect(source?.href).toBe('https://www.barbershoptags.com/tag-7-Hello')
  })

  it('marks lyrics as multiline only', () => {
    const rows = buildTagDetailRows({
      tag_id: 1,
      title: 'T',
      arranger: null,
      key: null,
      audio: {},
      lyrics: 'Line one\nLine two',
    } satisfies TagDetail)
    const lyrics = rows.find((r) => r.label === 'Lyrics')
    expect(lyrics?.multiline).toBe(true)
    expect(rows.find((r) => r.label === 'Arranger')).toBeUndefined()
  })
})
