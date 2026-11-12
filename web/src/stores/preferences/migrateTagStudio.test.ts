/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  LEGACY_TAG_STUDIO_CELL_H_KEY,
  LEGACY_TAG_STUDIO_CELL_W_KEY,
  LEGACY_TAG_STUDIO_ENABLED_KEY,
  TAG_ROLL_CELL_H_KEY,
  TAG_ROLL_CELL_W_KEY,
  TAG_ROLL_ENABLED_KEY,
  migrateLegacyTagStudioLabsKeys,
} from './storage'

describe('migrateLegacyTagStudioLabsKeys', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('copies legacy tagStudio keys into tagRoll when missing', () => {
    localStorage.setItem(LEGACY_TAG_STUDIO_ENABLED_KEY, '1')
    localStorage.setItem(LEGACY_TAG_STUDIO_CELL_W_KEY, '32')
    localStorage.setItem(LEGACY_TAG_STUDIO_CELL_H_KEY, '18')
    migrateLegacyTagStudioLabsKeys()
    expect(localStorage.getItem(TAG_ROLL_ENABLED_KEY)).toBe('1')
    expect(localStorage.getItem(TAG_ROLL_CELL_W_KEY)).toBe('32')
    expect(localStorage.getItem(TAG_ROLL_CELL_H_KEY)).toBe('18')
    expect(localStorage.getItem(LEGACY_TAG_STUDIO_ENABLED_KEY)).toBeNull()
  })

  it('keeps existing tagRoll values and still drops legacy keys', () => {
    localStorage.setItem(TAG_ROLL_ENABLED_KEY, '0')
    localStorage.setItem(LEGACY_TAG_STUDIO_ENABLED_KEY, '1')
    migrateLegacyTagStudioLabsKeys()
    expect(localStorage.getItem(TAG_ROLL_ENABLED_KEY)).toBe('0')
    expect(localStorage.getItem(LEGACY_TAG_STUDIO_ENABLED_KEY)).toBeNull()
  })
})
