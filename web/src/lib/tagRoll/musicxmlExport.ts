/**
 * MusicXML 3.1 partwise export for Tag Studio.
 * One score-part per sheet staff (clef); each singing part is voice 1 or 2 on
 * that clef — matching assignSheetStaves / Vex engraving.
 */
import { KEY_CHOICES, vexKeySpec } from './keySignature'
import { musicXmlAccidentalName } from './midiPitch'
import { melodyPartAtTick } from './melodyPass'
import { assignSheetStaves } from './sheetScore/assignStaves'
import { sheetEngraveLengthTicks } from './sheetScore/engraveLength'
import type { MappedDuration, NoteDurationType } from './sheetScore/durationMap'
import {
  buildSheetRhythm,
  type SheetRhythmEvent,
} from './sheetScore/rhythmLayout'
import {
  preferFlatsAtTick,
  sheetKeyAtTick,
  sheetKeySpecAtTick,
} from './sheetScore/sheetAccidentals'
import {
  musicXmlSyllabicName,
  parseLyricSyllable,
} from './sheetScore/sheetLyricSyllabic'
import {
  spellChordRoot,
  spellWrittenMidi,
  type SpelledPitch,
} from './sheetScore/sheetPitchSpelling'
import type { SheetClefKind, SheetStaffSpec } from './sheetScore/types'
import { concertToWrittenMidi } from './sheetScore/writtenPitch'
import { measureTicks } from './tempoMap'
import type {
  HarmonySketchQuality,
  HarmonySketchSpan,
  TagRollProject,
  TagRollTimeSignature,
} from './types'
import { TAG_ROLL_DEFAULT_BPM, TAG_ROLL_PPQ } from './types'
import type { SheetChordDetectSegment } from './sheetChordMarks'

export { midiToMusicXmlPitch } from './midiPitch'
export { collapsePartNotesMono, splitSlicesAtMeasures } from './notationTimeline'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const TYPE_XML: Record<NoteDurationType, string> = {
  whole: 'whole',
  half: 'half',
  quarter: 'quarter',
  eighth: 'eighth',
  sixteenth: '16th',
  'thirty-second': '32nd',
}

function musicXmlClef(kind: SheetClefKind): string {
  switch (kind) {
    case 'treble8vb':
      return `<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>`
    case 'bass8va':
      return `<clef><sign>F</sign><line>4</line><clef-octave-change>1</clef-octave-change></clef>`
    case 'bass':
      return `<clef><sign>F</sign><line>4</line></clef>`
    case 'treble':
    default:
      return `<clef><sign>G</sign><line>2</line></clef>`
  }
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

/** Pitch classes altered by the key signature (for omitting redundant accidentals). */
function keySignatureAlters(
  tonality: number,
  preferFlats: boolean,
  mode: 'major' | 'minor',
): Map<string, number> {
  const fifths = musicXmlFifths(tonality, preferFlats, mode)
  const orderSharps = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
  const orderFlats = ['B', 'E', 'A', 'D', 'G', 'C', 'F']
  const out = new Map<string, number>()
  if (fifths > 0) {
    for (let i = 0; i < fifths && i < 7; i++) out.set(orderSharps[i]!, 1)
  } else if (fifths < 0) {
    for (let i = 0; i < -fifths && i < 7; i++) out.set(orderFlats[i]!, -1)
  }
  return out
}

function pitchAndAccidentalXml(
  p: SpelledPitch,
  keyAlters: Map<string, number>,
): string {
  const alter = p.alter !== 0 ? `<alter>${p.alter}</alter>` : ''
  const pitch = `<pitch><step>${p.step}</step>${alter}<octave>${p.octave}</octave></pitch>`
  const keyAlter = keyAlters.get(p.step) ?? 0
  // Emit accidental only when the written alter differs from the key signature.
  if (p.alter === keyAlter) return pitch
  const accName =
    p.alter === 0 && keyAlter !== 0
      ? 'natural'
      : musicXmlAccidentalName(p.alter)
  return accName ? `${pitch}<accidental>${accName}</accidental>` : pitch
}

function dotsXml(dots: number): string {
  return '<dot/>'.repeat(Math.max(0, dots))
}

function beamXml(e: SheetRhythmEvent, siblings: readonly SheetRhythmEvent[]): string {
  if (e.beamGroupId == null || e.concertMidi == null) return ''
  const group = siblings.filter((x) => x.beamGroupId === e.beamGroupId)
  if (group.length < 2) return ''
  const idx = group.findIndex((x) => x.id === e.id)
  if (idx < 0) return ''
  const value =
    idx === 0 ? 'begin' : idx === group.length - 1 ? 'end' : 'continue'
  return `<beam number="1">${value}</beam>`
}

function tupletTimeModXml(e: SheetRhythmEvent): string {
  if (!e.tuplet) return ''
  return (
    `<time-modification>` +
    `<actual-notes>${e.tuplet.actualNotes}</actual-notes>` +
    `<normal-notes>${e.tuplet.normalNotes}</normal-notes>` +
    `</time-modification>`
  )
}

function tupletNotationXml(e: SheetRhythmEvent): string {
  if (!e.tuplet) return ''
  if (e.tuplet.index === 0) {
    return `<tuplet type="start" bracket="yes" number="1"/>`
  }
  if (e.tuplet.index === e.tuplet.actualNotes - 1) {
    return `<tuplet type="stop" number="1"/>`
  }
  return ''
}

function lyricXmlFromEvent(
  e: SheetRhythmEvent,
  prevOpen: boolean,
): { xml: string; open: boolean } {
  if (!e.lyric || e.tieStop) return { xml: '', open: prevOpen }
  const parsed = parseLyricSyllable(e.lyric, prevOpen)
  if (!parsed) return { xml: '', open: prevOpen }
  let open =
    parsed.syllabic === 'begin' ||
    parsed.syllabic === 'middle' ||
    parsed.extendAfter
  if (parsed.syllabic === 'end' || parsed.syllabic === 'single') {
    open = parsed.extendAfter
  }
  if (parsed.syllabic === 'extend' || !parsed.text) {
    const ext = parsed.extendAfter
      ? `<lyric number="1"><extend type="start"/></lyric>`
      : ''
    return { xml: ext, open }
  }
  const syl = musicXmlSyllabicName(parsed.syllabic)
  const sylTag = syl ? `<syllabic>${syl}</syllabic>` : ''
  const ext = parsed.extendAfter ? `<extend type="start"/>` : ''
  return {
    xml: `<lyric number="1">${sylTag}<text>${esc(parsed.text)}</text>${ext}</lyric>`,
    open,
  }
}

function noteXmlFromEvent(
  e: SheetRhythmEvent,
  staff: SheetStaffSpec,
  project: TagRollProject,
  keyAlters: Map<string, number>,
  detectSegments: readonly SheetChordDetectSegment[] | null | undefined,
  siblings: readonly SheetRhythmEvent[],
  lyricOpen: boolean,
): { xml: string; lyricOpen: boolean } {
  const voice = e.voice
  const type = TYPE_XML[e.duration.type] ?? 'quarter'
  const stem = e.stemUp ? 'up' : 'down'
  if (e.concertMidi == null) {
    return {
      xml:
        `<note>` +
        `<rest/>` +
        `<duration>${e.durationTicks}</duration>` +
        `<voice>${voice}</voice>` +
        `<type>${type}</type>${dotsXml(e.duration.dots)}` +
        tupletTimeModXml(e) +
        `</note>`,
      lyricOpen,
    }
  }
  const written = concertToWrittenMidi(
    e.concertMidi,
    project.clefFamily,
    staff.kind === 'solo' ? 'upper' : staff.kind,
  )
  const spelled = spellWrittenMidi(written, project, e.startTick, detectSegments)
  const lyric = lyricXmlFromEvent(e, lyricOpen)
  const ties: string[] = []
  if (e.tieStop) ties.push('<tie type="stop"/>')
  if (e.tieStart) ties.push('<tie type="start"/>')
  const notations: string[] = []
  if (e.tieStop) notations.push('<tied type="stop"/>')
  if (e.tieStart) notations.push('<tied type="start"/>')
  const tupNot = tupletNotationXml(e)
  if (tupNot) notations.push(tupNot)
  const notXml = notations.length
    ? `<notations>${notations.join('')}</notations>`
    : ''
  return {
    xml:
      `<note>` +
      pitchAndAccidentalXml(spelled, keyAlters) +
      `<duration>${e.durationTicks}</duration>` +
      `<voice>${voice}</voice>` +
      `<type>${type}</type>${dotsXml(e.duration.dots)}` +
      tupletTimeModXml(e) +
      `<stem>${stem}</stem>` +
      beamXml(e, siblings) +
      ties.join('') +
      notXml +
      lyric.xml +
      `</note>`,
    lyricOpen: lyric.open,
  }
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

/** MusicXML `<harmony>` for a locked sketch span. */
export function harmonySketchToMusicXml(
  span: Pick<HarmonySketchSpan, 'rootPc' | 'quality'>,
  preferFlats: boolean,
  opts?: { tonality?: number; tonalityMode?: 'major' | 'minor' },
): string {
  const root = spellChordRoot(
    span.rootPc,
    preferFlats,
    opts?.tonality,
    opts?.tonalityMode ?? 'major',
  )
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

function attributesXml(opts: {
  ts: TagRollTimeSignature
  divisions: number
  tonality: number
  preferFlats: boolean
  mode: 'major' | 'minor'
  clef: SheetClefKind
  includeClef: boolean
  includeTime: boolean
  includeKey: boolean
}): string {
  const bits: string[] = []
  if (opts.includeClef || opts.includeTime || opts.includeKey) {
    bits.push(`<divisions>${opts.divisions}</divisions>`)
  }
  if (opts.includeKey) {
    const fifths = musicXmlFifths(opts.tonality, opts.preferFlats, opts.mode)
    bits.push(`<key><fifths>${fifths}</fifths><mode>${opts.mode}</mode></key>`)
  }
  if (opts.includeTime) {
    bits.push(
      `<time><beats>${opts.ts.numerator}</beats><beat-type>${opts.ts.denominator}</beat-type></time>`,
    )
  }
  if (opts.includeClef) bits.push(musicXmlClef(opts.clef))
  if (!bits.length) return ''
  return `<attributes>${bits.join('')}</attributes>`
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

function fermataDirectionsXml(
  project: TagRollProject,
  mLen: number,
  measureIndex: number,
): string {
  const mStart = measureIndex * mLen
  const mEnd = mStart + mLen
  const bits: string[] = []
  for (const e of project.expressions) {
    if (e.kind !== 'fermata') continue
    if (e.tick < mStart || e.tick >= mEnd) continue
    bits.push(
      `<direction placement="above"><direction-type><fermata type="upright"/></direction-type></direction>`,
    )
  }
  return bits.join('')
}

function emitStaffMeasure(opts: {
  staff: SheetStaffSpec
  measureEvents: SheetRhythmEvent[]
  project: TagRollProject
  mi: number
  mLen: number
  ppq: number
  detectSegments?: readonly SheetChordDetectSegment[] | null
  pendingHarmony: readonly HarmonySketchSpan[]
  emitHarmony: boolean
  prevKeySpec: string | null
}): { xml: string; keySpec: string } {
  const {
    staff,
    measureEvents,
    project,
    mi,
    mLen,
    ppq,
    detectSegments,
    pendingHarmony,
    emitHarmony,
  } = opts
  const startTick = mi * mLen
  const key = sheetKeyAtTick(project, startTick)
  const keySpec = sheetKeySpecAtTick(project, startTick)
  const keyChanged = opts.prevKeySpec != null && opts.prevKeySpec !== keySpec
  const includeKey = mi === 0 || keyChanged
  const attrs = attributesXml({
    ts: project.timeSignature,
    divisions: ppq,
    tonality: key.tonality,
    preferFlats: key.preferFlats,
    mode: key.tonalityMode,
    clef: staff.clef,
    includeClef: mi === 0,
    includeTime: mi === 0,
    includeKey,
  })
  const tempo = mi === 0 ? tempoDirectionXml(project.bpm || TAG_ROLL_DEFAULT_BPM) : ''
  const ferm = fermataDirectionsXml(project, mLen, mi)
  const keyAlters = keySignatureAlters(key.tonality, key.preferFlats, key.tonalityMode)

  const byVoice = new Map<1 | 2, SheetRhythmEvent[]>()
  for (const e of measureEvents) {
    const list = byVoice.get(e.voice) ?? []
    list.push(e)
    byVoice.set(e.voice, list)
  }
  for (const list of byVoice.values()) {
    list.sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))
  }

  const parts: string[] = []
  let hi = 0
  const flushHarmony = (tick: number) => {
    if (!emitHarmony) return
    while (hi < pendingHarmony.length && pendingHarmony[hi]!.startTick <= tick) {
      parts.push(
        harmonySketchToMusicXml(pendingHarmony[hi]!, preferFlatsAtTick(project, tick), {
          tonality: key.tonality,
          tonalityMode: key.tonalityMode,
        }),
      )
      hi++
    }
  }

  // Interleave voices in onset order (MusicXML backup for secondary voice).
  const v1 = byVoice.get(1) ?? []
  const v2 = byVoice.get(2) ?? []
  if (!v1.length && !v2.length) {
    // Empty staff voice — full-measure rest in voice 1.
    const restDur: MappedDuration = {
      type: mLen >= ppq * 4 ? 'whole' : mLen >= ppq * 2 ? 'half' : 'quarter',
      dots: 0,
      flags: 0,
      ticks: mLen,
    }
    const synthetic: SheetRhythmEvent = {
      id: `rest-${staff.id}-${mi}`,
      staffId: staff.id,
      partId: staff.voices[0]?.partId ?? '',
      color: '#000',
      voice: 1,
      stemUp: true,
      role: 'solo',
      startTick,
      durationTicks: mLen,
      concertMidi: null,
      tieStart: false,
      tieStop: false,
      duration: restDur,
      beamGroupId: null,
    }
    parts.push(
      noteXmlFromEvent(
        synthetic, staff, project, keyAlters, detectSegments, [synthetic], false,
      ).xml,
    )
  } else {
    // Emit voice 1 fully, then backup and voice 2 (standard MusicXML multi-voice).
    let open1 = false
    for (const e of v1) {
      flushHarmony(e.startTick)
      const out = noteXmlFromEvent(e, staff, project, keyAlters, detectSegments, v1, open1)
      parts.push(out.xml)
      open1 = out.lyricOpen
    }
    if (v2.length) {
      const v1Ticks = v1.reduce((s, e) => s + e.durationTicks, 0) || mLen
      parts.push(`<backup><duration>${v1Ticks}</duration></backup>`)
      let open2 = false
      for (const e of v2) {
        flushHarmony(e.startTick)
        const out = noteXmlFromEvent(e, staff, project, keyAlters, detectSegments, v2, open2)
        parts.push(out.xml)
        open2 = out.lyricOpen
      }
    }
  }
  flushHarmony(Number.POSITIVE_INFINITY)

  return {
    xml: `<measure number="${mi + 1}">${attrs}${tempo}${ferm}${parts.join('')}</measure>`,
    keySpec,
  }
}

export type ExportMusicXmlOpts = {
  chordDetectSegments?: readonly SheetChordDetectSegment[] | null
}

/** Build MusicXML 3.1 partwise document bytes (UTF-8). */
export function exportTagRollMusicXml(
  project: TagRollProject,
  opts?: ExportMusicXmlOpts,
): Uint8Array {
  const ppq = project.ppq || TAG_ROLL_PPQ
  const ts = project.timeSignature
  const mLen = measureTicks(ts, ppq)
  const lengthTicks = sheetEngraveLengthTicks(project, mLen)
  const assignment = assignSheetStaves(
    project.parts,
    project.clefFamily ?? 'ttbb',
    {
      melodyPartId: project.view.melodyPartId,
      notes: project.notes,
    },
  )
  const events = buildSheetRhythm({
    assignment,
    notes: project.notes,
    lengthTicks,
    timeSignature: ts,
    ppq,
    tuplets: project.tuplets,
    melodyPartAt: (tick) => melodyPartAtTick(project, tick),
  })

  const lockedSketch = (project.harmonySketch ?? [])
    .filter((s) => s.locked)
    .slice()
    .sort((a, b) => a.startTick - b.startTick)

  const melodyPartId =
    project.view.melodyPartId ??
    project.parts.find((p) => p.name === 'Lead')?.id ??
    null

  const measureCount = Math.max(1, Math.ceil(lengthTicks / mLen))
  const partList = assignment.staves
    .map((staff, i) => {
      const name = staff.labels.filter(Boolean).join(' · ') || `Staff ${i + 1}`
      return `<score-part id="P${i + 1}"><part-name>${esc(name)}</part-name></score-part>`
    })
    .join('')

  const partsXml = assignment.staves
    .map((staff, si) => {
      const staffEvents = events.filter((e) => e.staffId === staff.id)
      const emitHarmony =
        melodyPartId != null && staff.voices.some((v) => v.partId === melodyPartId)
      let prevKey: string | null = null
      const measureXml: string[] = []
      for (let mi = 0; mi < measureCount; mi++) {
        const startTick = mi * mLen
        const endTick = Math.min(lengthTicks, (mi + 1) * mLen)
        const measureEvents = staffEvents.filter(
          (e) => e.startTick >= startTick && e.startTick < endTick,
        )
        const pending = emitHarmony
          ? lockedSketch.filter((s) => s.startTick >= startTick && s.startTick < endTick)
          : []
        const { xml, keySpec } = emitStaffMeasure({
          staff,
          measureEvents,
          project,
          mi,
          mLen,
          ppq,
          detectSegments: opts?.chordDetectSegments,
          pendingHarmony: pending,
          emitHarmony,
          prevKeySpec: prevKey,
        })
        prevKey = keySpec
        measureXml.push(xml)
      }
      return `<part id="P${si + 1}">${measureXml.join('')}</part>`
    })
    .join('')

  const title = esc(project.title || 'Tag Studio')
  const subtitle = esc(project.subtitle || '')
  const composer = esc(project.composer || '')
  const arranger = esc(project.arranger || '')
  const sheetNote = esc(project.sheetNote || '')
  const creators =
    (composer ? `<creator type="composer">${composer}</creator>` : '') +
    (arranger ? `<creator type="arranger">${arranger}</creator>` : '')
  const credit = sheetNote
    ? `<credit page="1"><credit-type>footer</credit-type><credit-words>${sheetNote}</credit-words></credit>`
    : ''
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">` +
    `<score-partwise version="3.1">` +
    `<work><work-title>${title}</work-title></work>` +
    (subtitle ? `<movement-title>${subtitle}</movement-title>` : '') +
    `<identification>` +
    (creators || '') +
    `<encoding><software>SingTags Tag Studio</software></encoding>` +
    `</identification>` +
    credit +
    `<part-list>${partList}</part-list>` +
    partsXml +
    `</score-partwise>`

  return new TextEncoder().encode(xml)
}

export function downloadTagRollMusicXml(
  project: TagRollProject,
  opts?: ExportMusicXmlOpts,
): void {
  const bytes = exportTagRollMusicXml(project, opts)
  const blob = new Blob(
    [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
    { type: 'application/vnd.recordare.musicxml+xml' },
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.title.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'tag-roll'}.musicxml`
  a.click()
  URL.revokeObjectURL(url)
}
