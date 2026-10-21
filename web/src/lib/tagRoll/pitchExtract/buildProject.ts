/**
 * Build a Tag Studio project from extracted pitch stacks.
 */
import { allocatePrefixedId } from '../ids'
import { createEmptyTagRollProject } from '../normalize'
import { natureToSketchQuality } from '../harmonySketch'
import {
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  TAG_ROLL_PPQ,
  type HarmonySketchSpan,
  type TagRollNote,
  type TagRollProject,
} from '../types'
import type { PitchStack, VoicePart } from './segmentStacks'

const BPM = 104
const SNAP = 120

function clampMidi(m: number): number {
  let x = m
  while (x < TAG_ROLL_MIDI_MIN) x += 12
  while (x > TAG_ROLL_MIDI_MAX) x -= 12
  return Math.max(TAG_ROLL_MIDI_MIN, Math.min(TAG_ROLL_MIDI_MAX, x))
}

function secToTick(sec: number, bpm = BPM): number {
  return Math.round(sec * (bpm / 60) * TAG_ROLL_PPQ)
}

function quantize(tick: number, snap = SNAP): number {
  return Math.round(tick / snap) * snap
}

export type BuildPitchProjectOpts = {
  title: string
  arranger?: string
  tagId: number
  tonality: number
  mode: 'major' | 'minor'
  preferFlats: boolean
  stacks: readonly PitchStack[]
  subtitle?: string
  sheetNote?: string
}

/** Convert timed pitch stacks → Tag Studio project (fresh part ids). */
export function buildTagRollProjectFromPitchStacks(opts: BuildPitchProjectOpts): TagRollProject {
  const base = createEmptyTagRollProject({
    title: opts.title.trim() || `Tag ${opts.tagId}`,
  })
  const byName = Object.fromEntries(base.parts.map((p) => [p.name.toLowerCase(), p.id])) as Record<
    string,
    string
  >
  const partId = (v: VoicePart): string | undefined => byName[v]

  const notes: TagRollNote[] = []
  const sketch: HarmonySketchSpan[] = []
  let endTick = TAG_ROLL_PPQ * 4

  for (const st of opts.stacks) {
    const t0 = quantize(secToTick(st.t0))
    let t1 = quantize(secToTick(st.t1))
    if (t1 <= t0) t1 = t0 + SNAP
    const dur = Math.max(SNAP, t1 - t0)
    for (const voice of ['tenor', 'lead', 'bari', 'bass'] as const) {
      const m = st.midi[voice]
      if (m == null) continue
      const pid = partId(voice)
      if (!pid) continue
      notes.push({
        id: allocatePrefixedId('trn'),
        partId: pid,
        midi: clampMidi(m),
        startTick: t0,
        durationTicks: dur,
        ...(voice === 'lead' ? { role: 'pmn' as const } : {}),
      })
    }
    if (st.natureId !== 'unknown' && st.confidence >= 0.35) {
      sketch.push({
        id: allocatePrefixedId('ths'),
        startTick: t0,
        endTick: t0 + dur,
        rootPc: st.rootPc,
        quality: natureToSketchQuality(st.natureId === 'halfdim' ? 'half-dim' : st.natureId),
        source: 'detect',
        locked: false,
        pillar: false,
      })
    }
    endTick = Math.max(endTick, t0 + dur)
  }

  const leadId = partId('lead') ?? base.parts[1]?.id ?? base.parts[0]!.id
  return {
    ...base,
    title: opts.title.trim() || base.title,
    subtitle: opts.subtitle ?? `Pitch import · tag ${opts.tagId}`,
    composer: 'Learning-track pitch extract',
    arranger: opts.arranger ?? '',
    sheetNote:
      opts.sheetNote ??
      'Imported from learning-track audio (YIN). Octaves and chord labels are best-effort — edit freely.',
    bpm: BPM,
    snapTicks: SNAP,
    lengthTicks: quantize(endTick + TAG_ROLL_PPQ * 4, TAG_ROLL_PPQ),
    tempoMarkers: [{ id: allocatePrefixedId('trt'), tick: 0, bpm: BPM }],
    keyMarkers: [
      {
        id: allocatePrefixedId('trk'),
        tick: 0,
        tonality: opts.tonality,
        tonalityMode: opts.mode,
        preferFlats: opts.preferFlats,
      },
    ],
    tonality: opts.tonality,
    tonalityMode: opts.mode,
    preferFlats: opts.preferFlats,
    notes,
    harmonySketch: sketch,
    view: {
      ...base.view,
      cellW: 22,
      activePartId: leadId,
      melodyPartId: leadId,
      showNoteLyrics: false,
      sheetShowLyrics: false,
      sheetShowSketchChords: true,
      sheetShowDetectedChords: true,
    },
  }
}
