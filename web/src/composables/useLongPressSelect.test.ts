/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useLongPressSelect } from './useLongPressSelect'

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>()
  const mql = {
    matches,
    media: '(max-width: 639px)',
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    dispatch: (next: boolean) => {
      mql.matches = next
      for (const fn of [...listeners]) fn()
    },
  }
  vi.stubGlobal('matchMedia', () => mql)
  return mql
}

describe('useLongPressSelect', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('toggles selection and clears', async () => {
    stubMatchMedia(false)
    const Comp = defineComponent({
      setup() {
        return useLongPressSelect<string>({ autoBindMedia: true })
      },
      template: '<div />',
    })
    const w = mount(Comp)
    const api = w.vm as unknown as ReturnType<typeof useLongPressSelect<string>>
    api.toggleSelect('a')
    api.toggleSelect('b')
    expect([...api.selectedIds]).toEqual(['a', 'b'])
    api.clearSelection()
    expect(api.selectedIds.size).toBe(0)
    expect(api.selectMode).toBe(false)
    w.unmount()
  })

  it('long-press enters select mode on narrow when row select hidden', async () => {
    stubMatchMedia(true)
    const Comp = defineComponent({
      setup() {
        return useLongPressSelect<string>({ autoBindMedia: true, longPressMs: 450 })
      },
      template: '<div />',
    })
    const w = mount(Comp)
    const api = w.vm as unknown as ReturnType<typeof useLongPressSelect<string>>
    expect(api.isNarrow).toBe(true)
    expect(api.showRowSelect).toBe(false)

    const target = document.createElement('div')
    api.onRowPointerDown(
      {
        clientX: 10,
        clientY: 10,
        target,
      } as unknown as PointerEvent,
      'song-1',
    )
    vi.advanceTimersByTime(450)
    await nextTick()
    expect(api.selectMode).toBe(true)
    expect(api.selectedIds.has('song-1')).toBe(true)
    w.unmount()
  })

  it('cancels long-press when pointer moves too far', async () => {
    stubMatchMedia(true)
    const Comp = defineComponent({
      setup() {
        return useLongPressSelect<string>({
          autoBindMedia: true,
          longPressMs: 450,
          longPressMovePx: 10,
        })
      },
      template: '<div />',
    })
    const w = mount(Comp)
    const api = w.vm as unknown as ReturnType<typeof useLongPressSelect<string>>
    const target = document.createElement('div')
    api.onRowPointerDown(
      { clientX: 0, clientY: 0, target } as unknown as PointerEvent,
      'song-1',
    )
    api.onRowPointerMove({ clientX: 20, clientY: 0 } as PointerEvent)
    vi.advanceTimersByTime(450)
    expect(api.selectMode).toBe(false)
    expect(api.selectedIds.size).toBe(0)
    w.unmount()
  })

  it('prunes dead ids', () => {
    stubMatchMedia(false)
    const Comp = defineComponent({
      setup() {
        return useLongPressSelect<string>({ autoBindMedia: true })
      },
      template: '<div />',
    })
    const w = mount(Comp)
    const api = w.vm as unknown as ReturnType<typeof useLongPressSelect<string>>
    api.toggleSelect('a')
    api.toggleSelect('b')
    api.pruneSelection(['b'])
    expect([...api.selectedIds]).toEqual(['b'])
    api.pruneSelection([])
    expect(api.selectedIds.size).toBe(0)
    expect(api.selectMode).toBe(false)
    w.unmount()
  })
})
