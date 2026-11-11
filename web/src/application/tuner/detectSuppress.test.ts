import { describe, expect, it } from 'vitest'
import {
  beginDetectSuppress,
  createDetectSuppressState,
  endDetectSuppress,
} from './detectSuppress'

describe('detectSuppress', () => {
  it('toggles suppressed state for reference tones', () => {
    let s = createDetectSuppressState()
    expect(s.suppressed).toBe(false)
    s = beginDetectSuppress(s, 'tone')
    expect(s).toEqual({ suppressed: true, reason: 'tone' })
    s = endDetectSuppress(s)
    expect(s.suppressed).toBe(false)
  })
})
