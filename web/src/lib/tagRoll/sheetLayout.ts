/**
 * Pure sheet sizing helpers (testable without canvas).
 */
import {
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  type TagRollProject,
} from './types'
import { ticksToPx } from './normalize'

const MAX_DIM = 4096

export type TagRollSheetLayout = {
  midiMin: number
  midiMax: number
  width: number
  height: number
  scale: number
  cellW: number
  cellH: number
}

export function tagRollSheetLayout(
  project: TagRollProject,
  opts?: { cellW?: number; cellH?: number },
): TagRollSheetLayout {
  const cellW = opts?.cellW ?? Math.max(12, Math.min(28, project.view.cellW))
  const cellH = opts?.cellH ?? Math.max(10, Math.min(18, project.view.cellH))

  let midiMin = TAG_ROLL_MIDI_MIN
  let midiMax = TAG_ROLL_MIDI_MAX
  if (project.notes.length) {
    const ms = project.notes.map((n) => n.midi)
    midiMin = Math.max(TAG_ROLL_MIDI_MIN, Math.min(...ms) - 2)
    midiMax = Math.min(TAG_ROLL_MIDI_MAX, Math.max(...ms) + 2)
  }

  let width = Math.ceil(ticksToPx(project.lengthTicks, cellW)) + 80
  let height = Math.ceil((midiMax - midiMin + 1) * cellH) + 48
  const scale = Math.min(1, MAX_DIM / Math.max(width, height))
  width = Math.max(1, Math.floor(width * scale))
  height = Math.max(1, Math.floor(height * scale))
  return {
    midiMin,
    midiMax,
    width,
    height,
    scale,
    cellW: cellW * scale,
    cellH: cellH * scale,
  }
}

export { MAX_DIM as TAG_ROLL_SHEET_MAX_DIM }
