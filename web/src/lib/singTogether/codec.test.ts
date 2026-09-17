import { describe, expect, it } from 'vitest'
import { fitQrPayload, QR_MAX_BYTES, byteCapacity } from './capacity'
import {
  capacityInfo,
  decodeProfileBytes,
  encodeProfileBytes,
  encodeProfileQr,
  packProfileBody,
  unpackProfileBody,
} from './codec'
import { parseRepertoireCsv } from './csv'
import { songMatchKey } from './normalize'
import type { RepertoireProfile } from './types'

function sampleProfile(nSongs = 2): RepertoireProfile {
  return {
    displayName: 'Alex',
    updatedAt: 1,
    collections: [],
    songs: Array.from({ length: nSongs }, (_, i) => ({
      id: `id-${i}`,
      title: `Song ${i}`,
      arranger: `Arranger ${i}`,
      key: i % 2 ? 'Bb' : undefined,
      voicing: i % 3 === 0 ? 'SATB' : 'TTBB',
      parts:
        i % 3 === 0
          ? { soprano: 3 as const, bass: 4 as const }
          : { lead: 5 as const, bass: 2 as const },
    })),
  }
}

describe('normalize / match key', () => {
  it('casefolds and collapses whitespace', () => {
    expect(songMatchKey('  Hello   World ', 'Smith', 'TTBB')).toBe(
      songMatchKey('hello world', 'smith', 'TTBB'),
    )
  })
})

describe('codec', () => {
  it('round-trips packed body', () => {
    const p = sampleProfile(3)
    const body = packProfileBody(p)
    const back = unpackProfileBody(body)
    expect(back.displayName).toBe('Alex')
    expect(back.songs).toHaveLength(3)
    expect(back.songs[0]!.title).toBe('Song 0')
    expect(back.songs[0]!.parts.soprano).toBe(3)
  })

  it('round-trips deflated STS1 bytes', () => {
    const p = sampleProfile(5)
    const bytes = encodeProfileBytes(p)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('STS1')
    const back = decodeProfileBytes(bytes)
    expect(back.songs.map((s) => s.title)).toEqual(p.songs.map((s) => s.title))
  })

  it('fits small payloads and reports capacity', () => {
    const info = capacityInfo(sampleProfile(1))
    expect(info.fit).not.toBeNull()
    expect(info.usedBytes).toBeGreaterThan(4)
    expect(info.usedBytes).toBeLessThan(QR_MAX_BYTES)
  })

  it('encodeProfileQr returns a data URL', async () => {
    const { dataUrl, fit } = await encodeProfileQr(sampleProfile(1), 128)
    expect(dataUrl.startsWith('data:image/png')).toBe(true)
    expect(fit.version).toBeGreaterThanOrEqual(1)
  })

  it('round-trips display names with spaces and special characters', () => {
    const p: RepertoireProfile = {
      displayName: 'José & Mary-Lou',
      updatedAt: 1,
      collections: [],
      songs: [{ id: '1', title: 'Hello', arranger: '', parts: {} }],
    }
    const back = decodeProfileBytes(encodeProfileBytes(p))
    expect(back.displayName).toBe('José & Mary-Lou')
  })

  it('round-trips alternate titles in STS1 body v2', () => {
    const p: RepertoireProfile = {
      displayName: 'Alex',
      updatedAt: 1,
      collections: [],
      songs: [
        {
          id: '1',
          title: 'From the First Hello to the Last Goodbye',
          altTitles: ['First Hello'],
          arranger: '',
          parts: {},
        },
      ],
    }
    const back = decodeProfileBytes(encodeProfileBytes(p))
    expect(back.songs[0]!.title).toBe('From the First Hello to the Last Goodbye')
    expect(back.songs[0]!.altTitles).toEqual(['First Hello'])
  })
})

describe('capacity table', () => {
  it('v40 L is 2953', () => {
    expect(byteCapacity(40, 'L')).toBe(2953)
    expect(fitQrPayload(2953)?.version).toBe(40)
    expect(fitQrPayload(2954)).toBeNull()
  })

  it('prefers M when it fits', () => {
    const fit = fitQrPayload(14)
    expect(fit?.ecc).toBe('M')
    expect(fit?.version).toBe(1)
  })

  it('uses byte-mode M capacities (not raw data codewords)', () => {
    expect(byteCapacity(3, 'M')).toBe(42)
    expect(byteCapacity(4, 'M')).toBe(62)
    const fit = fitQrPayload(43)
    expect(fit?.version).toBe(4)
    expect(fit?.ecc).toBe('M')
  })

  it('encodeProfileQr accepts payloads at fitted M capacity', async () => {
    // Build a profile whose compressed STS1 size sits near a former false M boundary.
    const titles = Array.from({ length: 80 }, (_, i) => `Song Title Number ${i}`)
    const profile = {
      displayName: 'Mary Lou',
      collections: [] as const,
      songs: titles.map((title, i) => ({
        id: `s${i}`,
        title,
        arranger: '',
        parts: {},
      })),
      updatedAt: 1,
    }
    for (const name of ['', 'A', 'Alex', 'Mary Lou', 'José', 'A&B']) {
      const { dataUrl, fit } = await encodeProfileQr({ ...profile, displayName: name }, 128)
      expect(dataUrl.startsWith('data:image/')).toBe(true)
      expect(fit.version).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('csv', () => {
  it('parses header + rows', () => {
    const csv = [
      'title,arranger,key,voicing,parts,confidence',
      'Hello,Jones,Ab,TTBB,lead;bass,4',
      'Goodnight,Smith,,SATB,soprano:5;alto:2,',
    ].join('\n')
    const r = parseRepertoireCsv(csv)
    expect(r.songs).toHaveLength(2)
    expect(r.songs[0]!.parts.lead).toBe(4)
    expect(r.songs[0]!.parts.bass).toBe(4)
    expect(r.songs[1]!.voicing).toBe('SATB')
    expect(r.songs[1]!.parts.soprano).toBe(5)
    expect(r.songs[1]!.parts.alto).toBe(2)
  })

  it('imports title-only rows as stubs with empty parts', () => {
    const r = parseRepertoireCsv('title,arranger,voicing,parts\nOnlyTitle,A,TTBB,\n')
    expect(r.songs).toHaveLength(1)
    expect(r.skipped).toBe(0)
    expect(r.songs[0]!.title).toBe('OnlyTitle')
    expect(r.songs[0]!.parts).toEqual({})
  })

  it('allows blank voicing', () => {
    const r = parseRepertoireCsv('title,arranger,voicing,parts,confidence\nHi,A,,lead,3\n')
    expect(r.songs).toHaveLength(1)
    expect(r.songs[0]!.voicing).toBeUndefined()
  })
})
