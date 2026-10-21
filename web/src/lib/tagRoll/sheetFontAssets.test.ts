import { afterEach, describe, expect, it } from 'vitest'
import { Font } from 'vexflow'
import {
  configureSheetFontHost,
  publicAssetUrl,
  resetSheetFontHostForTests,
  sheetFontFileUrl,
  sheetFontHostUrl,
  sheetFontOtfRelPath,
  sheetFontOtfUrl,
} from './sheetFontAssets'

afterEach(() => {
  resetSheetFontHostForTests()
})

describe('sheetFontAssets', () => {
  it('builds public URLs under the Vite base', () => {
    expect(publicAssetUrl('tag-studio/sheet-fonts/bravura/bravura.woff2')).toMatch(
      /tag-studio\/sheet-fonts\/bravura\/bravura\.woff2$/,
    )
    expect(sheetFontHostUrl()).toMatch(/tag-studio\/sheet-fonts\/$/)
  })

  it('maps families to local OTF siblings of Font.FILES', () => {
    expect(sheetFontOtfRelPath('Bravura')).toBe('bravura/bravura.otf')
    expect(sheetFontOtfRelPath('Academico')).toBe('academico/academico.otf')
    expect(sheetFontOtfUrl('Bravura')).toMatch(/bravura\/bravura\.otf$/)
    expect(sheetFontFileUrl('bravura/bravura.woff2')).toMatch(/bravura\/bravura\.woff2$/)
  })

  it('points VexFlow Font.HOST_URL at bundled fonts', () => {
    configureSheetFontHost()
    expect(Font.HOST_URL).toBe(sheetFontHostUrl())
    expect(Font.getURLForFont('Bravura')).toBe(sheetFontFileUrl('bravura/bravura.woff2'))
  })
})
