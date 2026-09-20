import { describe, expect, it } from 'vitest'
import {
  isLegacyTagRollProjectId,
  newTagRollProjectId,
  TAG_ROLL_PROJECT_ID_LENGTH,
} from './ids'

describe('tagRoll project ids', () => {
  it('generates short alphanumeric nanoid slugs', () => {
    const id = newTagRollProjectId()
    expect(id).toHaveLength(TAG_ROLL_PROJECT_ID_LENGTH)
    expect(id).toMatch(/^[0-9A-Za-z]+$/)
  })

  it('detects legacy UUID-based project keys', () => {
    expect(isLegacyTagRollProjectId('tr_550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isLegacyTagRollProjectId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isLegacyTagRollProjectId('V1StGXR8Za')).toBe(false)
    expect(isLegacyTagRollProjectId('tr_short')).toBe(false)
  })
})
