/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FilterSheet from './FilterSheet.vue'
import SheetViewer from './SheetViewer.vue'

vi.mock('../lib/contentCrop', () => ({
  cropImageUrl: vi.fn(async (url: string) => ({ url, revoke: false })),
  cropDrawnCanvas: vi.fn(async () => 'blob:cropped'),
  findContentBounds: vi.fn(() => null),
}))

vi.mock('../lib/pdfRender', () => ({
  renderPdfToPageUrls: vi.fn(async (url: string) => {
    const name = url.split('/').pop() || 'sheet.pdf'
    return [`blob:pdf-page-1-${name}`, `blob:pdf-page-2-${name}`]
  }),
}))

describe('FilterSheet', () => {
  it('emits close from backdrop', async () => {
    const w = mount(FilterSheet, {
      props: { open: true, title: 'Pick' },
      slots: { default: '<p>body</p>' },
      attachTo: document.body,
    })
    await flushPromises()
    // Content mounts after a double rAF so the enter animation can run.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    await flushPromises()
    expect(document.body.textContent).toContain('Pick')
    ;(document.body.querySelector('.backdrop') as HTMLButtonElement).click()
    expect(w.emitted('close')).toBeTruthy()
    w.unmount()
  })
})

describe('SheetViewer fullscreen + pay key', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enters fullscreen and emits pay events', async () => {
    const w = mount(SheetViewer, {
      props: {
        pages: ['sheets/1/p1.webp'],
        baseUrl: '/sample-data/',
        payKeyEnabled: true,
        keyLabel: 'Bb',
        shift: 1,
      },
      attachTo: document.body,
    })
    await flushPromises()
    await w.get('button.fs-fab').trigger('click')
    expect(w.emitted('fullscreen-change')?.[0]).toEqual([true])
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overflow).toBe('hidden')
    const fab = w.get('button.pitch-fab')
    await fab.trigger('pointerdown')
    expect(w.emitted('pay-down')).toBeTruthy()
    await fab.trigger('pointerup')
    expect(w.emitted('pay-up')).toBeTruthy()
    expect(w.find('.pitch-expand').exists()).toBe(false)
    expect(w.find('.pitch-expanded-wrap').exists()).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(w.emitted('fullscreen-change')?.at(-1)).toEqual([false])
    w.unmount()
    expect(document.body.style.overflow).toBe('')
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('defaults to PDF (no format toggle) when PDF + its own raster pages exist', async () => {
    const { renderPdfToPageUrls } = await import('../lib/pdfRender')
    const w = mount(SheetViewer, {
      props: {
        pages: ['sheets/1/p1.webp'],
        pdf: 'sheets/1/sheet.pdf',
        baseUrl: '/sample-data/',
        canChooseFormat: false,
      },
    })
    await flushPromises()
    expect(w.find('[aria-label="Sheet music format"]').exists()).toBe(false)
    expect(w.find('iframe').exists()).toBe(false)
    expect(w.findAll('img').length).toBe(2)
    expect(w.find('img').attributes('src')).toContain('blob:pdf-page')
    expect(renderPdfToPageUrls).toHaveBeenCalled()
    w.unmount()
  })

  it('shows format toggle only when uploads of both kinds exist', async () => {
    const { renderPdfToPageUrls } = await import('../lib/pdfRender')
    const w = mount(SheetViewer, {
      props: {
        pages: ['sheets/1/p1.webp'],
        pdf: 'sheets/1/sheet.pdf',
        baseUrl: '/sample-data/',
        canChooseFormat: true,
      },
    })
    await flushPromises()
    const wrap = w.get('.wrap')
    const sheet = wrap.get('.sheet')
    const pickers = wrap.get('.pickers')
    expect(sheet.element.compareDocumentPosition(pickers.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const group = w.get('[aria-label="Sheet music format"]')
    const [imagesBtn, pdfBtn] = group.findAll('button')
    // Online default: PDF at 300 DPI rather than cached WebP pages.
    expect(pdfBtn!.attributes('aria-pressed')).toBe('true')
    expect(imagesBtn!.attributes('aria-pressed')).toBe('false')
    expect(w.findAll('img').length).toBe(2)
    expect(w.find('img').attributes('src')).toContain('blob:pdf-page')
    expect(renderPdfToPageUrls).toHaveBeenCalled()

    await imagesBtn!.trigger('click')
    await flushPromises()
    expect(imagesBtn!.attributes('aria-pressed')).toBe('true')
    expect(pdfBtn!.attributes('aria-pressed')).toBe('false')
    expect(w.find('iframe').exists()).toBe(false)
    expect(w.findAll('img').length).toBeGreaterThan(0)
    w.unmount()
  })

  it('shows PDF pages alone when there are no image pages', async () => {
    const w = mount(SheetViewer, {
      props: {
        pages: [],
        pdf: 'sheets/1/sheet.pdf',
        baseUrl: '/sample-data/',
      },
    })
    await flushPromises()
    expect(w.find('[aria-label="Sheet music format"]').exists()).toBe(false)
    expect(w.findAll('img').length).toBe(2)
    w.unmount()
  })

  it('lets you pick among multiple PDFs and image sets', async () => {
    const { renderPdfToPageUrls } = await import('../lib/pdfRender')
    const w = mount(SheetViewer, {
      props: {
        imageSets: [
          { id: 'pages', label: 'Pages (2)', paths: ['sheets/1/p1.webp', 'sheets/1/p2.webp'] },
          { id: 'img-a', label: 'scan.jpg', paths: ['sheets/1/scan.jpg'] },
        ],
        pdfs: [
          { id: 'pdf-a', label: 'arr.pdf', path: 'sheets/1/arr.pdf' },
          { id: 'pdf-b', label: 'learn.pdf', path: 'sheets/1/learn.pdf' },
        ],
        canChooseFormat: true,
        baseUrl: '/sample-data/',
      },
    })
    await flushPromises()
    // Defaults to PDF when available.
    expect(renderPdfToPageUrls).toHaveBeenCalled()
    expect(w.findAll('img')).toHaveLength(2)
    const pdfSelect = w.get('select[aria-label="Choose PDF sheet"]')
    await pdfSelect.setValue('pdf-b')
    await flushPromises()
    expect(vi.mocked(renderPdfToPageUrls).mock.calls.at(-1)?.[0]).toContain('learn.pdf')

    await w.get('[aria-label="Sheet music format"]').findAll('button')[0]!.trigger('click')
    await flushPromises()
    const imageSelect = w.get('select[aria-label="Choose image sheet"]')
    await imageSelect.setValue('img-a')
    await flushPromises()
    expect(w.findAll('img')).toHaveLength(1)
    expect(w.find('img').attributes('src')).toContain('scan.jpg')
    w.unmount()
  })
})
