import { describe, expect, it, vi } from 'vitest'
import { requestCoachUi, subscribeCoachUiIntent } from './coachUiIntent'

describe('coachUiIntent', () => {
  it('delivers to live subscribers', () => {
    const fn = vi.fn()
    const off = subscribeCoachUiIntent(fn)
    requestCoachUi({ type: 'openCheck' })
    expect(fn).toHaveBeenCalledWith({ type: 'openCheck' })
    off()
  })

  it('queues for a late subscriber when none are live', () => {
    requestCoachUi({ type: 'openCheck' })
    const fn = vi.fn()
    const off = subscribeCoachUiIntent(fn)
    expect(fn).toHaveBeenCalledWith({ type: 'openCheck' })
    off()
  })

  it('does not re-deliver after a live handoff', () => {
    const live = vi.fn()
    const offLive = subscribeCoachUiIntent(live)
    requestCoachUi({ type: 'openChoose' })
    expect(live).toHaveBeenCalledTimes(1)
    offLive()
    const late = vi.fn()
    const offLate = subscribeCoachUiIntent(late)
    expect(late).not.toHaveBeenCalled()
    offLate()
  })

  it('fans pending openChoose with seed to co-mounted subscribers', async () => {
    requestCoachUi({
      type: 'openChoose',
      tick: 480,
      rootPc: 0,
      natureId: 'major',
      voicing: 'root',
    })
    const a = vi.fn()
    const b = vi.fn()
    const offA = subscribeCoachUiIntent(a)
    const offB = subscribeCoachUiIntent(b)
    expect(a).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'openChoose', tick: 480, natureId: 'major' }),
    )
    expect(b).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'openChoose', tick: 480, natureId: 'major' }),
    )
    offA()
    offB()
    await Promise.resolve()
  })
})
