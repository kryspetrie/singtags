/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  isLocalEntryEditQuery,
  parseImportQueue,
  localEntryEditQuery,
} from './localDocOpen'

describe('localDocOpen', () => {
  it('parses edit and import queue queries', () => {
    expect(isLocalEntryEditQuery({ edit: '1' })).toBe(true)
    expect(isLocalEntryEditQuery({})).toBe(false)
    expect(parseImportQueue({ importQueue: 'a,b,a' })).toEqual(['a', 'b'])
    expect(localEntryEditQuery({ edit: true, importQueue: ['x', 'y'] })).toEqual({
      edit: '1',
      importQueue: 'x,y',
    })
  })
})
