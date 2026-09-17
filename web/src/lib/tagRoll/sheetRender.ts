/**
 * Full-arrangement PNG raster for My Library sheet handoff.
 */
import {
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  TAG_ROLL_PPQ,
  type TagRollProject,
} from './types'
import { ticksToPx } from './normalize'

const MAX_DIM = 4096

export async function renderTagRollSheet(
  project: TagRollProject,
  opts?: { cellW?: number; cellH?: number },
): Promise<Blob> {
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
  const cw = cellW * scale
  const ch = cellH * scale
  const left = 72 * scale
  const top = 28 * scale

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  ctx.fillStyle = '#f7f4ee'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#1a1a1a'
  ctx.font = `${Math.max(10, 13 * scale)}px sans-serif`
  ctx.fillText(project.title || 'Tag Roll', 12 * scale, 18 * scale)

  const beats = Math.ceil(project.lengthTicks / TAG_ROLL_PPQ)
  for (let b = 0; b <= beats; b++) {
    const x = left + b * cw
    ctx.strokeStyle = b % 4 === 0 ? '#bbb' : '#ddd'
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, height - 8)
    ctx.stroke()
  }
  for (let m = midiMin; m <= midiMax; m++) {
    const y = top + (midiMax - m) * ch
    const pc = ((m % 12) + 12) % 12
    if (pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10) {
      ctx.fillStyle = 'rgba(0,0,0,0.06)'
      ctx.fillRect(left, y, width - left, ch)
    }
    ctx.strokeStyle = '#e0e0e0'
    ctx.beginPath()
    ctx.moveTo(left, y + ch)
    ctx.lineTo(width, y + ch)
    ctx.stroke()
  }

  for (const n of project.notes) {
    const part = project.parts.find((p) => p.id === n.partId)
    const x = left + ticksToPx(n.startTick, cw)
    const w = Math.max(2, ticksToPx(n.durationTicks, cw))
    const y = top + (midiMax - n.midi) * ch
    ctx.fillStyle = part?.color || '#1d6a9f'
    ctx.fillRect(x + 1, y + 1, w - 2, ch - 2)
    if (n.lyric && w > 18 && ch > 10) {
      ctx.fillStyle = '#fff'
      ctx.font = `${Math.max(8, Math.min(ch - 2, 11 * scale))}px sans-serif`
      ctx.fillText(n.lyric.slice(0, 12), x + 3, y + ch * 0.72)
    }
  }

  let lx = 12 * scale
  const ly = height - 12 * scale
  ctx.font = `${Math.max(9, 11 * scale)}px sans-serif`
  for (const p of project.parts) {
    ctx.fillStyle = p.color
    ctx.fillRect(lx, ly - 8 * scale, 10 * scale, 10 * scale)
    ctx.fillStyle = '#333'
    ctx.fillText(p.name, lx + 14 * scale, ly)
    lx += ctx.measureText(p.name).width + 28 * scale
  }

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png',
    )
  })
}
