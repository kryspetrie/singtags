/**
 * Resolve lint locations and filter by the coach inspect (chord cursor) range.
 */
import type { ArrangementLint } from '../../domain/arranging/qa/types'
import type { ArrangementProject } from '../../domain/arranging/types'
import { formatMeasureBeat } from '../tagRoll/measureBeat'
import { TAG_ROLL_PPQ, type TagRollTimeSignature } from '../tagRoll/types'

export type TickRange = {
  startTick: number
  endTick: number
}

/** Absolute tick for a lint, when tied to a stack or melody note. */
export function lintStartTick(
  lint: ArrangementLint,
  project: ArrangementProject,
): number | null {
  if (lint.stackId) {
    const s = project.stacks.find((x) => x.id === lint.stackId)
    if (s) return s.startTick
  }
  if (lint.noteId) {
    const n = project.melody.find((x) => x.id === lint.noteId)
    if (n) return n.startTick
  }
  const dataTick = lint.data?.startTick
  if (typeof dataTick === 'number' && Number.isFinite(dataTick)) return dataTick
  return null
}

/** Keep lints whose stack/note onset falls in [start, end). */
export function filterLintsInRange(
  lints: readonly ArrangementLint[],
  project: ArrangementProject,
  range: TickRange | null | undefined,
): ArrangementLint[] {
  if (!range || range.endTick <= range.startTick) return []
  return lints.filter((lint) => {
    const t = lintStartTick(lint, project)
    if (t == null) return false
    return t >= range.startTick && t < range.endTick
  })
}

/** Pipe row: `| 3:2 | message |` */
export function formatLintMeasureBeatRow(
  lint: ArrangementLint,
  project: ArrangementProject,
  ts: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): string {
  const tick = lintStartTick(lint, project)
  const loc = tick == null ? '—:—' : formatMeasureBeat(tick, ts, ppq)
  return `| ${loc} | ${lint.message} |`
}
