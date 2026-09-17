import { describe, expect, it } from 'vitest'
import { parseRepertoireCsv, repertoireCsvTemplateText } from './csv'

describe('repertoireCsvTemplateText', () => {
  it('includes all columns and a Heart of My Heart sample row', () => {
    const text = repertoireCsvTemplateText()
    expect(text).toContain('title,alt_titles,arranger,key,voicing,parts,confidence,tag')
    expect(text).toContain('Heart of My Heart')
    expect(text).toContain('SPEBSQSA, Inc')

    const parsed = parseRepertoireCsv(text)
    expect(parsed.errors).toEqual([])
    expect(parsed.skipped).toBe(0)
    expect(parsed.songs).toHaveLength(1)
    const song = parsed.songs[0]!
    expect(song.title).toBe('A Story of a Rose (Heart of My Heart)')
    expect(song.altTitles).toEqual(['Heart of My Heart'])
    expect(song.arranger).toBe('SPEBSQSA, Inc')
    expect(song.voicing).toBe('TTBB')
    expect(song.isTag).toBe(true)
    expect(song.parts).toEqual({
      tenor: 5,
      lead: 5,
      bari: 5,
      bass: 5,
    })
  })
})

describe('parseRepertoireCsv tag column', () => {
  it.each(['X', 'x', 'true', 'TRUE', 'yes', 'Yes'])(
    'treats %s as affirmative for tag',
    (val) => {
      const r = parseRepertoireCsv(`title,tag\nHello,${val}\n`)
      expect(r.songs).toHaveLength(1)
      expect(r.songs[0]!.isTag).toBe(true)
    },
  )

  it('leaves isTag unset for blank / no / false', () => {
    const r = parseRepertoireCsv('title,tag\nA,\nB,no\nC,false\n')
    expect(r.songs.map((s) => s.isTag)).toEqual([undefined, undefined, undefined])
  })

  it('accepts is_tag header alias', () => {
    const r = parseRepertoireCsv('title,is_tag\nTagged,yes\n')
    expect(r.songs[0]!.isTag).toBe(true)
  })
})

describe('parseRepertoireCsv title stubs', () => {
  it('imports title-only rows as stubs with empty parts', () => {
    const r = parseRepertoireCsv('title,arranger,voicing,parts\nOnlyTitle,A,TTBB,\n')
    expect(r.errors).toEqual([])
    expect(r.skipped).toBe(0)
    expect(r.songs).toHaveLength(1)
    expect(r.songs[0]!.title).toBe('OnlyTitle')
    expect(r.songs[0]!.arranger).toBe('A')
    expect(r.songs[0]!.voicing).toBe('TTBB')
    expect(r.songs[0]!.parts).toEqual({})
  })

  it('imports aka / alt_titles column', () => {
    const r = parseRepertoireCsv(
      'title,aka,arranger,parts\nFrom the First Hello to the Last Goodbye,First Hello,,\n',
    )
    expect(r.songs).toHaveLength(1)
    expect(r.songs[0]!.altTitles).toEqual(['First Hello'])
  })

  it('still skips rows without a title', () => {
    const r = parseRepertoireCsv('title,arranger,parts\n,A,lead\n')
    expect(r.songs).toHaveLength(0)
    expect(r.skipped).toBe(1)
  })

  it('maps cells by custom column order when there is no header', () => {
    const r = parseRepertoireCsv('Hello Mary Lou,Joe Arranger\nOther Song,Sam', {
      columns: ['title', 'arranger'],
    })
    expect(r.errors).toEqual([])
    expect(r.songs).toHaveLength(2)
    expect(r.songs[0]!.title).toBe('Hello Mary Lou')
    expect(r.songs[0]!.arranger).toBe('Joe Arranger')
    expect(r.songs[1]!.title).toBe('Other Song')
    expect(r.songs[1]!.arranger).toBe('Sam')
  })

  it('supports title,parts subset order', () => {
    const r = parseRepertoireCsv('Story of a Rose,lead;bass', {
      columns: ['title', 'parts'],
    })
    expect(r.songs).toHaveLength(1)
    expect(r.songs[0]!.title).toBe('Story of a Rose')
    expect(r.songs[0]!.parts).toEqual({ lead: 0, bass: 0 })
  })

  it('rejects column order without title', () => {
    const r = parseRepertoireCsv('x', { columns: ['arranger'] })
    expect(r.songs).toHaveLength(0)
    expect(r.errors[0]).toMatch(/title/i)
  })
})
