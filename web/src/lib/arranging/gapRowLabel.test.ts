/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { TAG_ROLL_DEFAULT_TIME_SIGNATURE } from '../tagRoll/types'
import { gapRowLabel } from './gapRowLabel'

describe('gapRowLabel', () => {
  it('formats measure:beat and note without a pipe', () => {
    const s = gapRowLabel(0, 60, TAG_ROLL_DEFAULT_TIME_SIGNATURE)
    expect(s).toMatch(/^1:1 · /)
    expect(s).not.toContain('|')
    expect(s).toContain('C')
  })
})
