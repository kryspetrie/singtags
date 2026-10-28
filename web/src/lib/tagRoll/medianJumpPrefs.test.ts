/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadHeldPartNames, loadLockMelody, medianJumpOnFill, saveHeldPartNames, saveLockMelody, setMedianJumpOnFill } from './medianJumpPrefs'

const memory = new Map<string, string>()

afterEach(() => {
  memory.clear()
  vi.unstubAllGlobals()
})

function stubStorage(): void {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
    removeItem: (key: string) => {
      memory.delete(key)
    },
  })
}

describe('medianJumpPrefs', () => {
  it('keeps fill smoothing on until it is switched off', () => {
    expect(medianJumpOnFill()).toBe(true)
    stubStorage()
    expect(medianJumpOnFill()).toBe(true)
    setMedianJumpOnFill(false)
    expect(medianJumpOnFill()).toBe(false)
    setMedianJumpOnFill(true)
    expect(medianJumpOnFill()).toBe(true)
  })

  it('remembers held parts, and treats a missing key as the melody default', () => {
    stubStorage()
    expect(loadHeldPartNames()).toBeNull()
    saveHeldPartNames(['Lead', 'Bass'])
    expect(loadHeldPartNames()).toEqual(['Lead', 'Bass'])
    saveHeldPartNames([])
    expect(loadHeldPartNames()).toEqual([])
  })

  it('locks the melody until the switch is turned off', () => {
    expect(loadLockMelody()).toBe(true)
    stubStorage()
    expect(loadLockMelody()).toBe(true)
    saveLockMelody(false)
    expect(loadLockMelody()).toBe(false)
    saveLockMelody(true)
    expect(loadLockMelody()).toBe(true)
  })
})
