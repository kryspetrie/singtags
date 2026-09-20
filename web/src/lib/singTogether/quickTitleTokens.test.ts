import { describe, expect, it } from 'vitest'
import {
  applyTitleDraftInput,
  lockTitleDraft,
  removeTitlePillAt,
  titleFromTokens,
  unlockLastTitlePill,
} from './quickTitleTokens'

describe('titleFromTokens', () => {
  it('joins pills and optional draft', () => {
    expect(titleFromTokens(['A', 'B'], '')).toBe('A; B')
    expect(titleFromTokens(['A'], 'C')).toBe('A; C')
    expect(titleFromTokens([], '  Hi  ')).toBe('Hi')
    expect(titleFromTokens([], '   ')).toBe('')
  })
})

describe('lockTitleDraft', () => {
  it('returns null for blank draft', () => {
    expect(lockTitleDraft(['A'], '  ')).toBeNull()
  })

  it('appends trimmed draft as a pill', () => {
    expect(lockTitleDraft(['A'], '  B  ')).toEqual({
      pills: ['A', 'B'],
      draft: '',
      title: 'A; B',
    })
  })
})

describe('unlockLastTitlePill', () => {
  it('returns null when empty or draft non-empty', () => {
    expect(unlockLastTitlePill([], '')).toBeNull()
    expect(unlockLastTitlePill(['A'], 'x')).toBeNull()
  })

  it('moves last pill into draft', () => {
    expect(unlockLastTitlePill(['A', 'B'], '')).toEqual({
      pills: ['A'],
      draft: 'B',
      title: 'A; B',
    })
  })
})

describe('removeTitlePillAt', () => {
  it('drops the indexed pill', () => {
    expect(removeTitlePillAt(['A', 'B', 'C'], 'd', 1)).toEqual({
      pills: ['A', 'C'],
      draft: 'd',
      title: 'A; C; d',
    })
  })
})

describe('applyTitleDraftInput', () => {
  it('updates draft when no semicolon', () => {
    expect(applyTitleDraftInput(['A'], 'hello')).toEqual({
      pills: ['A'],
      draft: 'hello',
      title: 'A; hello',
    })
  })

  it('locks completed segments on semicolon paste', () => {
    expect(applyTitleDraftInput([], 'One; Two; Three')).toEqual({
      pills: ['One', 'Two'],
      draft: 'Three',
      title: 'One; Two; Three',
    })
  })

  it('trims leading space on trailing fragment', () => {
    expect(applyTitleDraftInput(['X'], 'Y;  rest')).toEqual({
      pills: ['X', 'Y'],
      draft: 'rest',
      title: 'X; Y; rest',
    })
  })
})
