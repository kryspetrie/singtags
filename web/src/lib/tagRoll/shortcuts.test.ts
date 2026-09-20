import { describe, expect, it } from 'vitest'
import { tagRollTip, tipByShortcutId } from './shortcuts'

describe('tagRollTip', () => {
  it('appends shortcut in parentheses', () => {
    expect(tagRollTip('Undo', 'Ctrl+Z')).toBe('Undo (Ctrl+Z)')
    expect(tagRollTip('Mixer')).toBe('Mixer')
  })

  it('does not double-append', () => {
    expect(tagRollTip('Undo (Ctrl+Z)', 'Ctrl+Z')).toBe('Undo (Ctrl+Z)')
  })

  it('resolves catalog ids', () => {
    expect(tipByShortcutId('hear-stack')).toBe('Hear stack at cursor (H)')
    expect(tipByShortcutId('play-pause', 'Pause')).toBe('Pause (Space)')
  })
})
