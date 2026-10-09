/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeTagRollProject } from '../../lib/tagRoll/normalize'

const SAMPLE = resolve(
  __dirname,
  '../../../public/tag-studio/polecat-pitch-reviews/90001.json',
)

describe('polecat pitch review JSON', () => {
  it('normalizes Irish Rose extract into a playable Tag Studio project', () => {
    const raw = JSON.parse(readFileSync(SAMPLE, 'utf8')) as Record<string, unknown>
    const p = normalizeTagRollProject({
      ...raw,
      createdAt: 1,
      updatedAt: 1,
    })
    expect(p).not.toBeNull()
    expect(p!.id).toBe('seed-polecat-pitch-90001')
    expect(p!.notes.length).toBeGreaterThan(50)
    expect(p!.parts).toHaveLength(4)
    expect(p!.harmonySketch.length).toBeGreaterThan(10)
    expect(p!.tonality).toBe(10) // Bb
  })
})
