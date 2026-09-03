/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { formatLocalSizeWarn, LOCAL_FILE_WARN_BYTES } from './localDocReceive'

describe('localDocReceive helpers', () => {
  it('warns only for large payloads', () => {
    expect(formatLocalSizeWarn(LOCAL_FILE_WARN_BYTES - 1)).toBeNull()
    expect(formatLocalSizeWarn(LOCAL_FILE_WARN_BYTES)).toMatch(/MB/)
  })
})
