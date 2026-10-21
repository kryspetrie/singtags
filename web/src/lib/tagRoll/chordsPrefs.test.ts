/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadChordPickLabelMode,
  saveChordPickLabelMode,
} from './chordsPrefs'

describe('chord pick label mode prefs', () => {
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

  it('defaults to name and round-trips roman', () => {
    stubLocalStorage()
    expect(loadChordPickLabelMode()).toBe('name')
    saveChordPickLabelMode('roman')
    expect(loadChordPickLabelMode()).toBe('roman')
    saveChordPickLabelMode('name')
    expect(loadChordPickLabelMode()).toBe('name')
  })
})
