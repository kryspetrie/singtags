/**
 * Checked-in honesty fixture for Tag Studio (editor / bounce / MIDI parity).
 * Matches docs/plans/tag-studio-hardening.md fixture section.
 */
import { createEmptyTagRollProject } from './normalize'
import { upsertRampEndMarker } from './tempoMap'
import type { TagRollProject } from './types'
import { TAG_ROLL_PPQ } from './types'

/** Build the adversarial A/B fixture project. */
export function createTagStudioHonestyFixture(): TagRollProject {
  const p = createEmptyTagRollProject({ title: 'Honesty fixture' })
  p.bpm = 104
  p.timeSignature = { numerator: 4, denominator: 4 }
  p.tempoMarkers = [{ id: 't0', tick: 0, bpm: 104 }]
  const bar = TAG_ROLL_PPQ * 4
  p.lengthTicks = bar * 4
  p.tempoMarkers.push({ id: 't-bar2', tick: bar, bpm: 120 })

  const lead = p.parts.find((x) => x.name === 'Lead')!
  const bari = p.parts.find((x) => x.name === 'Bari')!

  // Lead quarters measures 1–4
  p.notes = []
  for (let i = 0; i < 16; i++) {
    p.notes.push({
      id: `lead-q${i}`,
      partId: lead.id,
      midi: 60 + (i % 3),
      startTick: i * TAG_ROLL_PPQ,
      durationTicks: TAG_ROLL_PPQ,
    })
  }

  // Bari independent eighths under bar 2
  for (let i = 0; i < 8; i++) {
    p.notes.push({
      id: `bari-e${i}`,
      partId: bari.id,
      midi: 55,
      startTick: bar + i * (TAG_ROLL_PPQ / 2),
      durationTicks: TAG_ROLL_PPQ / 2,
    })
  }

  // Rit bar 3 (120→90) with sticky end
  const rit = {
    id: 'rit-bar3',
    kind: 'rit' as const,
    startTick: bar * 2,
    endTick: bar * 3,
    startBpm: 120,
    endBpm: 90,
  }
  p.expressions = [
    rit,
    {
      id: 'ferm-bar4',
      kind: 'fermata',
      tick: bar * 3,
      holdTicks: TAG_ROLL_PPQ,
      gapTicks: TAG_ROLL_PPQ / 2,
    },
  ]
  p.tempoMarkers = upsertRampEndMarker(p.tempoMarkers, rit)

  // Long lead note spanning the bar-4 fermata (honesty probe)
  p.notes.push({
    id: 'lead-span-ferm',
    partId: lead.id,
    midi: 67,
    startTick: bar * 3 - TAG_ROLL_PPQ,
    durationTicks: TAG_ROLL_PPQ * 3,
  })

  return p
}
