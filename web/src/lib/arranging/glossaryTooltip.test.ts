/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { glossaryEntries, glossaryTitle, glossaryTitles } from './glossaryTooltip'

describe('glossaryTooltip', () => {
  it('formats term — short for tooltips', () => {
    const t = glossaryTitle('pillar')
    expect(t).toMatch(/^Pillar — /)
    expect(t.length).toBeGreaterThan(20)
  })

  it('joins multiple entries', () => {
    const t = glossaryTitles('pmn', 'smn')
    expect(t).toContain('Strong note')
    expect(t).toContain('Passing note')
    expect(t).toContain('\n\n')
  })

  it('resolves entries in order without dupes', () => {
    const e = glossaryEntries(['pillar', 'pillar', 'pcf', 'melody_pass'])
    expect(e.map((x) => x.id)).toEqual(['pillar', 'pcf', 'melody_pass'])
    expect(e[1]!.term).toMatch(/Primary chord family/i)
    expect(e[2]!.term).toMatch(/Melody pass/i)
  })
})
