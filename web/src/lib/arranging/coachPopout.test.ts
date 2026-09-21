import { describe, expect, it } from 'vitest'
import {
  buildCoachPopoutUrl,
  coachChannelName,
  isCoachPopoutSearch,
} from './coachPopout'

describe('coachPopout', () => {
  it('detects popout query', () => {
    expect(isCoachPopoutSearch('?coachPopout=1')).toBe(true)
    expect(isCoachPopoutSearch('coachPopout=1&x=2')).toBe(true)
    expect(isCoachPopoutSearch('')).toBe(false)
    expect(isCoachPopoutSearch('?coachPopout=0')).toBe(false)
  })

  it('builds popout url preserving path', () => {
    expect(buildCoachPopoutUrl('/tag-studio/abc')).toBe('/tag-studio/abc?coachPopout=1')
    expect(buildCoachPopoutUrl('/tag-studio/abc?foo=1')).toContain('coachPopout=1')
    expect(buildCoachPopoutUrl('/tag-studio/abc?foo=1')).toContain('foo=1')
  })

  it('names channel by project', () => {
    expect(coachChannelName('tr_1')).toBe('singtags-coach-tr_1')
  })
})
