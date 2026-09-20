import { describe, expect, it } from 'vitest'
import { composeEmptyClickAction } from './composeClickPolicy'

describe('composeEmptyClickAction', () => {
  it('deselects first when a note is selected', () => {
    expect(composeEmptyClickAction(true)).toBe('deselect')
  })

  it('places when nothing is selected', () => {
    expect(composeEmptyClickAction(false)).toBe('place')
  })

  it('places immediately when forcePlace (Ctrl/Cmd+click)', () => {
    expect(composeEmptyClickAction(true, { forcePlace: true })).toBe('place')
    expect(composeEmptyClickAction(false, { forcePlace: true })).toBe('place')
  })
})
