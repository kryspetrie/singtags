/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { sha256Hex } from './driveAppData'

describe('driveAppData', () => {
  it('sha256Hex is stable and sensitive to input', async () => {
    expect(await sha256Hex('singtags')).toBe(await sha256Hex('singtags'))
    expect(await sha256Hex('a')).not.toBe(await sha256Hex('b'))
  })
})
