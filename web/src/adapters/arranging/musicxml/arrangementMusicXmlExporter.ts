/**
 * MusicXML 3.1 partwise builder from ArrangementScoreModel.
 */
import type { ArrangementScoreModel, ScoreNote } from '../../../domain/arranging/musicxml/scoreModel'
import {
  escXml,
  measureTicks,
  midiToMusicXmlPitch,
} from '../../../domain/arranging/musicxml/scoreModel'

type Slice = {
  start: number
  dur: number
  midi?: number
  lyric?: string
  harmony?: string
  tieStart?: boolean
  tieStop?: boolean
}

function collapseMono(notes: readonly ScoreNote[]): ScoreNote[] {
  const sorted = [...notes].sort(
    (a, b) => a.startTick - b.startTick || a.midi - b.midi,
  )
  const out: ScoreNote[] = []
  for (const n of sorted) {
    const copy = { ...n }
    const last = out[out.length - 1]
    if (last && copy.startTick < last.startTick + last.durationTicks) {
      if (copy.startTick <= last.startTick) {
        out.push(copy)
        continue
      }
      last.durationTicks = Math.max(1, copy.startTick - last.startTick)
    }
    out.push(copy)
  }
  return out
}

function notesToTimeline(notes: readonly ScoreNote[], lengthTicks: number): Slice[] {
  const collapsed = collapseMono(notes)
  const slices: Slice[] = []
  let cursor = 0
  let i = 0
  while (i < collapsed.length) {
    const groupStart = collapsed[i]!.startTick
    if (groupStart > cursor) {
      slices.push({ start: cursor, dur: groupStart - cursor })
      cursor = groupStart
    }
    const group: ScoreNote[] = []
    while (i < collapsed.length && collapsed[i]!.startTick === groupStart) {
      group.push(collapsed[i]!)
      i++
    }
    const dur = Math.max(1, Math.min(...group.map((g) => g.durationTicks)))
    for (let g = 0; g < group.length; g++) {
      const n = group[g]!
      slices.push({
        start: groupStart,
        dur,
        midi: n.midi,
        lyric: g === 0 ? n.lyric : undefined,
        harmony: g === 0 ? n.chordSymbol : undefined,
      })
    }
    cursor = groupStart + dur
  }
  if (cursor < lengthTicks) {
    slices.push({ start: cursor, dur: lengthTicks - cursor })
  }
  return slices
}

function splitAtMeasures(slices: Slice[], mLen: number, lengthTicks: number): Slice[][] {
  const measureCount = Math.max(1, Math.ceil(lengthTicks / mLen))
  const measures: Slice[][] = Array.from({ length: measureCount }, () => [])
  for (const s of slices) {
    let remaining = s.dur
    let t = s.start
    let first = true
    while (remaining > 0) {
      const mIndex = Math.min(measureCount - 1, Math.floor(t / mLen))
      const barEnd = (mIndex + 1) * mLen
      const take = Math.min(remaining, barEnd - t, lengthTicks - t)
      if (take <= 0) break
      const tieStart = s.midi != null && remaining > take
      const tieStop = s.midi != null && !first
      measures[mIndex]!.push({
        start: t,
        dur: take,
        midi: s.midi,
        lyric: first ? s.lyric : undefined,
        harmony: first ? s.harmony : undefined,
        tieStart: tieStart || undefined,
        tieStop: tieStop || undefined,
      })
      t += take
      remaining -= take
      first = false
    }
  }
  for (let m = 0; m < measureCount; m++) {
    if (!measures[m]!.length) {
      measures[m]!.push({ start: m * mLen, dur: mLen })
    }
  }
  return measures
}

function pitchXml(midi: number, preferFlats: boolean): string {
  const p = midiToMusicXmlPitch(midi, preferFlats)
  const alter = p.alter !== 0 ? `<alter>${p.alter}</alter>` : ''
  return `<pitch><step>${p.step}</step>${alter}<octave>${p.octave}</octave></pitch>`
}

function clefXml(clef: ArrangementScoreModel['parts'][0]['clef']): string {
  if (clef === 'bass') return `<clef><sign>F</sign><line>4</line></clef>`
  if (clef === 'treble8vb') {
    return `<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>`
  }
  return `<clef><sign>G</sign><line>2</line></clef>`
}

function noteXml(s: Slice, preferFlats: boolean, chord: boolean): string {
  if (s.midi == null) {
    return `<note><rest/><duration>${s.dur}</duration><voice>1</voice></note>`
  }
  const chordTag = chord ? '<chord/>' : ''
  const lyric = s.lyric
    ? `<lyric number="1"><syllabic>single</syllabic><text>${escXml(s.lyric)}</text></lyric>`
    : ''
  const ties: string[] = []
  if (s.tieStop) ties.push('<tie type="stop"/>')
  if (s.tieStart) ties.push('<tie type="start"/>')
  const notations: string[] = []
  if (s.tieStop) notations.push('<tied type="stop"/>')
  if (s.tieStart) notations.push('<tied type="start"/>')
  const notXml = notations.length ? `<notations>${notations.join('')}</notations>` : ''
  return `<note>${chordTag}${pitchXml(s.midi, preferFlats)}<duration>${s.dur}</duration><voice>1</voice>${ties.join('')}${notXml}${lyric}</note>`
}

function harmonyXml(text: string | undefined): string {
  if (!text) return ''
  return `<harmony><root><root-step>${escXml(text[0] ?? 'C')}</root-step></root><kind text="${escXml(text)}">other</kind></harmony>`
}

function emitMeasureNotes(slices: Slice[], preferFlats: boolean): string {
  const parts: string[] = []
  let i = 0
  while (i < slices.length) {
    const start = slices[i]!.start
    const group: Slice[] = []
    while (i < slices.length && slices[i]!.start === start && slices[i]!.midi != null) {
      group.push(slices[i]!)
      i++
    }
    if (group.length) {
      if (group[0]!.harmony) parts.push(harmonyXml(group[0]!.harmony))
      for (let g = 0; g < group.length; g++) {
        parts.push(noteXml(group[g]!, preferFlats, g > 0))
      }
      continue
    }
    parts.push(noteXml(slices[i]!, preferFlats, false))
    i++
  }
  return parts.join('')
}

/** Build MusicXML 3.1 partwise string from score model. */
export function scoreModelToMusicXml(model: ArrangementScoreModel): string {
  const ts = model.timeSignature
  const mLen = measureTicks(model.ppq, ts.numerator, ts.denominator)
  const lengthTicks = Math.max(mLen, model.lengthTicks)
  const bpm = model.bpm || 100

  const partList = model.parts
    .map((p) => `<score-part id="${p.id}"><part-name>${escXml(p.name)}</part-name></score-part>`)
    .join('')

  const partsXml = model.parts
    .map((part) => {
      const timeline = notesToTimeline(part.notes, lengthTicks)
      const measures = splitAtMeasures(timeline, mLen, lengthTicks)
      const measureXml = measures
        .map((slices, mi) => {
          const attrs =
            mi === 0
              ? `<attributes><divisions>${model.ppq}</divisions>` +
                `<time><beats>${ts.numerator}</beats><beat-type>${ts.denominator}</beat-type></time>` +
                `${clefXml(part.clef)}</attributes>`
              : ''
          const tempo =
            mi === 0
              ? `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(bpm)}</per-minute></metronome></direction-type><sound tempo="${Math.round(bpm)}"/></direction>`
              : ''
          return `<measure number="${mi + 1}">${attrs}${tempo}${emitMeasureNotes(slices, model.preferFlats)}</measure>`
        })
        .join('')
      return `<part id="${part.id}">${measureXml}</part>`
    })
    .join('')

  const title = escXml(model.title || 'Arrangement')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">` +
    `<score-partwise version="3.1">` +
    `<work><work-title>${title}</work-title></work>` +
    `<identification><encoding><software>Barbershop Arranging</software></encoding></identification>` +
    `<part-list>${partList}</part-list>` +
    partsXml +
    `</score-partwise>`
  )
}
