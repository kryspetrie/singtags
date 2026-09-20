import { describe, expect, it } from 'vitest'
import {
  defaultHotkeyForPartName,
  displayHotkeyForPart,
  findPartByHotkey,
  migratePartHotkey,
  normalizePartHotkey,
} from './partHotkeys'

describe('partHotkeys', () => {
  it('defaults TLRB for tenor lead bari bass', () => {
    expect(defaultHotkeyForPartName('Tenor')).toBe('t')
    expect(defaultHotkeyForPartName('Lead')).toBe('l')
    expect(defaultHotkeyForPartName('Bari')).toBe('r')
    expect(defaultHotkeyForPartName('Bass')).toBe('b')
    expect(normalizePartHotkey('Y')).toBeUndefined()
    expect(normalizePartHotkey('s')).toBeUndefined()
    expect(normalizePartHotkey('L')).toBe('l')
  })

  it('migrates legacy D/B/A defaults onto TLRB', () => {
    expect(migratePartHotkey('Lead', 'd')).toBe('l')
    expect(migratePartHotkey('Bari', 'b')).toBe('r')
    expect(migratePartHotkey('Bass', 'a')).toBe('b')
    expect(migratePartHotkey('Lead', 'q')).toBe('q')
  })

  it('finds parts by hotkey with explicit override winning', () => {
    const parts = [
      { id: '1', name: 'Tenor', color: '#000', midiGroup: 'upper' as const },
      { id: '2', name: 'Lead', color: '#000', midiGroup: 'upper' as const },
      { id: '3', name: 'Solo', color: '#000', midiGroup: 'solo' as const, hotkey: 'q' },
    ]
    expect(findPartByHotkey(parts, 't')?.id).toBe('1')
    expect(findPartByHotkey(parts, 'l')?.id).toBe('2')
    expect(findPartByHotkey(parts, 'q')?.id).toBe('3')
    expect(displayHotkeyForPart(parts[2]!)).toBe('Q')
  })
})
