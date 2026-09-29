import { describe, expect, it } from 'vitest'
import { createCoachStackHear, stackPreviewFromMidi } from './CoachStackHear'
import type { AudioPreview, StackPreview } from '../../ports/AudioPreview'
import { pickFillCandidate, softChordAtTick } from './CoachFillEmpty'
import type { SoftSuggestContext } from './suggestHomeRoot'
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'

function fakePreview(): AudioPreview & { log: string[] } {
  const log: string[] = []
  return {
    log,
    async playStack(stack: StackPreview, durationMs?: number) {
      log.push(`play:${stack.midi.bass}:${durationMs ?? ''}`)
    },
    async startStack(stack: StackPreview) {
      log.push(`start:${stack.midi.bass}`)
    },
    stopStack() {
      log.push('stop')
    },
    dispose() {
      log.push('dispose')
    },
  }
}

describe('CoachStackHear', () => {
  it('maps midi to StackPreview', () => {
    expect(stackPreviewFromMidi({ bass: 48, bari: 55, lead: 60, tenor: 67 }).midi.tenor).toBe(67)
  })

  it('playTimed and hold use AudioPreview', async () => {
    const preview = fakePreview()
    const hear = createCoachStackHear({ getPreview: () => preview })
    await hear.playTimed({ bass: 48, bari: 55, lead: 60, tenor: 67 }, 500)
    await hear.holdStart({ bass: 50, bari: 55, lead: 60, tenor: 67 })
    hear.holdStop()
    expect(preview.log).toEqual(['play:48:500', 'start:50', 'stop'])
  })

  it('skips when transport is playing', async () => {
    const preview = fakePreview()
    const hear = createCoachStackHear({
      getPreview: () => preview,
      isTransportPlaying: () => true,
    })
    await hear.playTimed({ bass: 48, bari: 55, lead: 60, tenor: 67 })
    expect(preview.log).toEqual([])
  })
})

describe('CoachFillEmpty helpers', () => {
  const soft: SoftSuggestContext = {
    sketchSpans: [
      { startTick: 0, endTick: 480, rootPc: 0, locked: true, natureId: 'major' },
      { startTick: 480, endTick: 960, rootPc: 7, locked: false, natureId: 'seventh' },
    ],
    detectedSpans: [{ startTick: 960, endTick: 1440, rootPc: 5, natureId: 'major' }],
  }

  it('softChordAtTick prefers locked Sketch then Detected', () => {
    expect(softChordAtTick(soft, 100)).toEqual({ rootPc: 0, natureId: 'major' })
    expect(softChordAtTick(soft, 500)).toEqual({ rootPc: 7, natureId: 'seventh' })
    expect(softChordAtTick(soft, 1000)).toEqual({ rootPc: 5, natureId: 'major' })
  })

  it('pickFillCandidate matches soft nature then root', () => {
    const cands = [
      { rootPc: 0, natureId: 'seventh', midi: { bass: 1, bari: 2, lead: 3, tenor: 4 } },
      { rootPc: 0, natureId: 'major', midi: { bass: 1, bari: 2, lead: 3, tenor: 4 } },
      { rootPc: 7, natureId: 'seventh', midi: { bass: 1, bari: 2, lead: 3, tenor: 4 } },
    ] as HarmonizeCandidate[]
    expect(pickFillCandidate(cands, { rootPc: 0, natureId: 'major' })?.natureId).toBe('major')
    expect(pickFillCandidate(cands, { rootPc: 7 })?.rootPc).toBe(7)
    expect(pickFillCandidate([], null)).toBeNull()
  })
})
