/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import TagPageTitle from './TagPageTitle.vue'

function mountWithWidth(opts: {
  title: string
  altTitle: string
  headingWidth: number
  measureWidth: number
}) {
  let roCb: ResizeObserverCallback | null = null
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        roCb = cb
      }
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    },
  )
  const w = mount(TagPageTitle, {
    props: {
      title: opts.title,
      altTitle: opts.altTitle,
      barbershopUrl: 'https://example.com/tag',
    },
    attachTo: document.body,
  })
  const heading = w.get('h1').element as HTMLElement
  const measure = w.get('.title-measure').element as HTMLElement
  Object.defineProperty(heading, 'clientWidth', {
    configurable: true,
    get: () => opts.headingWidth,
  })
  Object.defineProperty(measure, 'offsetWidth', {
    configurable: true,
    get: () => opts.measureWidth,
  })
  return { w, triggerResize: () => roCb?.([], {} as ResizeObserver) }
}

describe('TagPageTitle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('renders title and share actions', async () => {
    const { w } = mountWithWidth({
      title: 'Today',
      altTitle: 'Who Cares',
      headingWidth: 400,
      measureWidth: 200,
    })
    await flushPromises()
    expect(w.get('h1').text()).toContain('Today')
    expect(w.get('.title-copy').text()).toBe('Share')
    expect(w.get('a.title-ext').attributes('href')).toContain('example.com')
    w.unmount()
  })

  it('stacks alt below without interpunct when inline width does not fit', async () => {
    const { w, triggerResize } = mountWithWidth({
      title: 'Today',
      altTitle: 'Who Cares What Tomorrow Shall Bring?',
      headingWidth: 120,
      measureWidth: 400,
    })
    await flushPromises()
    triggerResize()
    await flushPromises()
    await nextTick()

    expect(w.find('.alt-title--stacked').exists()).toBe(true)
    expect(w.find('.alt-title--stacked').text()).toBe('Who Cares What Tomorrow Shall Bring?')
    expect(w.get('h1').text()).toBe('Today')
    expect(w.get('h1').text()).not.toContain('·')
    w.unmount()
  })

  it('keeps alt inline with interpunct when it fits', async () => {
    const { w, triggerResize } = mountWithWidth({
      title: 'Today',
      altTitle: 'Short',
      headingWidth: 500,
      measureWidth: 180,
    })
    await flushPromises()
    triggerResize()
    await flushPromises()
    await nextTick()

    expect(w.find('.alt-title--stacked').exists()).toBe(false)
    expect(w.get('h1').text()).toContain('·')
    expect(w.get('h1').text()).toContain('Short')
    w.unmount()
  })
})
