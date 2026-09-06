import { describe, expect, it } from 'vitest'
import {
  groupLocalAssetsByRole,
  type LocalAsset,
} from './localLibrary'

function asset(partial: Partial<LocalAsset> & Pick<LocalAsset, 'id' | 'role' | 'filename'>): LocalAsset {
  return {
    entryId: 'e1',
    label: '',
    mime: 'application/octet-stream',
    byteLength: 1,
    sortIndex: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('groupLocalAssetsByRole', () => {
  it('groups by role order and sorts alphabetically within each group', () => {
    const groups = groupLocalAssetsByRole([
      asset({ id: 't2', role: 'track', filename: 'tenor.mp3', label: 'Tenor' }),
      asset({ id: 's2', role: 'sheet', filename: 'b.pdf', label: 'B sheet' }),
      asset({ id: 't1', role: 'track', filename: 'bass.mp3', label: 'Bass' }),
      asset({ id: 's1', role: 'sheet', filename: 'a.pdf', label: 'A sheet' }),
      asset({ id: 'o1', role: 'other', filename: 'notes.txt' }),
    ])

    expect(groups.map((g) => g.role)).toEqual(['sheet', 'track', 'other'])
    expect(groups[0]!.assets.map((a) => a.id)).toEqual(['s1', 's2'])
    expect(groups[1]!.assets.map((a) => a.id)).toEqual(['t1', 't2'])
    expect(groups[2]!.label).toBe('Other')
  })

  it('uses filename when label is empty and ignores empty groups', () => {
    const groups = groupLocalAssetsByRole([
      asset({ id: 'i2', role: 'image', filename: 'z.png' }),
      asset({ id: 'i1', role: 'image', filename: 'a.png' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.role).toBe('image')
    expect(groups[0]!.assets.map((a) => a.id)).toEqual(['i1', 'i2'])
  })
})
