/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  UI_SCALE_DEFAULT,
  applyUiScale,
  defaultUiScaleForViewport,
  normalizeUiScalePercent,
  readStoredUiScale,
  resolveInitialUiScale,
  writeStoredUiScale,
  UI_SCALE_STORAGE_KEY,
} from './uiScale'

describe('uiScale', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.zoom = ''
    document.documentElement.style.removeProperty('--ui-scale')
    document.documentElement.style.removeProperty('--ui-layout-base')
    delete document.documentElement.dataset.uiScale
  })

  it('normalizes to 5% steps and clamps 70–130', () => {
    expect(normalizeUiScalePercent(93)).toBe(95)
    expect(normalizeUiScalePercent(97)).toBe(95)
    expect(normalizeUiScalePercent(98)).toBe(100)
    expect(normalizeUiScalePercent(50)).toBe(70)
    expect(normalizeUiScalePercent(200)).toBe(130)
    expect(normalizeUiScalePercent('85')).toBe(85)
  })

  it('defaults user scale to 100%', () => {
    expect(defaultUiScaleForViewport()).toBe(UI_SCALE_DEFAULT)
    expect(resolveInitialUiScale()).toBe(100)
  })

  it('persists and resolves initial user scale', () => {
    expect(readStoredUiScale()).toBeNull()
    writeStoredUiScale(80)
    expect(localStorage.getItem(UI_SCALE_STORAGE_KEY)).toBe('80')
    expect(resolveInitialUiScale()).toBe(80)
  })

  it('applies numeric zoom from Display size only', () => {
    applyUiScale(100)
    expect(document.documentElement.style.zoom).toBe('1')
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1')
    expect(document.documentElement.dataset.uiScale).toBe('100')

    applyUiScale(90)
    expect(document.documentElement.style.zoom).toBe('0.9')
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('0.9')
    expect(document.documentElement.dataset.uiScale).toBe('90')
  })

  it('migrates leftover 95% preference to default 100%', () => {
    localStorage.setItem(UI_SCALE_STORAGE_KEY, '95')
    expect(resolveInitialUiScale()).toBe(100)
    expect(localStorage.getItem(UI_SCALE_STORAGE_KEY)).toBeNull()
  })
})
