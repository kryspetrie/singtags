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
  DEFAULT_PDF_RENDER_DPI: 300,
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

  it('defaults to WebP inline; PDF rasterizes only on fullscreen', async () => {
    const { renderPdfToPageUrls } = await import('../lib/pdfRender')
    const w = mount(SheetViewer, {
      props: {
        pages: ['sheets/1/p1.webp'],
        pdf: 'sheets/1/sheet.pdf',
        baseUrl: '/sample-data/',
        canChooseFormat: false,
      },
      attachTo: document.body,
    })
    await flushPromises()
    expect(w.find('[aria-label="Sheet music format"]').exists()).toBe(false)
    expect(w.find('iframe').exists()).toBe(false)
    expect(w.findAll('img').length).toBe(1)
    expect(w.find('img').attributes('src')).toContain('p1.webp')
    expect(renderPdfToPageUrls).not.toHaveBeenCalled()

    await w.get('button.fs-fab').trigger('click')
    await flushPromises()
    expect(renderPdfToPageUrls).toHaveBeenCalled()
    expect(w.findAll('img').length).toBe(2)
    expect(w.find('img').attributes('src')).toContain('blob:pdf-page')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(w.find('img').attributes('src')).toContain('p1.webp')
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
    // Inline default: WebP; PDF is opt-in via the format toggle (or fullscreen).
    expect(imagesBtn!.attributes('aria-pressed')).toBe('true')
    expect(pdfBtn!.attributes('aria-pressed')).toBe('false')
    expect(w.findAll('img').length).toBeGreaterThan(0)
    expect(w.find('img').attributes('src')).toContain('p1.webp')
    expect(renderPdfToPageUrls).not.toHaveBeenCalled()

    await pdfBtn!.trigger('click')
    await flushPromises()
    expect(pdfBtn!.attributes('aria-pressed')).toBe('true')
    expect(imagesBtn!.attributes('aria-pressed')).toBe('false')
    expect(w.find('iframe').exists()).toBe(false)
    expect(w.findAll('img').length).toBe(2)
    expect(w.find('img').attributes('src')).toContain('blob:pdf-page')
    expect(renderPdfToPageUrls).toHaveBeenCalled()
    w.unmount()
  })

  it('keeps WebP on screen while PDF rasterizes; never shows Preparing PDF', async () => {
    let finish!: (urls: string[]) => void
    const { renderPdfToPageUrls } = await import('../lib/pdfRender')
    vi.mocked(renderPdfToPageUrls).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const w = mount(SheetViewer, {
      props: {
        pages: ['sheets/1/p1.webp'],
        pdf: 'sheets/1/sheet.pdf',
        baseUrl: '/sample-data/',
        canChooseFormat: true,
      },
    })
    await flushPromises()
    await w.get('[aria-label="Sheet music format"]').findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(w.text()).not.toContain('Preparing PDF')
    expect(w.find('img').attributes('src')).toContain('p1.webp')
    finish(['blob:pdf-page-ready-1', 'blob:pdf-page-ready-2'])
    await flushPromises()
    expect(w.find('img').attributes('src')).toContain('blob:pdf-page-ready')
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
    // Defaults to images; PDF only after switching format.
    expect(renderPdfToPageUrls).not.toHaveBeenCalled()
    expect(w.findAll('img')).toHaveLength(2)
    expect(w.find('img').attributes('src')).toContain('p1.webp')

    const formatBtns = w.get('[aria-label="Sheet music format"]').findAll('button')
    await formatBtns[1]!.trigger('click') // PDF
    await flushPromises()
    expect(renderPdfToPageUrls).toHaveBeenCalled()
    expect(w.findAll('img')).toHaveLength(2)
    const pdfSelect = w.get('select[aria-label="Choose PDF sheet"]')
    await pdfSelect.setValue('pdf-b')
    await flushPromises()
    expect(vi.mocked(renderPdfToPageUrls).mock.calls.at(-1)?.[0]).toContain('learn.pdf')

    await formatBtns[0]!.trigger('click') // Images
    await flushPromises()
    const imageSelect = w.get('select[aria-label="Choose image sheet"]')
    await imageSelect.setValue('img-a')
    await flushPromises()
    expect(w.findAll('img')).toHaveLength(1)
    expect(w.find('img').attributes('src')).toContain('scan.jpg')
    w.unmount()
  })
})
