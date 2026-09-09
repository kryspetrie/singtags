/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { opticalVideoConstraints } from './opticalCamera'

describe('opticalVideoConstraints', () => {
  it('uses facingMode when no deviceId', () => {
    const c = opticalVideoConstraints(null)
    expect(c.facingMode).toEqual({ ideal: 'environment' })
    expect(c.deviceId).toBeUndefined()
  })

  it('uses exact deviceId when provided', () => {
    const c = opticalVideoConstraints('cam-123')
    expect(c.deviceId).toEqual({ exact: 'cam-123' })
    expect(c.facingMode).toBeUndefined()
  })
})
