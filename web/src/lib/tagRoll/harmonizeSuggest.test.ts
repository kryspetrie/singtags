import { describe, expect, it } from 'vitest'
import {
  canApplyHarmonizeSuggest,
  coachOpenSeedFromSelection,
  indexOfSeedInCandidates,
  matchSuggestCandidate,
} from './harmonizeSuggest'

const list = [
  { rootPc: 0, natureId: 'major', voicing: 'root', spread: false, midi: { bass: 1, bari: 2, lead: 3, tenor: 4 } },
  { rootPc: 0, natureId: 'major', voicing: 'root', spread: true, midi: { bass: 5, bari: 6, lead: 7, tenor: 8 } },
  { rootPc: 0, natureId: 'major', voicing: 'first', spread: false, midi: { bass: 9, bari: 10, lead: 11, tenor: 12 } },
  { rootPc: 7, natureId: 'dom7', voicing: 'root', spread: false, midi: { bass: 13, bari: 14, lead: 15, tenor: 16 } },
]

describe('matchSuggestCandidate', () => {
  it('prefers voicing+spread when both set', () => {
    const hit = matchSuggestCandidate(list, {
      rootPc: 0,
      natureId: 'major',
      voicing: 'root',
      spread: true,
    })
    expect(hit?.spread).toBe(true)
    expect(hit?.midi.bass).toBe(5)
  })

  it('exact mode refuses wrong spread', () => {
    expect(
      matchSuggestCandidate(
        list,
        { rootPc: 0, natureId: 'major', voicing: 'root', spread: true },
        { exact: true },
      )?.spread,
    ).toBe(true)
    expect(
      matchSuggestCandidate(
        list,
        { rootPc: 0, natureId: 'major', voicing: 'missing', spread: false },
        { exact: true },
      ),
    ).toBeNull()
  })

  it('falls back to voicing then chord identity when not exact', () => {
    expect(
      matchSuggestCandidate(list, { rootPc: 0, natureId: 'major', voicing: 'first' })?.voicing,
    ).toBe('first')
    expect(matchSuggestCandidate(list, { rootPc: 7, natureId: 'dom7' })?.natureId).toBe('dom7')
  })
})

describe('canApplyHarmonizeSuggest', () => {
  it('allows any match', () => {
    expect(
      canApplyHarmonizeSuggest({
        hasMatch: true,
        hasMelody: true,
        hasChord: false,
        applyMode: 'stack',
        hasVoicing: false,
      }),
    ).toBe(true)
  })

  it('blocks stack fallback without voicing (enabled-but-noop hole)', () => {
    expect(
      canApplyHarmonizeSuggest({
        hasMatch: false,
        hasMelody: true,
        hasChord: true,
        applyMode: 'stack',
        hasVoicing: false,
      }),
    ).toBe(false)
  })

  it('allows sketch fallback with chord only', () => {
    expect(
      canApplyHarmonizeSuggest({
        hasMatch: false,
        hasMelody: true,
        hasChord: true,
        applyMode: 'sketch',
        hasVoicing: false,
      }),
    ).toBe(true)
  })
})

describe('coachOpenSeedFromSelection', () => {
  it('requires nature for rootPc without match', () => {
    expect(coachOpenSeedFromSelection({ tick: 0, rootPc: 4 })).toEqual({
      tick: 0,
      rootPc: undefined,
      natureId: undefined,
      voicing: null,
    })
    expect(coachOpenSeedFromSelection({ tick: 10, rootPc: 4, natureId: 'major', voicing: 'root' })).toEqual({
      tick: 10,
      rootPc: 4,
      natureId: 'major',
      voicing: 'root',
    })
  })
})

describe('indexOfSeedInCandidates', () => {
  it('finds exact then identity', () => {
    expect(indexOfSeedInCandidates(list, { rootPc: 0, natureId: 'major', voicing: 'first' })).toBe(2)
    expect(indexOfSeedInCandidates(list, { rootPc: 7, natureId: 'dom7' })).toBe(3)
    expect(indexOfSeedInCandidates(list, { rootPc: 1, natureId: 'major' })).toBe(-1)
  })
})
