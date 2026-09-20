import { describe, expect, it } from 'vitest'
import {
  applyAllPartsPreset,
  buildQuickAddDraft,
  buildQuickSequence,
  chipFilled,
  chipLabel,
  chipUnlocked,
  clampPartConfidence,
  currentChipKind,
  cursorKey,
  filterPartsForVoicing,
  knowsPart,
  nextHighlightIndex,
  sameCursor,
  setPartConfidenceValue,
  toggleKnowPart,
  type QuickChipState,
} from './quickAddChips'

const emptyState = (): QuickChipState => ({
  title: '',
  arranger: '',
  isTag: false,
  linkLabel: '',
  parts: {},
  key: '',
  voicing: '',
})

describe('cursor helpers', () => {
  it('keys and compares cursors', () => {
    expect(cursorKey({ kind: 'title' })).toBe('title')
    expect(cursorKey({ kind: 'part-know', partId: 'lead' })).toBe('part-know:lead')
    expect(sameCursor({ kind: 'key' }, { kind: 'key' })).toBe(true)
    expect(
      sameCursor({ kind: 'part-rate', partId: 'a' }, { kind: 'part-rate', partId: 'b' }),
    ).toBe(false)
  })

  it('maps part cursors to parts chip', () => {
    expect(currentChipKind({ kind: 'part-know', partId: 'lead' })).toBe('parts')
    expect(currentChipKind({ kind: 'arranger' })).toBe('arranger')
  })
})

describe('buildQuickSequence', () => {
  it('inserts rate steps only for known parts', () => {
    const seq = buildQuickSequence(['lead', 'bari'], { lead: 3 })
    expect(seq.map(cursorKey)).toEqual([
      'title',
      'arranger',
      'tag',
      'part-know:lead',
      'part-rate:lead',
      'part-know:bari',
      'key',
      'voicing',
      'link',
    ])
  })
})

describe('chipLabel / chipFilled / chipUnlocked', () => {
  it('labels title with alt count', () => {
    const state = { ...emptyState(), title: 'Hello; Hi' }
    expect(chipLabel('title', state)).toBe('Hello (+1)')
    expect(chipFilled('title', state)).toBe(true)
  })

  it('unlocks chips up to cursor', () => {
    const state = emptyState()
    expect(chipUnlocked('title', state, { kind: 'title' })).toBe(true)
    expect(chipUnlocked('key', state, { kind: 'title' })).toBe(false)
    expect(chipUnlocked('arranger', state, { kind: 'tag' })).toBe(true)
  })

  it('labels parts and key', () => {
    expect(
      chipLabel('parts', { ...emptyState(), parts: { lead: 0, bari: 2 } }),
    ).toBe('Lead, Bari')
    expect(chipLabel('key', { ...emptyState(), key: 'C Major' })).toBe('C Major')
    expect(chipLabel('tag', { ...emptyState(), isTag: true })).toBe('Yes')
  })
})

describe('parts helpers', () => {
  it('filters parts for voicing', () => {
    expect(
      filterPartsForVoicing({ lead: 1, tenor: 2, bass: 3 }, 'TTBB'),
    ).toEqual({ lead: 1, tenor: 2, bass: 3 })
    expect(filterPartsForVoicing({ lead: 1, soprano: 2 }, 'TTBB')).toEqual({
      lead: 1,
    })
  })

  it('toggles know / confidence', () => {
    expect(knowsPart({}, 'lead')).toBe(false)
    const known = toggleKnowPart({}, 'lead')
    expect(known).toEqual({ lead: 0 })
    expect(toggleKnowPart(known, 'lead')).toEqual({})
    expect(clampPartConfidence(9)).toBe(5)
    expect(setPartConfidenceValue({ lead: 0 }, 'lead', 4)).toEqual({ lead: 4 })
    expect(setPartConfidenceValue({}, 'lead', 4)).toBeNull()
  })

  it('applies off-book / on-book / clear presets', () => {
    expect(applyAllPartsPreset('TTBB', 'clear')).toEqual({})
    const off = applyAllPartsPreset('TTBB', 'off-book')
    expect(Object.values(off).every((c) => c === 5)).toBe(true)
    expect(Object.keys(off).length).toBe(4)
    const on = applyAllPartsPreset('TTBB', 'on-book')
    expect(Object.values(on).every((c) => c === 3)).toBe(true)
  })
})

describe('nextHighlightIndex', () => {
  it('wraps and clamps', () => {
    expect(nextHighlightIndex(-1, 3, 1)).toBe(0)
    expect(nextHighlightIndex(0, 3, 1)).toBe(1)
    expect(nextHighlightIndex(2, 3, 1)).toBe(2)
    expect(nextHighlightIndex(0, 3, -1)).toBe(2)
    expect(nextHighlightIndex(0, 0, 1)).toBe(-1)
  })
})

describe('buildQuickAddDraft', () => {
  it('returns null without title', () => {
    expect(
      buildQuickAddDraft({
        titleField: '  ',
        arranger: '',
        key: '',
        voicing: '',
        parts: {},
        isTag: false,
        linkTagId: null,
        linkEntryId: null,
      }),
    ).toBeNull()
  })

  it('builds draft and drops disallowed parts', () => {
    const draft = buildQuickAddDraft({
      titleField: 'Song; Alt',
      arranger: ' Arr ',
      key: 'C',
      voicing: 'TTBB',
      parts: { lead: 3, soprano: 2 },
      isTag: true,
      linkTagId: 7,
      linkEntryId: null,
    })
    expect(draft).toMatchObject({
      title: 'Song',
      altTitles: ['Alt'],
      arranger: 'Arr',
      key: 'C',
      voicing: 'TTBB',
      parts: { lead: 3 },
      isTag: true,
      tagId: 7,
    })
  })
})
