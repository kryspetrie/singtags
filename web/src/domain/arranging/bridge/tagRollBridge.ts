/**
 * Bidirectional bridge: ArrangementProject ↔ TagRollProject (portable subset).
 * Schemas stay separate; no pillar/wizard stuffing into TagRoll.
 */
import type { ArrangementProject, ChordStack, MelodyEvent } from '../types'
import { ARRANGEMENT_SCHEMA, ARRANGING_PPQ, createEmptyArrangement } from '../types'
import { collectMomentBoundaries } from '../harmonicMoments'
import {
  TAG_ROLL_DEFAULT_BPM,
  TAG_ROLL_DEFAULT_LENGTH_TICKS,
  TAG_ROLL_DEFAULT_SNAP_TICKS,
  TAG_ROLL_PPQ,
  TAG_ROLL_SCHEMA,
  TTBB_PART_DEFS,
  type TagRollNote,
  type TagRollPart,
  type TagRollProject,
} from './tagRollTypes'

export type BridgeIdGen = { next(prefix: string): string }

const fallbackId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`

function ids(idGen?: BridgeIdGen): BridgeIdGen {
  return idGen ?? { next: fallbackId }
}

function ttbbParts(idGen: BridgeIdGen): {
  parts: TagRollPart[]
  byRole: Record<'Tenor' | 'Lead' | 'Bari' | 'Bass', TagRollPart>
} {
  const parts: TagRollPart[] = TTBB_PART_DEFS.map((d) => ({
    ...d,
    id: idGen.next('trp'),
  }))
  const byRole = {
    Tenor: parts.find((p) => p.name === 'Tenor')!,
    Lead: parts.find((p) => p.name === 'Lead')!,
    Bari: parts.find((p) => p.name === 'Bari')!,
    Bass: parts.find((p) => p.name === 'Bass')!,
  }
  return { parts, byRole }
}

function projectLengthTicks(project: ArrangementProject): number {
  let max = TAG_ROLL_DEFAULT_LENGTH_TICKS
  for (const n of project.melody) {
    max = Math.max(max, n.startTick + n.durationTicks)
  }
  for (const s of project.stacks) {
    max = Math.max(max, s.startTick + s.durationTicks)
  }
  const bar = ARRANGING_PPQ * 4
  return Math.max(TAG_ROLL_DEFAULT_LENGTH_TICKS, Math.ceil(max / bar) * bar)
}

/** Arrangement → Tag Studio document (TTBB parts + notes). */
export function arrangementToTagRoll(
  project: ArrangementProject,
  idGen?: BridgeIdGen,
): TagRollProject {
  const gen = ids(idGen)
  const { parts, byRole } = ttbbParts(gen)
  const notes: TagRollNote[] = []

  // Lead comes from melody events (preserves held posts). Harmony parts come from stacks.
  for (const m of project.melody) {
    notes.push({
      id: gen.next('trn'),
      partId: byRole.Lead.id,
      midi: m.midi,
      startTick: m.startTick,
      durationTicks: m.durationTicks,
      ...(m.lyric ? { lyric: m.lyric } : {}),
    })
  }

  for (const stack of project.stacks) {
    if (!stack.midi) continue
    const common = {
      startTick: stack.startTick,
      durationTicks: stack.durationTicks,
    }
    notes.push({
      id: gen.next('trn'),
      partId: byRole.Tenor.id,
      midi: stack.midi.tenor,
      ...common,
    })
    notes.push({
      id: gen.next('trn'),
      partId: byRole.Bari.id,
      midi: stack.midi.bari,
      ...common,
    })
    notes.push({
      id: gen.next('trn'),
      partId: byRole.Bass.id,
      midi: stack.midi.bass,
      ...common,
    })
  }

  const mix = parts.map((p) => ({
    partId: p.id,
    volume: 1,
    pan: 0,
    mute: false,
    solo: false,
  }))

  return {
    schema: TAG_ROLL_SCHEMA,
    id: project.id.startsWith('arr_') ? gen.next('tr') : project.id,
    title: project.title,
    bpm: project.bpm || TAG_ROLL_DEFAULT_BPM,
    ppq: TAG_ROLL_PPQ,
    snapTicks: TAG_ROLL_DEFAULT_SNAP_TICKS,
    lengthTicks: projectLengthTicks(project),
    timeSignature: { numerator: 4, denominator: 4 },
    tempoMarkers: [{ id: gen.next('trt'), tick: 0, bpm: project.bpm || TAG_ROLL_DEFAULT_BPM }],
    expressions: [],
    soundEngine: 'synth',
    pitchPipeSoundId: 'mellow',
    soundEnvelope: { attackMs: 8, releaseMs: 80 },
    tonality: project.tonality,
    tonalityMode: project.tonalityMode ?? 'major',
    preferFlats: project.preferFlats,
    parts,
    mix,
    notes,
    localEntryId: null,
    view: {
      cellW: 28,
      cellH: 14,
      scrollX: 0,
      scrollY: 0,
      lockPiano: false,
      mode: 'compose',
      activePartId: byRole.Lead.id,
      melodyPartId: byRole.Lead.id,
      playheadTick: 0,
      focusActivePart: false,
      scaleHighlight: true,
    },
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

function partByName(parts: readonly TagRollPart[], name: string): TagRollPart | undefined {
  return parts.find((p) => p.name === name)
}

/** Tag Studio → Arrangement (melody + best-effort stacks; pillars empty). */
export function tagRollToArrangement(
  tag: TagRollProject,
  idGen?: BridgeIdGen,
): ArrangementProject {
  const gen = ids(idGen)
  const leadPart =
    (tag.view.melodyPartId
      ? tag.parts.find((p) => p.id === tag.view.melodyPartId)
      : undefined) ??
    partByName(tag.parts, 'Lead') ??
    tag.parts[0]

  const base = createEmptyArrangement(tag.title || 'Untitled', {
    id: tag.id.startsWith('tr') ? gen.next('arr') : tag.id,
    now: tag.createdAt || Date.now(),
  })

  if (!leadPart) {
    return {
      ...base,
      schema: ARRANGEMENT_SCHEMA,
      bpm: tag.bpm,
      ppq: ARRANGING_PPQ,
      tonality: tag.tonality,
      tonalityMode: tag.tonalityMode ?? 'major',
      preferFlats: tag.preferFlats,
      updatedAt: tag.updatedAt,
    }
  }

  const leadNotes = tag.notes
    .filter((n) => n.partId === leadPart.id)
    .sort((a, b) => a.startTick - b.startTick || a.midi - b.midi)

  const melody: MelodyEvent[] = leadNotes.map((n) => ({
    id: gen.next('mel'),
    midi: n.midi,
    startTick: n.startTick,
    durationTicks: n.durationTicks,
    role: 'unknown' as const,
    ...(n.lyric ? { lyric: n.lyric } : {}),
  }))

  const tenor = partByName(tag.parts, 'Tenor')
  const bari = partByName(tag.parts, 'Bari')
  const bass = partByName(tag.parts, 'Bass')

  const harmonyNotes = tag.notes.filter((n) => {
    if (n.partId === leadPart.id) return false
    return (
      n.partId === tenor?.id || n.partId === bari?.id || n.partId === bass?.id
    )
  })

  // Stack boundaries: any TTBB note start/end under a sounding lead (same as coach moments).
  const partSpans = [
    ...leadNotes.map((n) => ({
      startTick: n.startTick,
      durationTicks: n.durationTicks,
      midi: n.midi,
      isLead: true as const,
    })),
    ...harmonyNotes.map((n) => ({
      startTick: n.startTick,
      durationTicks: n.durationTicks,
      midi: n.midi,
    })),
  ]
  const boundaries = collectMomentBoundaries(melody, partSpans)

  const stacks: ChordStack[] = []
  for (let i = 0; i < boundaries.length; i++) {
    const startTick = boundaries[i]!
    const lead = leadNotes.find(
      (l) => l.startTick <= startTick && startTick < l.startTick + l.durationTicks,
    )
    if (!lead) continue
    const next = boundaries[i + 1]
    const endCap =
      next != null ? next : Math.min(
        Math.max(...leadNotes.map((l) => l.startTick + l.durationTicks), startTick + 1),
        lead.startTick + lead.durationTicks,
      )
    const durationTicks = Math.max(1, endCap - startTick)

    const sounding = (partId: string | undefined) =>
      partId
        ? tag.notes.find(
            (n) =>
              n.partId === partId &&
              n.startTick <= startTick &&
              startTick < n.startTick + n.durationTicks,
          )
        : undefined

    const t = sounding(tenor?.id)
    const b = sounding(bari?.id)
    const bs = sounding(bass?.id)
    // Prefer exact-onset harmony; fall back to covering notes.
    const tOn = tenor
      ? tag.notes.find((n) => n.partId === tenor.id && n.startTick === startTick) ?? t
      : undefined
    const bOn = bari
      ? tag.notes.find((n) => n.partId === bari.id && n.startTick === startTick) ?? b
      : undefined
    const bsOn = bass
      ? tag.notes.find((n) => n.partId === bass.id && n.startTick === startTick) ?? bs
      : undefined

    if (!tOn && !bOn && !bsOn) continue
    stacks.push({
      id: gen.next('stk'),
      startTick,
      durationTicks,
      rootPc: ((bsOn?.midi ?? lead.midi) % 12 + 12) % 12,
      natureId: 'unknown',
      voicing: '',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      pillarId: null,
      midi: {
        tenor: tOn?.midi ?? lead.midi + 4,
        lead: lead.midi,
        bari: bOn?.midi ?? lead.midi - 3,
        bass: bsOn?.midi ?? lead.midi - 12,
      },
      ruleTags: [],
    })
  }

  return {
    ...base,
    schema: ARRANGEMENT_SCHEMA,
    title: tag.title,
    bpm: tag.bpm,
    ppq: ARRANGING_PPQ,
    tonality: tag.tonality,
    tonalityMode: tag.tonalityMode ?? 'major',
    preferFlats: tag.preferFlats,
    melody,
    stacks,
    pillars: [],
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
  }
}
