/**
 * MusicXML → Tag Studio project import.
 *
 * Mapping rules:
 * - Multiple monophonic parts/staves → tracks top-down as Tenor / Lead / Bari / Bass,
 *   then named parts for anything beyond.
 * - Grand-staff style (staff 1 + staff 2 with multiple voices) → explode voices into
 *   Tenor/Lead (top clef) and Bari/Bass (bottom clef); further staves/voices become
 *   additional named parts.
 */
import { unzipSync } from 'fflate'
import { allocatePrefixedId, newTagRollProjectId } from './ids'
import { createDefaultKeyMarkers } from './keyMap'
import { createEmptyTagRollProject } from './normalize'
import { syncProjectMix } from './mix'
import { createDefaultTempoMarkers } from './tempoMap'
import {
  TAG_ROLL_DEFAULT_PARTS,
  TAG_ROLL_PPQ,
  type TagRollMidiGroup,
  type TagRollNote,
  type TagRollPart,
  type TagRollProject,
  type TagRollTimeSignature,
} from './types'

const STEP_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

const EXTRA_PART_COLORS = ['#6b7280', '#b45309', '#0f766e', '#7c3aed', '#be123c', '#0369a1'] as const

export type MusicXmlImportResult =
  | { ok: true; project: TagRollProject }
  | { ok: false; error: string }

type RawNote = {
  staff: number
  voice: number
  midi: number
  startTick: number
  durationTicks: number
  lyric?: string
  tieStart: boolean
  tieStop: boolean
}

type StreamKey = string

function streamKey(staff: number, voice: number): StreamKey {
  return `${staff}:${voice}`
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').trim()
}

function child(el: Element, name: string): Element | null {
  for (const c of Array.from(el.children)) {
    if (c.localName === name) return c
  }
  return null
}

function children(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === name)
}

function musicXmlPitchToMidi(pitchEl: Element): number | null {
  const step = text(child(pitchEl, 'step')).toUpperCase()
  const octave = Number(text(child(pitchEl, 'octave')))
  const alter = Number(text(child(pitchEl, 'alter')) || '0')
  if (!(step in STEP_PC) || !Number.isFinite(octave)) return null
  const pc = STEP_PC[step]! + (Number.isFinite(alter) ? alter : 0)
  const midi = (octave + 1) * 12 + pc
  if (!Number.isFinite(midi) || midi < 0 || midi > 127) return null
  return Math.round(midi)
}

/** MusicXML duration/onset divisions → Tag Roll ticks (0 allowed for measure-relative onset). */
function divisionsToTicks(duration: number, divisions: number): number {
  const div = Math.max(1, divisions)
  return Math.max(0, Math.round((duration / div) * TAG_ROLL_PPQ))
}

/** Note length in ticks; never zero so a pitched event always occupies the roll. */
function durationToTicks(duration: number, divisions: number): number {
  return Math.max(1, divisionsToTicks(duration, divisions))
}

/**
 * Unpack .musicxml / .xml text, or .mxl (zipped MusicXML container).
 */
export async function musicXmlTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const buf = new Uint8Array(await file.arrayBuffer())
  if (name.endsWith('.mxl') || (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b)) {
    const files = unzipSync(buf)
    const names = Object.keys(files)
    const metaName = names.find((n) => /(^|\/)META-INF\/container\.xml$/i.test(n))
    if (metaName) {
      const metaXml = new TextDecoder().decode(files[metaName]!)
      const rootHref = metaXml.match(/full-path\s*=\s*"([^"]+)"/i)?.[1]
      if (rootHref) {
        const key = names.find((n) => n === rootHref || n.endsWith('/' + rootHref))
        if (key && files[key]) return new TextDecoder().decode(files[key]!)
      }
    }
    const score = names.find(
      (n) =>
        !n.startsWith('META-INF/') &&
        (n.toLowerCase().endsWith('.musicxml') || n.toLowerCase().endsWith('.xml')),
    )
    if (score && files[score]) return new TextDecoder().decode(files[score]!)
    throw new Error('MXL archive has no MusicXML score')
  }
  return new TextDecoder().decode(buf)
}

/** Pitched note still in measure-relative divisions (absolute ticks assigned later). */
type MeasureNote = {
  staff: number
  voice: number
  midi: number
  onsetDiv: number
  durDiv: number
  lyric?: string
  tieStart: boolean
  tieStop: boolean
}

type ParsedMeasure = {
  contentDiv: number
  divisions: number
  implicit: boolean
  notes: MeasureNote[]
}

type ParsedPart = {
  id: string
  name: string
  /** Optional Sibelius-style display names per voice (e.g. Tenor / Lead). */
  voiceNames: string[]
  measures: ParsedMeasure[]
  notes: RawNote[]
  maxStaff: number
  streams: StreamKey[]
}

/** Read a positive int from a direct child or descendant (Sibelius voice/staff). */
function noteInt(el: Element, name: string, fallback: number): number {
  const node =
    child(el, name) ?? (el.getElementsByTagName(name).item(0) as Element | null)
  const n = Number(text(node) || '')
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback
}

function parseScorePartVoiceNames(scorePart: Element): string[] {
  const display = child(scorePart, 'part-name-display')
  if (!display) return []
  return children(display, 'display-text')
    .map((el) => text(el))
    .filter(Boolean)
}

/**
 * Parse one MusicXML `<part>` into measure-relative notes. Absolute ticks are
 * assigned later so all parts share one pickup / measure grid.
 */
function parsePartMeasures(partEl: Element): {
  measures: ParsedMeasure[]
  maxStaff: number
  timeSig: TagRollTimeSignature | null
  bpm: number | null
  fifths: number | null
  mode: 'major' | 'minor' | null
} {
  const measuresOut: ParsedMeasure[] = []
  let divisions = 1
  let maxStaff = 1
  let timeSig: TagRollTimeSignature | null = null
  let bpm: number | null = null
  let fifths: number | null = null
  let mode: 'major' | 'minor' | null = null

  for (const measure of children(partEl, 'measure')) {
    let cursorDiv = 0
    let lastNoteOnsetDiv = 0
    let measureDivs = 0
    const notes: MeasureNote[] = []

    for (const el of Array.from(measure.children)) {
      const tag = el.localName
      if (tag === 'attributes') {
        const divText = text(child(el, 'divisions'))
        if (divText) divisions = Math.max(1, Number(divText) || divisions)
        const time = child(el, 'time')
        if (time && !timeSig) {
          const beats = Number(text(child(time, 'beats')) || '4')
          const beatType = Number(text(child(time, 'beat-type')) || '4')
          if (beats > 0 && beatType > 0) {
            timeSig = { numerator: beats, denominator: beatType }
          }
        }
        const key = child(el, 'key')
        if (key && fifths == null) {
          const f = Number(text(child(key, 'fifths')) || '0')
          if (Number.isFinite(f)) fifths = f
          const m = text(child(key, 'mode')).toLowerCase()
          if (m === 'minor') mode = 'minor'
          else if (m === 'major') mode = 'major'
        }
        continue
      }
      if (tag === 'direction') {
        const sound = child(el, 'sound')
        const tempoAttr = sound?.getAttribute('tempo')
        if (tempoAttr && bpm == null) {
          const t = Number(tempoAttr)
          if (t > 0) bpm = t
        }
        const metronome = child(child(el, 'direction-type') ?? el, 'metronome')
        if (metronome && bpm == null) {
          const perMin = Number(text(child(metronome, 'per-minute')) || '0')
          if (perMin > 0) bpm = perMin
        }
        continue
      }
      if (tag === 'backup') {
        const d = Number(text(child(el, 'duration')) || '0')
        cursorDiv = Math.max(0, cursorDiv - d)
        continue
      }
      if (tag === 'forward') {
        const d = Number(text(child(el, 'duration')) || '0')
        cursorDiv += Math.max(0, d)
        measureDivs = Math.max(measureDivs, cursorDiv)
        continue
      }
      if (tag !== 'note') continue

      const isChord = !!child(el, 'chord')
      const isRest = !!child(el, 'rest') || !!el.getElementsByTagName('rest').item(0)
      const isGrace = !!child(el, 'grace')
      const durDiv = Number(text(child(el, 'duration')) || '0')
      const staff = noteInt(el, 'staff', 1)
      const voice = noteInt(el, 'voice', 1)
      maxStaff = Math.max(maxStaff, staff)

      if (isGrace) continue

      const onsetDiv = isChord ? lastNoteOnsetDiv : cursorDiv
      if (!isChord) {
        lastNoteOnsetDiv = cursorDiv
        cursorDiv += Math.max(0, durDiv)
        measureDivs = Math.max(measureDivs, cursorDiv)
      }

      if (isRest || durDiv <= 0) continue
      const pitchEl = child(el, 'pitch') ?? (el.getElementsByTagName('pitch').item(0) as Element | null)
      if (!pitchEl) continue
      const midi = musicXmlPitchToMidi(pitchEl)
      if (midi == null) continue

      const lyricEl = child(el, 'lyric')
      const lyric = lyricEl ? text(child(lyricEl, 'text')) || undefined : undefined
      const ties = children(el, 'tie')
      const notationsTies = children(child(el, 'notations') ?? el, 'tied')
      const tieStart =
        ties.some((t) => t.getAttribute('type') === 'start') ||
        notationsTies.some((t) => t.getAttribute('type') === 'start')
      const tieStop =
        ties.some((t) => t.getAttribute('type') === 'stop') ||
        notationsTies.some((t) => t.getAttribute('type') === 'stop')

      notes.push({
        staff,
        voice,
        midi,
        onsetDiv,
        durDiv,
        ...(lyric ? { lyric } : {}),
        tieStart,
        tieStop,
      })
    }

    measuresOut.push({
      contentDiv: measureDivs,
      divisions,
      implicit: measure.getAttribute('implicit') === 'yes',
      notes,
    })
  }

  return { measures: measuresOut, maxStaff, timeSig, bpm, fifths, mode }
}

/**
 * Assign absolute ticks so every MusicXML part shares one measure grid.
 * Short opening / implicit pickups are right-aligned onto a full written bar
 * so the following chorus downbeat lands on a Tag Studio measure boundary.
 */
function materializeSharedTimeline(
  parts: ParsedPart[],
  timeSig: TagRollTimeSignature,
): void {
  const measureCount = Math.max(0, ...parts.map((p) => p.measures.length))
  if (!measureCount) return

  let measureStartTick = 0
  let divisions = 1
  for (let mi = 0; mi < measureCount; mi++) {
    for (const p of parts) {
      const m = p.measures[mi]
      if (m) divisions = Math.max(1, m.divisions || divisions)
    }
    const fullMeasureDiv = Math.max(
      1,
      Math.round((timeSig.numerator * divisions * 4) / timeSig.denominator),
    )
    const contentDiv = Math.max(0, ...parts.map((p) => p.measures[mi]?.contentDiv ?? 0))
    const implicit = parts.some((p) => p.measures[mi]?.implicit)
    const hasNext = parts.some((p) => (p.measures[mi + 1]?.contentDiv ?? 0) > 0)
    const nextContent = Math.max(0, ...parts.map((p) => p.measures[mi + 1]?.contentDiv ?? 0))
    const nextLooksFull = nextContent >= fullMeasureDiv * 0.95
    const leftAligned =
      contentDiv > 0 &&
      parts.some((p) =>
        (p.measures[mi]?.notes ?? []).some((n) => n.onsetDiv === 0),
      )
    const shouldRightAlign =
      contentDiv > 0 &&
      contentDiv < fullMeasureDiv &&
      leftAligned &&
      (implicit || (mi === 0 && (nextLooksFull || hasNext)))

    const padDiv = shouldRightAlign ? fullMeasureDiv - contentDiv : 0
    // Keep every part on the same advance (max content, or full bar when padded).
    let advanceDiv = contentDiv > 0 ? contentDiv : fullMeasureDiv
    if (shouldRightAlign) advanceDiv = fullMeasureDiv

    for (const p of parts) {
      const m = p.measures[mi]
      if (!m) continue
      const div = Math.max(1, m.divisions || divisions)
      for (const n of m.notes) {
        p.notes.push({
          staff: n.staff,
          voice: n.voice,
          midi: n.midi,
          startTick: measureStartTick + divisionsToTicks(n.onsetDiv + padDiv, div),
          durationTicks: durationToTicks(n.durDiv, div),
          ...(n.lyric ? { lyric: n.lyric } : {}),
          tieStart: n.tieStart,
          tieStop: n.tieStop,
        })
      }
    }

    measureStartTick += divisionsToTicks(Math.max(1, advanceDiv), divisions)
  }

  for (const p of parts) {
    p.streams = streamKeysFromNotes(p.notes)
    if (!p.streams.length) p.streams = ['1:1']
  }
}

function mergeTies(notes: RawNote[]): RawNote[] {
  const sorted = [...notes].sort(
    (a, b) =>
      a.staff - b.staff ||
      a.voice - b.voice ||
      a.startTick - b.startTick ||
      a.midi - b.midi,
  )
  const out: RawNote[] = []
  for (const n of sorted) {
    if (n.tieStop) {
      const prev = [...out]
        .reverse()
        .find(
          (p) =>
            p.staff === n.staff &&
            p.voice === n.voice &&
            p.midi === n.midi &&
            p.tieStart &&
            p.startTick + p.durationTicks <= n.startTick + 2,
        )
      if (prev) {
        const end = Math.max(prev.startTick + prev.durationTicks, n.startTick + n.durationTicks)
        prev.durationTicks = end - prev.startTick
        prev.tieStart = n.tieStart
        if (n.lyric && !prev.lyric) prev.lyric = n.lyric
        continue
      }
    }
    out.push({ ...n })
  }
  return out
}

function streamKeysFromNotes(notes: RawNote[]): StreamKey[] {
  const set = new Set<StreamKey>()
  for (const n of notes) set.add(streamKey(n.staff, n.voice))
  return [...set].sort((a, b) => {
    const [sa, va] = a.split(':').map(Number) as [number, number]
    const [sb, vb] = b.split(':').map(Number) as [number, number]
    return sa - sb || va - vb
  })
}

function partLooksMultiVoice(p: ParsedPart): boolean {
  return p.maxStaff >= 2 || p.streams.length >= 2
}

function fifthsToTonality(fifths: number): { tonality: number; preferFlats: boolean } {
  // Circle of fifths → tonic pitch class (C=0). Positive fifths = sharps.
  const pc = (((fifths * 7) % 12) + 12) % 12
  return { tonality: pc, preferFlats: fifths < 0 }
}

function defaultPartMeta(index: number, fallbackName: string): Omit<TagRollPart, 'id'> {
  const stock = TAG_ROLL_DEFAULT_PARTS[index]
  if (stock) return { ...stock }
  const color = EXTRA_PART_COLORS[(index - 4) % EXTRA_PART_COLORS.length]!
  const midiGroup: TagRollMidiGroup = index % 2 === 0 ? 'upper' : 'lower'
  const name =
    fallbackName.trim() && !/^P\d+$/i.test(fallbackName.trim())
      ? fallbackName.trim()
      : `Part ${index + 1}`
  return { name, color, midiGroup }
}

function buildProjectFromStreams(
  streams: { nameHint: string; notes: RawNote[] }[],
  meta: {
    title: string
    subtitle?: string
    composer?: string
    arranger?: string
    sheetNote?: string
    bpm: number
    timeSig: TagRollTimeSignature
    tonality: number
    preferFlats: boolean
    mode: 'major' | 'minor'
  },
): TagRollProject {
  const base = createEmptyTagRollProject({ title: meta.title })
  const parts: TagRollPart[] = streams.map((s, i) => ({
    id: allocatePrefixedId('trp'),
    ...defaultPartMeta(i, s.nameHint),
  }))
  const noteRows: TagRollNote[] = []
  let maxEnd = 0
  for (let i = 0; i < streams.length; i++) {
    const part = parts[i]!
    const merged = mergeTies(streams[i]!.notes)
    for (const n of merged) {
      noteRows.push({
        id: allocatePrefixedId('trn'),
        partId: part.id,
        midi: n.midi,
        startTick: n.startTick,
        durationTicks: n.durationTicks,
        ...(n.lyric ? { lyric: n.lyric } : {}),
      })
      maxEnd = Math.max(maxEnd, n.startTick + n.durationTicks)
    }
  }
  const lead = parts.find((p) => p.name === 'Lead') ?? parts[0]!
  const lengthTicks = Math.max(
    base.lengthTicks,
    Math.ceil(maxEnd / TAG_ROLL_PPQ) * TAG_ROLL_PPQ + TAG_ROLL_PPQ * 4,
  )
  return {
    ...base,
    id: newTagRollProjectId(),
    title: meta.title,
    subtitle: meta.subtitle ?? '',
    composer: meta.composer ?? '',
    arranger: meta.arranger ?? '',
    sheetNote: meta.sheetNote ?? '',
    bpm: meta.bpm,
    timeSignature: meta.timeSig,
    tempoMarkers: createDefaultTempoMarkers(meta.bpm),
    keyMarkers: createDefaultKeyMarkers(meta.tonality, meta.mode, meta.preferFlats),
    tonality: meta.tonality,
    tonalityMode: meta.mode,
    preferFlats: meta.preferFlats,
    parts,
    mix: syncProjectMix(parts, null),
    notes: noteRows,
    lengthTicks,
    view: {
      ...base.view,
      activePartId: lead.id,
      melodyPartId: lead.id,
    },
  }
}

/**
 * Parse MusicXML (partwise) text into a Tag Studio project.
 */
export function parseTagRollMusicXml(xmlText: string): MusicXmlImportResult {
  const trimmed = xmlText.replace(/^\uFEFF/, '').trim()
  if (!trimmed) return { ok: false, error: 'File is empty' }

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(trimmed, 'application/xml')
  } catch {
    return { ok: false, error: 'Could not parse MusicXML' }
  }
  const parseErr = doc.querySelector('parsererror')
  if (parseErr) return { ok: false, error: 'Invalid MusicXML (parse error)' }

  const root = doc.documentElement
  if (!root || root.localName !== 'score-partwise') {
    return {
      ok: false,
      error:
        root?.localName === 'score-timewise'
          ? 'Timewise MusicXML is not supported yet — export as partwise'
          : 'Expected a MusicXML score-partwise document',
    }
  }

  const workTitle = text(doc.querySelector('work-title'))
  const movementTitle = text(doc.querySelector('movement-title'))
  const title = workTitle || movementTitle || 'Imported MusicXML'
  const subtitle = workTitle && movementTitle && movementTitle !== workTitle ? movementTitle : ''

  let composer = ''
  let arranger = ''
  for (const el of Array.from(doc.querySelectorAll('identification creator'))) {
    const type = (el.getAttribute('type') || '').toLowerCase()
    const val = text(el)
    if (!val) continue
    if (type === 'arranger') {
      if (!arranger) arranger = val
    } else if (type === 'composer' || type === '') {
      if (!composer) composer = val
    }
  }

  let sheetNote = ''
  for (const credit of Array.from(doc.querySelectorAll('credit'))) {
    const types = Array.from(credit.querySelectorAll('credit-type')).map((t) =>
      text(t).toLowerCase(),
    )
    if (types.includes('footer') || types.includes('note')) {
      const words = text(credit.querySelector('credit-words'))
      if (words) {
        sheetNote = words
        break
      }
    }
  }

  const partList = child(root, 'part-list')
  const scoreParts = partList ? children(partList, 'score-part') : []
  const nameById = new Map<string, string>()
  const voiceNamesById = new Map<string, string[]>()
  for (const sp of scoreParts) {
    const id = sp.getAttribute('id') || ''
    const name = text(child(sp, 'part-name')) || id
    if (id) {
      nameById.set(id, name)
      voiceNamesById.set(id, parseScorePartVoiceNames(sp))
    }
  }

  const partEls = children(root, 'part')
  if (!partEls.length) return { ok: false, error: 'MusicXML has no parts' }

  const parsed: ParsedPart[] = []
  let timeSig: TagRollTimeSignature = { numerator: 4, denominator: 4 }
  let bpm = 104
  let fifths = 0
  let mode: 'major' | 'minor' = 'major'

  for (const partEl of partEls) {
    const id = partEl.getAttribute('id') || `P${parsed.length + 1}`
    const { measures, maxStaff, timeSig: ts, bpm: b, fifths: f, mode: m } =
      parsePartMeasures(partEl)
    if (ts) timeSig = ts
    if (b != null) bpm = b
    if (f != null) fifths = f
    if (m) mode = m
    parsed.push({
      id,
      name: nameById.get(id) || id,
      voiceNames: voiceNamesById.get(id) ?? [],
      measures,
      notes: [],
      maxStaff,
      streams: ['1:1'],
    })
  }

  materializeSharedTimeline(parsed, timeSig)

  const { tonality, preferFlats } = fifthsToTonality(fifths)
  const meta = {
    title,
    subtitle,
    composer,
    arranger,
    sheetNote,
    bpm,
    timeSig,
    tonality,
    preferFlats,
    mode,
  }

  // Always explode when any part has multiple voices/staves (mixed polecat SA–TB,
  // Sibelius "Tenor Lead" / "Bari Bass", grand staff, …).
  const explode = parsed.some((p) => partLooksMultiVoice(p))

  if (explode) {
    const streams: { nameHint: string; notes: RawNote[] }[] = []
    for (const p of parsed) {
      const keys = streamKeysFromNotes(p.notes)
      const ordered = keys.length ? keys : ['1:1']
      // Voice index within this MusicXML part (0 = first voice stream).
      let voiceOrdinal = 0
      for (const key of ordered) {
        const [staff, voice] = key.split(':').map(Number) as [number, number]
        const slice = p.notes.filter((n) => n.staff === staff && n.voice === voice)
        if (!slice.length) continue
        const named = p.voiceNames[voiceOrdinal]?.trim()
        const hint =
          named ||
          (ordered.length === 1 && parsed.length > 1
            ? p.name
            : `${p.name} s${staff}v${voice}`)
        streams.push({ nameHint: hint, notes: slice })
        voiceOrdinal++
      }
    }
    if (!streams.length) return { ok: false, error: 'No pitched notes found in MusicXML' }
    return { ok: true, project: buildProjectFromStreams(streams, meta) }
  }

  // Multi-part monophonic: one MusicXML part → one Tag Studio track (top-down TTBB).
  const streams = parsed.map((p) => ({
    nameHint: p.name,
    notes: p.notes,
  }))
  if (!streams.some((s) => s.notes.length)) {
    return { ok: false, error: 'No pitched notes found in MusicXML' }
  }
  return { ok: true, project: buildProjectFromStreams(streams, meta) }
}

export async function readTagRollMusicXmlFile(file: File): Promise<MusicXmlImportResult> {
  try {
    const textXml = await musicXmlTextFromFile(file)
    return parseTagRollMusicXml(textXml)
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to read MusicXML file',
    }
  }
}
