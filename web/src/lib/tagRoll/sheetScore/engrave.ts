/**
 * Turn rhythm events + staff layout into drawable engraving primitives.
 */
import { ticksToPx } from '../normalize'
import { type TagRollClefFamily, type TagRollExpression } from '../types'
import { durationHasStem, durationHeadFilled } from './durationMap'
import type { SheetRhythmEvent } from './rhythmLayout'
import { writtenMidiToStaffPos } from './staffPitch'
import type { SheetScoreLayout, SheetStaffLayout } from './types'
import { concertToWrittenMidi } from './writtenPitch'

export type EngravedNoteHead = {
  x: number
  y: number
  filled: boolean
  color: string
  accidental: 'sharp' | 'flat' | 'natural' | null
  dots: number
  ledgerYs: number[]
}

export type EngravedStem = {
  x: number
  y0: number
  y1: number
  color: string
}

export type EngravedFlag = {
  x: number
  y: number
  up: boolean
  count: number
  color: string
}

export type EngravedBeam = {
  x0: number
  x1: number
  y0: number
  y1: number
  /** 0 = primary beam; higher = secondary toward noteheads. */
  level: number
  color: string
}

export type EngravedRest = {
  x: number
  y: number
  type: SheetRhythmEvent['duration']['type']
  dots: number
  color: string
}

export type EngravedTie = {
  x0: number
  x1: number
  y: number
  up: boolean
  color: string
}

export type EngravedLyric = {
  x: number
  y: number
  text: string
  color: string
}

export type EngravedFermata = {
  x: number
  y: number
}

export type EngravedRamp = {
  x0: number
  x1: number
  y: number
  kind: 'rit' | 'accel'
}

export type EngravedScore = {
  heads: EngravedNoteHead[]
  stems: EngravedStem[]
  flags: EngravedFlag[]
  beams: EngravedBeam[]
  rests: EngravedRest[]
  ties: EngravedTie[]
  lyrics: EngravedLyric[]
  fermatas: EngravedFermata[]
  ramps: EngravedRamp[]
}

function staffById(layout: SheetScoreLayout, id: string): SheetStaffLayout | undefined {
  return layout.staves.find((s) => s.id === id)
}

function stemLength(lineGap: number, flags: number): number {
  return lineGap * (3.2 + Math.max(0, flags - 1) * 0.35)
}

function showsLyrics(e: SheetRhythmEvent): boolean {
  return e.role === 'lead' || e.role === 'solo'
}

/**
 * Engrave rhythm events into screen-space primitives.
 * Coordinates are content-space: x from tick 0 at 0 (caller adds marginLeft - scrollX);
 * y is absolute content y including staff.topY (caller adds rulerH - scrollY).
 */
export function engraveSheetScore(opts: {
  layout: SheetScoreLayout
  events: readonly SheetRhythmEvent[]
  clefFamily: TagRollClefFamily
  preferFlats: boolean
  pxPerBeat: number
  expressions?: readonly TagRollExpression[]
}): EngravedScore {
  const { layout, events, clefFamily, preferFlats, pxPerBeat } = opts
  const heads: EngravedNoteHead[] = []
  const stems: EngravedStem[] = []
  const flags: EngravedFlag[] = []
  const beams: EngravedBeam[] = []
  const rests: EngravedRest[] = []
  const ties: EngravedTie[] = []
  const lyrics: EngravedLyric[] = []
  const fermatas: EngravedFermata[] = []
  const ramps: EngravedRamp[] = []

  type Placed = {
    event: SheetRhythmEvent
    staff: SheetStaffLayout
    x: number
    headY: number
    stemX: number
    stemTipY: number
  }
  const placed: Placed[] = []

  for (const e of events) {
    const staff = staffById(layout, e.staffId)
    if (!staff) continue
    const x = ticksToPx(e.startTick, pxPerBeat)
    const midY = staff.topY + staff.height / 2

    if (e.concertMidi == null) {
      const y =
        e.voice === 1 ? midY - staff.lineGap * 0.35 : midY + staff.lineGap * 0.35
      rests.push({
        x,
        y,
        type: e.duration.type,
        dots: e.duration.dots,
        color: e.color,
      })
      continue
    }

    const written = concertToWrittenMidi(e.concertMidi, clefFamily, staff.kind)
    const pos = writtenMidiToStaffPos(written, staff.clef, staff.lineGap, preferFlats)
    const headY = staff.topY + pos.yFromTop
    const filled = durationHeadFilled(e.duration.type)
    const ledgerYs = pos.ledgerStepsFromTop.map(
      (s) => staff.topY + s * (staff.lineGap / 2),
    )

    heads.push({
      x,
      y: headY,
      filled,
      color: e.color,
      accidental: pos.accidental,
      dots: e.duration.dots,
      ledgerYs,
    })

    if (e.lyric && showsLyrics(e) && staff.lyricBand > 0) {
      lyrics.push({
        x,
        y: staff.topY + staff.height + staff.lyricBand * 0.72,
        text: e.lyric,
        color: e.color,
      })
    }

    if (!durationHasStem(e.duration.type)) {
      placed.push({
        event: e,
        staff,
        x,
        headY,
        stemX: x,
        stemTipY: headY,
      })
      continue
    }

    const len = stemLength(staff.lineGap, e.duration.flags)
    const stemX = e.stemUp ? x + staff.lineGap * 0.55 : x - staff.lineGap * 0.55
    const stemTipY = e.stemUp ? headY - len : headY + len
    stems.push({
      x: stemX,
      y0: headY,
      y1: stemTipY,
      color: e.color,
    })

    placed.push({ event: e, staff, x, headY, stemX, stemTipY })

    if (e.beamGroupId == null && e.duration.flags > 0) {
      flags.push({
        x: stemX,
        y: stemTipY,
        up: e.stemUp,
        count: e.duration.flags,
        color: e.color,
      })
    }
  }

  // Beams
  const byBeam = new Map<number, Placed[]>()
  for (const p of placed) {
    const id = p.event.beamGroupId
    if (id == null) continue
    const list = byBeam.get(id) ?? []
    list.push(p)
    byBeam.set(id, list)
  }
  for (const group of byBeam.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => a.event.startTick - b.event.startTick)
    const first = group[0]!
    const up = first.event.stemUp
    const maxFlags = Math.max(...group.map((g) => g.event.duration.flags))
    const gap = first.staff.lineGap
    for (let level = 0; level < maxFlags; level++) {
      let run: Placed[] = []
      const flush = () => {
        if (run.length < 2) {
          run = []
          return
        }
        const a = run[0]!
        const b = run[run.length - 1]!
        const inset = level * gap * 0.55
        const y0 = up ? a.stemTipY + inset : a.stemTipY - inset
        const y1 = up ? b.stemTipY + inset : b.stemTipY - inset
        beams.push({
          x0: a.stemX,
          x1: b.stemX,
          y0,
          y1,
          level,
          color: a.event.color,
        })
        run = []
      }
      for (const g of group) {
        if (g.event.duration.flags > level) run.push(g)
        else flush()
      }
      flush()
    }
  }

  // Ties
  const byVoice = new Map<string, Placed[]>()
  for (const p of placed) {
    if (p.event.concertMidi == null) continue
    const key = `${p.event.staffId}:${p.event.voice}`
    const list = byVoice.get(key) ?? []
    list.push(p)
    byVoice.set(key, list)
  }
  for (const list of byVoice.values()) {
    list.sort((a, b) => a.event.startTick - b.event.startTick)
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i]!
      const b = list[i + 1]!
      if (!a.event.tieStart || !b.event.tieStop) continue
      if (a.event.concertMidi !== b.event.concertMidi) continue
      const up = a.event.stemUp
      ties.push({
        x0: a.x + a.staff.lineGap * 0.4,
        x1: b.x - b.staff.lineGap * 0.4,
        y: a.headY,
        up: !up,
        color: a.event.color,
      })
    }
  }

  // Expression marks above the top staff
  const exprY = layout.exprBandTop + layout.exprBandHeight * 0.55
  for (const ex of opts.expressions ?? []) {
    if (ex.kind === 'fermata') {
      // Align with note onset (notehead), not duration center like the roll lane.
      fermatas.push({
        x: ticksToPx(ex.tick, pxPerBeat),
        y: exprY,
      })
    } else {
      ramps.push({
        x0: ticksToPx(ex.startTick, pxPerBeat),
        x1: ticksToPx(ex.endTick, pxPerBeat),
        y: layout.exprBandTop + layout.exprBandHeight * 0.35,
        kind: ex.kind,
      })
    }
  }

  return { heads, stems, flags, beams, rests, ties, lyrics, fermatas, ramps }
}
