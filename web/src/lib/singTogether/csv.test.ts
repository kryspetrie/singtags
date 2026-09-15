import { describe, expect, it } from 'vitest'
import { parseRepertoireCsv, repertoireCsvTemplateText } from './csv'

describe('repertoireCsvTemplateText', () => {
  it('includes all columns and a Heart of My Heart sample row', () => {
    const text = repertoireCsvTemplateText()
    expect(text).toContain('title,arranger,key,voicing,parts,confidence')
    expect(text).toContain('Heart of My Heart')
    expect(text).toContain('SPEBSQSA, Inc')

    const parsed = parseRepertoireCsv(text)
    expect(parsed.errors).toEqual([])
    expect(parsed.skipped).toBe(0)
    expect(parsed.songs).toHaveLength(1)
    const song = parsed.songs[0]!
    expect(song.title).toBe('Heart of My Heart')
    expect(song.arranger).toBe('SPEBSQSA, Inc')
    expect(song.voicing).toBe('TTBB')
    expect(song.parts).toEqual({
      tenor: 5,
      lead: 5,
      bari: 5,
      bass: 5,
    })
  })
})
