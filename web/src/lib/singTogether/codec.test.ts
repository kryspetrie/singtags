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

  it('skips rows without parts', () => {
    const r = parseRepertoireCsv('title,arranger,voicing,parts\nOnlyTitle,A,TTBB,\n')
    expect(r.songs).toHaveLength(0)
    expect(r.skipped).toBe(1)
  })

  it('allows blank voicing', () => {
    const r = parseRepertoireCsv('title,arranger,voicing,parts,confidence\nHi,A,,lead,3\n')
    expect(r.songs).toHaveLength(1)
    expect(r.songs[0]!.voicing).toBeUndefined()
  })
})
