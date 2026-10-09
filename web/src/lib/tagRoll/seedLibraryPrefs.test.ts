/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dismissTagRollSeed,
  isTagRollLibraryInitialized,
  isTagRollSeedDismissed,
  isTagRollSeedId,
  markTagRollLibraryInitialized,
  readDismissedSeedIds,
} from './seedLibraryPrefs'

describe('seedLibraryPrefs', () => {
  const mem = new Map<string, string>()

  afterEach(() => {
    mem.clear()
    vi.unstubAllGlobals()
  })

  function stubLocalStorage(): void {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      },
      removeItem: (k: string) => {
        mem.delete(k)
      },
    })
  }

  it('recognizes seed- ids', () => {
    expect(isTagRollSeedId('seed-polecat-pitch-90001')).toBe(true)
    expect(isTagRollSeedId('seed-coach-trial-bonnie-classic')).toBe(true)
    expect(isTagRollSeedId('trlfPy1VAm')).toBe(false)
  })

  it('dismisses seeds and skips non-seeds', () => {
    stubLocalStorage()
    dismissTagRollSeed('trlfPy1VAm')
    expect(readDismissedSeedIds().size).toBe(0)
    dismissTagRollSeed('seed-coach-trial-bonnie-classic')
    expect(isTagRollSeedDismissed('seed-coach-trial-bonnie-classic')).toBe(true)
    expect(isTagRollSeedDismissed('seed-polecat-pitch-90001')).toBe(false)
  })

  it('marks library initialized', () => {
    stubLocalStorage()
    expect(isTagRollLibraryInitialized()).toBe(false)
    markTagRollLibraryInitialized()
    expect(isTagRollLibraryInitialized()).toBe(true)
  })
})
