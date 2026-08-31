import type { Meta, StoryObj } from '@storybook/vue3-vite'
import SheetViewer from '../components/SheetViewer.vue'

const meta = {
  title: 'SingTags/SheetViewer',
  component: SheetViewer,
  tags: ['autodocs'],
  args: {
    pages: [],
    baseUrl: '/library/',
  },
} satisfies Meta<typeof SheetViewer>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}

export const Pages: Story = {
  args: {
    // Use public sample if present; Storybook serves Vite public/
    pages: ['sheets/4011/pages/page-01.webp'],
  },
}

export const ImagesAndPdf: Story = {
  args: {
    pages: ['sheets/1305/pages/page-01.webp'],
    pdf: 'sheets/1305/sheet.pdf',
    // Same-source raster — no format toggle in product; keep for PDF-only render demos via PdfOnly
  },
}

export const ImagesAndPdfDistinct: Story = {
  args: {
    imageSets: [
      { id: 'pages', label: 'Pages', paths: ['sheets/1305/pages/page-01.webp'] },
      { id: 'scan', label: 'scan.jpg', paths: ['sheets/1170/sheet.jpg'] },
    ],
    pdfs: [{ id: 'pdf', label: 'sheet.pdf', path: 'sheets/1305/sheet.pdf' }],
    canChooseFormat: true,
  },
}

export const PdfOnly: Story = {
  args: {
    pages: [],
    pdf: 'sheets/1305/sheet.pdf',
  },
}

export const MultipleFiles: Story = {
  args: {
    imageSets: [
      {
        id: 'pages',
        label: 'Pages (2)',
        paths: ['sheets/1305/pages/page-01.webp', 'sheets/4011/pages/page-01.webp'],
      },
      { id: 'scan', label: 'scan.jpg', paths: ['sheets/1170/sheet.jpg'] },
    ],
    pdfs: [
      { id: 'a', label: 'sheet.pdf', path: 'sheets/1305/sheet.pdf' },
      { id: 'b', label: 'alt.pdf', path: 'sheets/1416/sheet.pdf' },
    ],
  },
}
