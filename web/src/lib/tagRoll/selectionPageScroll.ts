/**
 * Page-scroll the piano roll so a selected note is visible.
 * When the note lies outside the viewport, jump by whole screen pages
 * toward it (then snap if still off-screen after one page).
 */
import { midiToY, ticksToPx } from './normalize'
import {
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  TAG_ROLL_PPQ,
  type TagRollNote,
} from './types'

export type PageScrollRevealOpts = {
  noteStartTick: number
  noteMidi: number
  scrollX: number
  scrollY: number
  cellW: number
  cellH: number
  viewportW: number
  /** Pitch-plane height (viewport below the ruler / header). */
  viewportH: number
  lengthTicks: number
  ppq?: number
  marginPx?: number
}

export type PageScrollRevealResult = {
  scrollX: number
  scrollY: number
}

function pageAxis(
  scroll: number,
  contentPos: number,
  viewport: number,
  contentSize: number,
  margin: number,
): number {
  const vp = Math.max(1, viewport)
  const maxScroll = Math.max(0, contentSize - vp)
  const m = Math.max(8, Math.min(margin, vp * 0.25))
  const screen = contentPos - scroll
  if (screen >= m && screen <= vp - m) return scroll

  if (screen > vp - m) {
    // Off toward the high end — one page forward.
    let next = Math.min(maxScroll, scroll + vp)
    if (contentPos - next > vp - m) {
      next = Math.max(0, Math.min(maxScroll, contentPos - m))
    }
    return next
  }

  // Off toward the low end — one page back.
  let next = Math.max(0, scroll - vp)
  if (contentPos - next < m) {
    next = Math.max(0, Math.min(maxScroll, contentPos - m))
  }
  return next
}

/**
 * If the note onset / pitch row is outside the visible band, return new
 * scroll offsets. Null = already visible (no change).
 */
export function pageScrollToRevealNote(opts: PageScrollRevealOpts): PageScrollRevealResult | null {
  const ppq = opts.ppq ?? TAG_ROLL_PPQ
  const margin = opts.marginPx ?? 48
  const contentW = ticksToPx(Math.max(0, opts.lengthTicks), opts.cellW, ppq)
  const contentH = (TAG_ROLL_MIDI_MAX - TAG_ROLL_MIDI_MIN + 1) * opts.cellH
  const noteX = ticksToPx(Math.max(0, opts.noteStartTick), opts.cellW, ppq)
  const noteY = midiToY(opts.noteMidi, opts.cellH)

  const nextX = pageAxis(opts.scrollX, noteX, opts.viewportW, contentW, margin)
  const nextY = pageAxis(opts.scrollY, noteY, opts.viewportH, contentH, margin)

  if (Math.abs(nextX - opts.scrollX) < 0.5 && Math.abs(nextY - opts.scrollY) < 0.5) {
    return null
  }
  return { scrollX: nextX, scrollY: nextY }
}

/** Convenience from a Tag Roll note. */
export function pageScrollToRevealTagNote(
  note: Pick<TagRollNote, 'startTick' | 'midi'>,
  opts: Omit<PageScrollRevealOpts, 'noteStartTick' | 'noteMidi'>,
): PageScrollRevealResult | null {
  return pageScrollToRevealNote({
    ...opts,
    noteStartTick: note.startTick,
    noteMidi: note.midi,
  })
}
