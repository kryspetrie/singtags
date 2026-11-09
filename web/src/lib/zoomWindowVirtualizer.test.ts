import { describe, expect, it, vi } from 'vitest'
import {
  bindVirtualizerScrollAdjustGate,
  pinWindowVirtualizerToSearchTop,
} from './zoomWindowVirtualizer'

describe('zoomWindowVirtualizer search-top pin', () => {
  it('binds the scroll-adjust gate on the instance field TanStack actually reads', () => {
    const instance = {
      shouldAdjustScrollPositionOnItemSizeChange: undefined as
        | undefined
        | (() => boolean),
    }
    let block = true
    bindVirtualizerScrollAdjustGate(instance as never, () => block)
    expect(instance.shouldAdjustScrollPositionOnItemSizeChange?.()).toBe(false)
    block = false
    expect(instance.shouldAdjustScrollPositionOnItemSizeChange?.()).toBe(true)
  })

  it('clears eager scrollOffset/adjustments when pinning search-top', () => {
    const scrollTo = vi.fn()
    const instance = {
      scrollOffset: 640,
      scrollAdjustments: 48,
      _intendedScrollOffset: 688,
      scrollElement: { scrollTo },
    }
    pinWindowVirtualizerToSearchTop(instance as never)
    expect(instance.scrollOffset).toBe(0)
    expect(instance.scrollAdjustments).toBe(0)
    expect(instance._intendedScrollOffset).toBeNull()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })
})
