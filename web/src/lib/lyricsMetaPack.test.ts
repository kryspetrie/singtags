/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { META_WRAP_TOP_EPS_PX, metaDetailsWrapToSecondLine } from './lyricsMetaPack'

function chip(top: number): HTMLElement {
  const el = document.createElement('span')
  el.className = 'meta-item'
  Object.defineProperty(el, 'offsetTop', { configurable: true, get: () => top })
  return el
}

describe('metaDetailsWrapToSecondLine', () => {
  it('returns false without a root or enough chips', () => {
    expect(metaDetailsWrapToSecondLine(null)).toBe(false)
    const root = document.createElement('div')
    root.appendChild(chip(0))
    expect(metaDetailsWrapToSecondLine(root)).toBe(false)
  })

  it('returns false when chips share one flex line', () => {
    const root = document.createElement('div')
    root.appendChild(chip(0))
    root.appendChild(chip(2))
    root.appendChild(chip(4))
    expect(metaDetailsWrapToSecondLine(root)).toBe(false)
  })

  it('returns true when chips span a second line', () => {
    const root = document.createElement('div')
    root.appendChild(chip(0))
    root.appendChild(chip(2))
    root.appendChild(chip(0 + META_WRAP_TOP_EPS_PX))
    expect(metaDetailsWrapToSecondLine(root)).toBe(true)
  })
})
