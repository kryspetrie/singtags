/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { parseStarredFile, toStarredFile } from './starredDb'
import type { StarredTagRecord } from './starredDb'

describe('starred.tags file', () => {
  it('round-trips metadata export shape', () => {
    const records: StarredTagRecord[] = [
      {
        tagId: 1,
        starredAt: '2026-08-20T00:00:00.000Z',
        summary: {
          id: 1,
          title: 'Test',
          arranger: 'A',
          key: 'C',
          rating: 4,
          type: 'Barbershop',
          collection: null,
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
        detail: {
          tag_id: 1,
          title: 'Test',
          arranger: 'A',
          key: 'C',
          audio: { lead: 'media/1/lead.mp4' },
        },
        offlineMedia: false,
      },
    ]
    const file = toStarredFile(records)
    expect(file.kind).toBe('singtags.starred')
    expect(file.version).toBe(1)
    const parsed = parseStarredFile(JSON.parse(JSON.stringify(file)))
    expect(parsed.tags).toHaveLength(1)
    expect(parsed.tags[0]?.summary.id).toBe(1)
  })

  it('rejects bad files', () => {
    expect(() => parseStarredFile({ kind: 'nope' })).toThrow(/starred/)
  })
})
