/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { Factory } from 'vexflow'
import { TAG_ROLL_PPQ } from '../types'
import type { SheetRhythmEvent } from './rhythmLayout'
import {
  applyOpposingVoiceOffsets,
  NOTE_COLLISION_NUDGE_PX,
} from './sheetNoteCollision'
import { mapTicksToDuration } from './durationMap'

function evt(
  partial: Partial<SheetRhythmEvent> & Pick<SheetRhythmEvent, 'concertMidi' | 'startTick'>,
): SheetRhythmEvent {
  const dur = mapTicksToDuration(TAG_ROLL_PPQ)
  return {
    id: partial.id ?? 'e',
    staffId: 'upper',
    partId: 'p',
    color: '#000',
    voice: 1,
    stemUp: true,
    role: 'lead',
    durationTicks: TAG_ROLL_PPQ,
    tieStart: false,
    tieStop: false,
    duration: dur,
    beamGroupId: null,
    ...partial,
  }
}

describe('sheetNoteCollision', () => {
  it('offsets unison heads on opposing voices', () => {
    const host = document.createElement('div')
    host.id = 'col-test'
    document.body.appendChild(host)
    const factory = new Factory({
      renderer: { elementId: host.id, width: 200, height: 120 },
    })
    const n1 = factory.StaveNote({ keys: ['c/5'], duration: 'q' })
    const n2 = factory.StaveNote({ keys: ['c/5'], duration: 'q' })
    applyOpposingVoiceOffsets({
      v1Events: [evt({ concertMidi: 60, startTick: 0, voice: 1 })],
      v1Notes: [n1],
      v2Events: [evt({ concertMidi: 60, startTick: 0, voice: 2, stemUp: false })],
      v2Notes: [n2],
      clefFamily: 'ttbb',
      staffKind: 'upper',
      preferFlats: false,
    })
    expect(n1.getXShift()).toBe(-NOTE_COLLISION_NUDGE_PX)
    expect(n2.getXShift()).toBe(NOTE_COLLISION_NUDGE_PX)
    host.remove()
  })

  it('does not offset a fifth apart', () => {
    const host = document.createElement('div')
    host.id = 'col-test-5'
    document.body.appendChild(host)
    const factory = new Factory({
      renderer: { elementId: host.id, width: 200, height: 120 },
    })
    const n1 = factory.StaveNote({ keys: ['g/5'], duration: 'q' })
    const n2 = factory.StaveNote({ keys: ['c/5'], duration: 'q' })
    applyOpposingVoiceOffsets({
      v1Events: [evt({ concertMidi: 67, startTick: 0 })],
      v1Notes: [n1],
      v2Events: [evt({ concertMidi: 60, startTick: 0, voice: 2 })],
      v2Notes: [n2],
      clefFamily: 'ttbb',
      staffKind: 'upper',
      preferFlats: false,
    })
    expect(n1.getXShift()).toBe(0)
    expect(n2.getXShift()).toBe(0)
    host.remove()
  })
})
