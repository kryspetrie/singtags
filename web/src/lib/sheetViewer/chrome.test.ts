/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  exitStaysOnDetailsPage,
  fitButtonLabel,
  fitButtonTitle,
  fmtTime,
  pageModeButtonLabel,
  pageModeButtonTitle,
  showDetailsPageButton,
  showPlayControl,
} from './chrome'

describe('sheetViewer/chrome', () => {
  it('exitStaysOnDetailsPage treats empty and tag/lib page as on-details', () => {
    expect(exitStaysOnDetailsPage('')).toBe(true)
    expect(exitStaysOnDetailsPage('  Tag Page  ')).toBe(true)
    expect(exitStaysOnDetailsPage('Lib Page')).toBe(true)
    expect(exitStaysOnDetailsPage('Browse')).toBe(false)
  })

  it('showDetailsPageButton inverts exitStaysOnDetailsPage', () => {
    expect(showDetailsPageButton('Browse')).toBe(true)
    expect(showDetailsPageButton('Tag Page')).toBe(false)
  })

  it('showPlayControl requires singControls and playback state', () => {
    expect(showPlayControl(true, false, false, false)).toBe(false)
    expect(showPlayControl(true, true, false, false)).toBe(true)
    expect(showPlayControl(false, true, true, false)).toBe(false)
  })

  it('fmtTime formats seconds', () => {
    expect(fmtTime(65)).toBe('1:05')
    expect(fmtTime(-1)).toBe('0:00')
    expect(fmtTime(Number.NaN)).toBe('0:00')
  })

  it('fit and page mode labels', () => {
    expect(fitButtonLabel('width')).toBe('Fit width')
    expect(fitButtonLabel('all')).toBe('Fit all')
    expect(fitButtonTitle('width', true)).toContain('fit all looks the same')
    expect(pageModeButtonLabel('scroll')).toBe('Scroll')
    expect(pageModeButtonTitle('paging')).toContain('continuous scroll')
  })
})
