import { describe, expect, it } from 'vitest'
import { visibleAltTitle } from './tagDisplay'

describe('visibleAltTitle', () => {
  it('returns trimmed alt title when distinct from title', () => {
    expect(visibleAltTitle(' Oh, My Luve ', 'A Red, Red Rose')).toBe('Oh, My Luve')
  })

  it('omits empty or duplicate titles', () => {
    expect(visibleAltTitle(null, 'Hello')).toBeNull()
    expect(visibleAltTitle('  ', 'Hello')).toBeNull()
    expect(visibleAltTitle('Hello', 'Hello')).toBeNull()
    expect(visibleAltTitle('HELLO', 'hello')).toBeNull()
  })
})
