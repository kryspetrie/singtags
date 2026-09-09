import { describe, expect, it } from 'vitest'
import { canShareFiles, isShareTargetQuery } from './osShareTransfer'

describe('osShareTransfer', () => {
  it('detects share-target query forms', () => {
    expect(isShareTargetQuery({ 'share-target': '1' })).toBe(true)
    expect(isShareTargetQuery({ 'share-target': null })).toBe(true)
    expect(isShareTargetQuery({ 'share-target': '' })).toBe(true)
    expect(isShareTargetQuery({ shareTarget: '1' })).toBe(true)
    expect(isShareTargetQuery({})).toBe(false)
    expect(isShareTargetQuery({ 'share-target': '0' })).toBe(false)
  })

  it('reports canShareFiles false without navigator.share', () => {
    const file = new File([new Uint8Array([1])], 'a.bin')
    expect(canShareFiles(file)).toBe(false)
  })
})
