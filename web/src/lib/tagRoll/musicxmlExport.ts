/**
 * MusicXML 3.1 partwise export for Tag Studio.
 * Written score timeline (not fermata-expanded performance time).
 */
import { KEY_CHOICES, vexKeySpec } from './keySignature'
import { deferOverlappingOnsets } from './portamento'
import type {
  HarmonySketchQuality,
  HarmonySketchSpan,
  TagRollNote,
  TagRollProject,
  TagRollTimeSignature,
} from './types'
import { TAG_ROLL_DEFAULT_BPM, TAG_ROLL_PPQ } from './types'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function measureTicks(ts: TagRollTimeSignature): number {
  return Math.max(1, Math.round((ts.numerator * TAG_ROLL_PPQ * 4) / ts.denominator))
}

/** MIDI → MusicXML pitch (preferFlats controls accidental spelling). */
export function midiToMusicXmlPitch(
  midi: number,
  preferFlats: boolean,
): { step: string; alter: number; octave: number } {
  const n = Math.max(0, Math.min(127, Math.round(midi)))
  const pc = ((n % 12) + 12) % 12
  const octave = Math.floor(n / 12) - 1
  const sharp: Array<[string, number]> = [
    ['C', 0],
    ['C', 1],
    ['D', 0],
    ['D', 1],
    ['E', 0],
    ['F', 0],
    ['F', 1],
    ['G', 0],
    ['G', 1],
    ['A', 0],
    ['A', 1],
    ['B', 0],
  ]
  const flat: Array<[string, number]> = [
    ['C', 0],
    ['D', -1],
    ['D', 0],
    ['E', -1],
    ['E', 0],
    ['F', 0],
    ['G', -1],
    ['G', 0],
    ['A', -1],
    ['A', 0],
    ['B', -1],
    ['B', 0],
  ]
  const [step, alter] = (preferFlats ? flat : sharp)[pc]!
  return { step, alter, octave }
}

type Slice = {
  start: number
  dur: number
  midi?: number
  lyric?: string
  tieStart?: boolean
  tieStop?: boolean
}

/**
 * Collapse same-part overlaps for monophonic sheet / MusicXML.
 *
 * Portamento in the roll starts the destination note early so the glide can
 * finish at the source note’s written end. For notation we keep the source
 * duration intact and defer the destination onset to that release (shortening
 * its written length so the sounding end stays the same).
 */
export function collapsePartNotesMono(notes: readonly TagRollNote[]): TagRollNote[] {
  return deferOverlappingOnsets([...notes], (a, b) => a.midi - b.midi || a.id.localeCompare(b.id))
}

function notesToTimeline(notes: readonly TagRollNote[], lengthTicks: number): Slice[] {
  const collapsed = collapsePartNotesMono(notes)
  const slices: Slice[] = []
  let cursor = 0
  let i = 0
  while (i < collapsed.length) {
    const groupStart = collapsed[i]!.startTick
    if (groupStart > cursor) {
      slices.push({ start: cursor, dur: groupStart - cursor })
      cursor = groupStart
    }
    const group: TagRollNote[] = []
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
      })
    }
    cursor = groupStart + dur
  }
  if (cursor < lengthTicks) {
    slices.push({ start: cursor, dur: lengthTicks - cursor })
  }
  return slices
}

/** Split timeline slices on barlines; ties continue sounding notes. */
export function splitSlicesAtMeasures(
  slices: Slice[],
  mLen: number,
  lengthTicks: number,
): Slice[][] {
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
        tieStart: tieStart || undefined,
        tieStop: tieStop || undefined,
      })
      t += take
      remaining -= take
      first = false
    }
  }
  // Ensure every measure has content (full-measure rest if empty).
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

function noteXml(
  s: Slice,
  preferFlats: boolean,
  chord: boolean,
): string {
  if (s.midi == null) {
    return `<note><rest/><duration>${s.dur}</duration><voice>1</voice></note>`
  }
  const chordTag = chord ? '<chord/>' : ''
  const lyric = s.lyric
    ? `<lyric number="1"><syllabic>single</syllabic><text>${esc(s.lyric)}</text></lyric>`
    : ''
  const ties: string[] = []
  if (s.tieStop) ties.push('<tie type="stop"/>')
  if (s.tieStart) ties.push('<tie type="start"/>')
  const notations: string[] = []
  if (s.tieStop) notations.push('<tied type="stop"/>')
  if (s.tieStart) notations.push('<tied type="start"/>')
  const notXml = notations.length
    ? `<notations>${notations.join('')}</notations>`
    : ''
  return `<note>${chordTag}${pitchXml(s.midi, preferFlats)}<duration>${s.dur}</duration><voice>1</voice>${ties.join('')}${notXml}${lyric}</note>`
}

function musicXmlKind(
  quality: HarmonySketchQuality,
): { kind: string; text?: string } {
  switch (quality) {
    case 'minor':
      return { kind: 'minor' }
    case 'seventh':
      return { kind: 'dominant', text: '7' }
    case 'm7':
      return { kind: 'minor-seventh', text: 'm7' }
    case 'maj7':
      return { kind: 'major-seventh', text: 'maj7' }
    case 'dim':
      return { kind: 'diminished', text: 'dim' }
    case 'dim7':
      return { kind: 'diminished-seventh', text: 'dim7' }
    case 'half-dim':
      return { kind: 'half-diminished', text: 'ø' }
    case 'aug':
      return { kind: 'augmented', text: 'aug' }
    case 'sixth':
      return { kind: 'major-sixth', text: '6' }
    case 'madd6':
      return { kind: 'minor-sixth', text: 'm6' }
    case 'ninth':
      return { kind: 'dominant-ninth', text: '9' }
    case 'add9':
      return { kind: 'major', text: 'add9' }
    case 'major':
    default:
      return { kind: 'major' }
  }
}

/** MusicXML `<harmony>` for a locked sketch span (Lead part). */
export function harmonySketchToMusicXml(
  span: Pick<HarmonySketchSpan, 'rootPc' | 'quality'>,
  preferFlats: boolean,
): string {
  const root = midiToMusicXmlPitch(60 + (((span.rootPc % 12) + 12) % 12), preferFlats)
  const alter = root.alter !== 0 ? `<root-alter>${root.alter}</root-alter>` : ''
  const { kind, text } = musicXmlKind(span.quality)
  const textAttr = text ? ` text="${esc(text)}"` : ''
  return (
    `<harmony>` +
    `<root><root-step>${root.step}</root-step>${alter}</root>` +
    `<kind${textAttr}>${kind}</kind>` +
    `</harmony>`
  )
}

function emitMeasureNotes(
  slices: Slice[],
  preferFlats: boolean,
  pendingHarmony: readonly HarmonySketchSpan[] = [],
): string {
  const parts: string[] = []
  let hi = 0
  const flush = (tick: number) => {
    while (hi < pendingHarmony.length && pendingHarmony[hi]!.startTick <= tick) {
      parts.push(harmonySketchToMusicXml(pendingHarmony[hi]!, preferFlats))
      hi++
    }
  }
  let i = 0
  while (i < slices.length) {
    const start = slices[i]!.start
    flush(start)
    const group: Slice[] = []
    while (i < slices.length && slices[i]!.start === start && slices[i]!.midi != null) {
      group.push(slices[i]!)
      i++
    }
    if (group.length) {
      for (let g = 0; g < group.length; g++) {
        parts.push(noteXml(group[g]!, preferFlats, g > 0))
      }
      continue
    }
    parts.push(noteXml(slices[i]!, preferFlats, false))
    i++
  }
  flush(Number.POSITIVE_INFINITY)
  return parts.join('')
}

function musicXmlFifths(
  tonality: number,
  preferFlats: boolean,
  mode: 'major' | 'minor' = 'major',
): number {
  const id = vexKeySpec(tonality, preferFlats, mode)
  const choice = KEY_CHOICES.find((k) => k.id === id)
  if (!choice) return 0
  return choice.preferFlats ? -choice.accidentals : choice.accidentals
}

function attributesXml(
  ts: TagRollTimeSignature,
  divisions: number,
  tonality: number,
  preferFlats: boolean,
  mode: 'major' | 'minor' = 'major',
): string {
  const fifths = musicXmlFifths(tonality, preferFlats, mode)
  return (
    `<attributes>` +
    `<divisions>${divisions}</divisions>` +
    `<key><fifths>${fifths}</fifths><mode>${mode}</mode></key>` +
    `<time><beats>${ts.numerator}</beats><beat-type>${ts.denominator}</beat-type></time>` +
    `<clef><sign>G</sign><line>2</line></clef>` +
    `</attributes>`
  )
}

function tempoDirectionXml(bpm: number): string {
  const q = Math.round(bpm)
  return (
    `<direction placement="above">` +
    `<direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${q}</per-minute></metronome></direction-type>` +
    `<sound tempo="${q}"/>` +
    `</direction>`
  )
}

function fermataDirectionsXml(project: TagRollProject, mLen: number, measureIndex: number): string {
  const mStart = measureIndex * mLen
  const mEnd = mStart + mLen
  const bits: string[] = []
  for (const e of project.expressions) {
    if (e.kind !== 'fermata') continue
    if (e.tick < mStart || e.tick >= mEnd) continue
    bits.push(
      `<direction placement="above"><direction-type><words>Fermata</words></direction-type></direction>`,
    )
  }
  return bits.join('')
}

/** Build MusicXML 3.1 partwise document bytes (UTF-8). */
export function exportTagRollMusicXml(project: TagRollProject): Uint8Array {
  const ts = project.timeSignature
  const mLen = measureTicks(ts)
  const lengthTicks = Math.max(mLen, project.lengthTicks)
  const bpm = project.bpm || TAG_ROLL_DEFAULT_BPM
  const preferFlats = project.preferFlats
  const lockedSketch = (project.harmonySketch ?? [])
    .filter((s) => s.locked)
    .slice()
    .sort((a, b) => a.startTick - b.startTick)
  const leadPartId =
    project.view.melodyPartId ??
    project.parts.find((p) => p.name === 'Lead')?.id ??
    null

  const partList = project.parts
    .map(
      (p, i) =>
        `<score-part id="P${i + 1}"><part-name>${esc(p.name)}</part-name></score-part>`,
    )
    .join('')

  const partsXml = project.parts
    .map((part, i) => {
      const notes = project.notes.filter((n) => n.partId === part.id)
      const timeline = notesToTimeline(notes, lengthTicks)
      const measures = splitSlicesAtMeasures(timeline, mLen, lengthTicks)
      const emitHarmony = leadPartId != null && part.id === leadPartId
      const measureXml = measures
        .map((slices, mi) => {
          const attrs =
            mi === 0
              ? attributesXml(
                  ts,
                  TAG_ROLL_PPQ,
                  project.tonality,
                  preferFlats,
                  project.tonalityMode ?? 'major',
                )
              : ''
          const tempo = mi === 0 ? tempoDirectionXml(bpm) : ''
          const ferm = fermataDirectionsXml(project, mLen, mi)
          const mStart = mi * mLen
          const mEnd = mStart + mLen
          const pending = emitHarmony
            ? lockedSketch.filter((s) => s.startTick >= mStart && s.startTick < mEnd)
            : []
          return (
            `<measure number="${mi + 1}">${attrs}${tempo}${ferm}${emitMeasureNotes(slices, preferFlats, pending)}</measure>`
          )
        })
        .join('')
      return `<part id="P${i + 1}">${measureXml}</part>`
    })
    .join('')

  const title = esc(project.title || 'Tag Studio')
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">` +
    `<score-partwise version="3.1">` +
    `<work><work-title>${title}</work-title></work>` +
    `<identification><encoding><software>SingTags Tag Studio</software></encoding></identification>` +
    `<part-list>${partList}</part-list>` +
    partsXml +
    `</score-partwise>`

  return new TextEncoder().encode(xml)
}

export function downloadTagRollMusicXml(project: TagRollProject): void {
  const bytes = exportTagRollMusicXml(project)
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'application/vnd.recordare.musicxml+xml',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.title.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'tag-roll'}.musicxml`
  a.click()
  URL.revokeObjectURL(url)
}
