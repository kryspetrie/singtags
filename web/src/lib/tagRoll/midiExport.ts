/**
 * Minimal SMF Type 1 MIDI export for Tag Roll.
 */
import type { TagRollNote, TagRollPart, TagRollProject } from './types'
import { TAG_ROLL_PPQ } from './types'

export type MidiExportMode = 'one' | 'two' | 'all'

function writeVarLen(n: number, out: number[]): void {
  let buffer = n & 0x7f
  while ((n >>= 7) > 0) {
    buffer <<= 8
    buffer |= (n & 0x7f) | 0x80
  }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    out.push(buffer & 0xff)
    if (buffer & 0x80) buffer >>= 8
    else break
  }
}

function encodeTrackName(name: string): number[] {
  const bytes = [...new TextEncoder().encode(name.slice(0, 64))]
  return [0xff, 0x03, bytes.length, ...bytes]
}

function encodeTempo(bpm: number): number[] {
  const us = Math.round(60_000_000 / Math.max(1, bpm))
  return [0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff]
}

function encodeLyric(text: string): number[] {
  const bytes = [...new TextEncoder().encode(text.slice(0, 64))]
  return [0xff, 0x05, bytes.length, ...bytes]
}

type MidiEv = { tick: number; data: number[] }

function buildTrackEvents(
  notes: TagRollNote[],
  channel: number,
  includeTempo: boolean,
  bpm: number,
  trackName?: string,
): number[] {
  const events: MidiEv[] = []
  if (trackName) events.push({ tick: 0, data: encodeTrackName(trackName) })
  if (includeTempo) events.push({ tick: 0, data: encodeTempo(bpm) })

  for (const n of notes) {
    const ch = channel & 0x0f
    if (n.lyric) {
      events.push({ tick: n.startTick, data: encodeLyric(n.lyric) })
    }
    events.push({
      tick: n.startTick,
      data: [0x90 | ch, n.midi & 0x7f, 0x50],
    })
    events.push({
      tick: n.startTick + n.durationTicks,
      data: [0x80 | ch, n.midi & 0x7f, 0x40],
    })
  }
  events.sort((a, b) => a.tick - b.tick || a.data[0]! - b.data[0]!)

  const bytes: number[] = []
  let last = 0
  for (const ev of events) {
    writeVarLen(Math.max(0, ev.tick - last), bytes)
    bytes.push(...ev.data)
    last = ev.tick
  }
  writeVarLen(0, bytes)
  bytes.push(0xff, 0x2f, 0x00) // end of track
  return bytes
}

function wrapTrack(data: number[]): number[] {
  const len = data.length
  return [
    0x4d,
    0x54,
    0x72,
    0x6b,
    (len >> 24) & 0xff,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
    ...data,
  ]
}

function groupPartsForMode(
  parts: TagRollPart[],
  notes: TagRollNote[],
  mode: MidiExportMode,
): { name: string; notes: TagRollNote[] }[] {
  if (mode === 'one') {
    return [{ name: 'Tag Roll', notes: [...notes] }]
  }
  if (mode === 'all') {
    return parts.map((p) => ({
      name: p.name,
      notes: notes.filter((n) => n.partId === p.id),
    }))
  }
  // two tracks: upper / lower; solo by median pitch of that part's notes
  const allMidi = notes.map((n) => n.midi)
  const median =
    allMidi.length === 0
      ? 60
      : [...allMidi].sort((a, b) => a - b)[Math.floor(allMidi.length / 2)]!
  const upper: TagRollNote[] = []
  const lower: TagRollNote[] = []
  for (const n of notes) {
    const part = parts.find((p) => p.id === n.partId)
    let bucket: 'upper' | 'lower' = 'upper'
    if (part?.midiGroup === 'lower') bucket = 'lower'
    else if (part?.midiGroup === 'upper') bucket = 'upper'
    else {
      const partNotes = notes.filter((x) => x.partId === n.partId)
      const mid =
        partNotes.reduce((s, x) => s + x.midi, 0) / Math.max(1, partNotes.length)
      bucket = mid >= median ? 'upper' : 'lower'
    }
    ;(bucket === 'upper' ? upper : lower).push(n)
  }
  return [
    { name: 'Upper (Lead/Tenor)', notes: upper },
    { name: 'Lower (Bari/Bass)', notes: lower },
  ]
}

export function exportTagRollMidi(
  project: TagRollProject,
  mode: MidiExportMode,
): Uint8Array {
  const tracks = groupPartsForMode(project.parts, project.notes, mode).filter(
    (t) => t.notes.length > 0 || mode === 'one',
  )
  const trackChunks = tracks.map((t, i) =>
    wrapTrack(
      buildTrackEvents(t.notes, i % 16, i === 0, project.bpm, t.name),
    ),
  )
  const nTracks = trackChunks.length
  const header = [
    0x4d,
    0x54,
    0x68,
    0x64,
    0,
    0,
    0,
    6,
    0,
    1, // format 1
    (nTracks >> 8) & 0xff,
    nTracks & 0xff,
    (TAG_ROLL_PPQ >> 8) & 0xff,
    TAG_ROLL_PPQ & 0xff,
  ]
  const all = new Uint8Array(header.length + trackChunks.reduce((s, t) => s + t.length, 0))
  let o = 0
  all.set(header, o)
  o += header.length
  for (const t of trackChunks) {
    all.set(t, o)
    o += t.length
  }
  return all
}

export function downloadTagRollMidi(project: TagRollProject, mode: MidiExportMode): void {
  const bytes = exportTagRollMidi(project, mode)
  const blob = new Blob([bytes], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.title.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'tag-roll'}.mid`
  a.click()
  URL.revokeObjectURL(url)
}
