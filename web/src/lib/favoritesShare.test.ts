import { describe, expect, it } from 'vitest'
import {
  decodeFavoritesSharePayload,
  encodeFavoritesSharePayload,
  favoritesSharePath,
  parseTagIdList,
} from './favoritesShare'

describe('favoritesShare', () => {
  it('parses unique positive integer ids separated by commas or whitespace', () => {
    expect(parseTagIdList('12, 7\n12\t3  0, -2, 4.5, nope')).toEqual([12, 7, 3])
    expect(parseTagIdList('001, 2')).toEqual([1, 2])
  })

  it('round trips ids and a Unicode list name', () => {
    const encoded = encodeFavoritesSharePayload([8, 3, 8, -1, 2.5], '  Noël set  ')
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeFavoritesSharePayload(encoded)).toEqual({
      tagIds: [8, 3],
      name: 'Noël set',
    })
  })

  it('rejects malformed and unsupported payloads', () => {
    expect(decodeFavoritesSharePayload('not-a-payload')).toBeNull()
    const unsupported = btoa(JSON.stringify({ v: 2, ids: [1] }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(decodeFavoritesSharePayload(unsupported)).toBeNull()
  })

  it('builds an import path', () => {
    const path = favoritesSharePath([4, 9], 'Quartet')
    expect(path).toMatch(/^\/favorites\?import=/)
    const raw = new URL(path, 'https://example.test').searchParams.get('import')
    expect(decodeFavoritesSharePayload(raw!)).toEqual({ tagIds: [4, 9], name: 'Quartet' })
  })
})
