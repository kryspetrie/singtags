/**
 * @vitest-environment node
 * Shim: full suite lives in domain/arranging/sketchHearVoicing.test.ts
 */
import { describe, expect, it } from 'vitest'
import { sketchHearMidis } from './sketchHearVoicing'

describe('lib/tagRoll sketchHearVoicing re-export', () => {
  it('forwards to domain voicing', () => {
    const midis = sketchHearMidis({ rootPc: 0, quality: 'major', leadMidi: 60 })
    expect(midis).toHaveLength(4)
  })
})
