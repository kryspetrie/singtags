/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  natureToSketchQuality,
  sketchPatchFromMelodyNote,
  sketchSpanAtTick,
  upsertSketchSpan,
} from '../harmonySketch'

describe('harmonize sketch helpers', () => {
  it('maps dim7 and add9 into sketch qualities', () => {
    expect(natureToSketchQuality('dim7')).toBe('dim7')
    expect(natureToSketchQuality('add9')).toBe('add9')
    expect(natureToSketchQuality('seventh')).toBe('seventh')
  })

  it('builds a locked sketch patch from a melody note window', () => {
    const patch = sketchPatchFromMelodyNote({
      melodyStartTick: 480,
      melodyDurationTicks: 240,
      rootPc: 7,
      quality: 'seventh',
    })
    expect(patch).toMatchObject({
      startTick: 480,
      endTick: 720,
      rootPc: 7,
      quality: 'seventh',
      source: 'user',
      locked: true,
    })
  })

  it('upserts sketch covering a melody tick for preselect', () => {
    const sketch = upsertSketchSpan([], {
      ...sketchPatchFromMelodyNote({
        melodyStartTick: 0,
        melodyDurationTicks: 480,
        rootPc: 0,
        quality: 'major',
      }),
    })
    expect(sketchSpanAtTick(sketch, 100)?.quality).toBe('major')
    expect(sketchSpanAtTick(sketch, 500)).toBeNull()
  })
})
