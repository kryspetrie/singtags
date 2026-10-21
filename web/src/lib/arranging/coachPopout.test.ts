/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import {
  dispatchCoachPopoutIntent,
  registerCoachPopoutIntentHandler,
  buildCoachPopoutUrl,
  buildDockPopoutUrl,
  isCoachPopoutSearch,
  parseDockPopoutKind,
  coachChannelName,
} from './coachPopout'

describe('coachPopout', () => {
  it('detects legacy coach popout query', () => {
    expect(isCoachPopoutSearch('?coachPopout=1')).toBe(true)
    expect(isCoachPopoutSearch('coachPopout=1&x=2')).toBe(true)
    expect(isCoachPopoutSearch('')).toBe(false)
    expect(isCoachPopoutSearch('?coachPopout=0')).toBe(false)
  })

  it('parses dockPopout kinds', () => {
    expect(parseDockPopoutKind('?dockPopout=coach')).toBe('coach')
    expect(parseDockPopoutKind('?dockPopout=harmonize')).toBe('harmonize')
    expect(parseDockPopoutKind('?dockPopout=chordEdit')).toBe('harmonize')
    expect(parseDockPopoutKind('?coachPopout=1')).toBe('coach')
    expect(parseDockPopoutKind('?dockPopout=nope')).toBe(null)
  })

  it('builds dock popout urls', () => {
    expect(buildDockPopoutUrl('/tag-studio/abc', 'harmonize')).toBe(
      '/tag-studio/abc?dockPopout=harmonize',
    )
    expect(buildCoachPopoutUrl('/tag-studio/abc')).toBe('/tag-studio/abc?dockPopout=coach')
  })

  it('names channel by project', () => {
    expect(coachChannelName('tr_1')).toBe('singtags-coach-tr_1')
  })

  it('dispatches transport intents to the registered pop-out handler', () => {
    const handler = vi.fn()
    const off = registerCoachPopoutIntentHandler(handler)
    dispatchCoachPopoutIntent('primary')
    expect(handler).toHaveBeenCalledWith('primary')
    off()
    dispatchCoachPopoutIntent('lock')
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
