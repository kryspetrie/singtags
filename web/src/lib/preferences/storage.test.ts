/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { loadBool, loadNumber, loadString, loadStringArray } from './storage'

describe('preferences storage helpers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads booleans from 1/0 and true/false strings', () => {
    localStorage.setItem('bool', '1')
    expect(loadBool('bool', false)).toBe(true)
    localStorage.setItem('bool', '0')
    expect(loadBool('bool', true)).toBe(false)
    localStorage.setItem('bool', 'true')
    expect(loadBool('bool', false)).toBe(true)
    localStorage.setItem('bool', 'false')
    expect(loadBool('bool', true)).toBe(false)
    expect(loadBool('missing', true)).toBe(true)
  })

  it('loads numbers with finite fallback', () => {
    localStorage.setItem('num', '42')
    expect(loadNumber('num', 0)).toBe(42)
    localStorage.setItem('num', 'nope')
    expect(loadNumber('num', 7)).toBe(7)
    expect(loadNumber('missing', 3)).toBe(3)
  })

  it('loads strings with empty fallback', () => {
    localStorage.setItem('str', 'hello')
    expect(loadString('str', 'fallback')).toBe('hello')
    localStorage.setItem('str', '')
    expect(loadString('str', 'fallback')).toBe('fallback')
    expect(loadString('missing', 'fallback')).toBe('fallback')
  })

  it('loads string arrays and normalizes custom parts', () => {
    localStorage.setItem('arr', JSON.stringify(['Lead', 'BARI', 1]))
    expect(loadStringArray('arr', ['lead'])).toEqual(['lead', 'bari'])
    localStorage.setItem('arr', JSON.stringify('not-array'))
    expect(loadStringArray('arr', ['tenor'])).toEqual(['tenor'])
  })
})
