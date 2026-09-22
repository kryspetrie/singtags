/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  loadTeachStripCollapsed,
  saveTeachStripCollapsed,
} from './teachStripPrefs'

describe('teachStripPrefs', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to expanded (not collapsed)', () => {
    expect(loadTeachStripCollapsed(false)).toBe(false)
  })

  it('persists collapse', () => {
    saveTeachStripCollapsed(true)
    expect(loadTeachStripCollapsed(false)).toBe(true)
    saveTeachStripCollapsed(false)
    expect(loadTeachStripCollapsed(true)).toBe(false)
  })
})
