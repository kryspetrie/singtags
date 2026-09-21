/**
 * SMF Type 1 MIDI export for arrangement projects (TTBB tracks).
 * Pattern adapted from SingTags tagRoll/midiExport.ts.
 */
import type { ArrangementProject } from '../../../domain/arranging/types'
import { justCentsForVoicing } from '../../../domain/arranging/justIntonation'
import { centsToPitchBend } from '../../../domain/arranging/justIntonation'
import type { ArrangementMidiExportOptions, ArrangementMidiExporter } from '../../../ports/ArrangementMidiExporter'

const VOICE_ORDER = ['tenor', 'lead', 'bari', 'bass'] as const
type Voice = (typeof VOICE_ORDER)[number]

function writeVarLen(n: number, out: number[]): void {
  let buffer = n & 0x7f
  while ((n >>= 7) > 0) {
    buffer <<= 8
    buffer |= (n & 0x7f) | 0x80
  }
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

/** RPN bend range as four discrete CC events (each is its own SMF event). */
export function bendRangeEvents(channel: number, semitones: number): number[][] {
  const ch = channel & 0x0f
  return [
    [0xb0 | ch, 101, 0],
    [0xb0 | ch, 100, 0],
    [0xb0 | ch, 6, semitones & 0x7f],
    [0xb0 | ch, 38, 0],
  ]
}

function encodePitchBend(channel: number, cents: number, bendRange: number): number[] {
  const bend = centsToPitchBend(cents, bendRange)
  const status = 0xe0 | (channel & 0x0f)
  return [status, bend & 0x7f, (bend >> 7) & 0x7f]
}

function clampNote(n: number): number {
  return Math.max(0, Math.min(127, Math.round(n)))
}

type MidiEv = { tick: number; data: number[] }

function buildVoiceTrack(
  project: ArrangementProject,
  voice: Voice,
  channel: number,
  includeTempo: boolean,
  options: ArrangementMidiExportOptions,
): number[] {
  const events: MidiEv[] = []
  const bendRange = options.bendRangeSemitones ?? 2
  events.push({ tick: 0, data: encodeTrackName(voice) })
  if (includeTempo) {
    events.push({ tick: 0, data: encodeTempo(project.bpm || 100) })
  }
  if (options.justIntonation) {
    for (const data of bendRangeEvents(channel, bendRange)) {
      events.push({ tick: 0, data })
    }
  }

  for (const s of project.stacks) {
    if (!s.midi) continue
    const midi = clampNote(s.midi[voice])
    const useJi = !!options.justIntonation
    const cents = useJi
      ? (justCentsForVoicing({
          natureId: s.natureId,
          rootPc: s.rootPc,
          voicing: s.voicing,
          leadMidi: s.midi.lead,
        })?.[voice] ?? 0)
      : 0

    if (useJi) {
      events.push({
        tick: s.startTick,
        data: encodePitchBend(channel, cents, bendRange),
      })
    }
    events.push({
      tick: s.startTick,
      data: [0x90 | (channel & 0x0f), midi, 0x50],
    })
    events.push({
      tick: s.startTick + s.durationTicks,
      data: [0x80 | (channel & 0x0f), midi, 0x40],
    })
  }

  if (voice === 'lead') {
    for (const n of project.melody) {
      if (n.lyric) {
        events.push({ tick: n.startTick, data: encodeLyric(n.lyric) })
      }
    }
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
  bytes.push(0xff, 0x2f, 0x00)
  return bytes
}

function wrapTrack(data: number[]): number[] {
  const len = data.length
  return [
    0x4d, 0x54, 0x72, 0x6b,
    (len >> 24) & 0xff,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
    ...data,
  ]
}

export function exportArrangementMidi(
  project: ArrangementProject,
  options: ArrangementMidiExportOptions = {},
): Uint8Array {
  const trackChunks = VOICE_ORDER.map((voice, i) =>
    wrapTrack(buildVoiceTrack(project, voice, i, i === 0, options)),
  )
  const nTracks = trackChunks.length
  const ppq = project.ppq
  const header = [
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1,
    (nTracks >> 8) & 0xff,
    nTracks & 0xff,
    (ppq >> 8) & 0xff,
    ppq & 0xff,
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

export function createArrangementMidiExporter(): ArrangementMidiExporter {
  return {
    export: (project, options) => exportArrangementMidi(project, options),
  }
}

export function downloadMidiBytes(bytes: Uint8Array, title: string): void {
  const copy = new Uint8Array(bytes)
  const blob = new Blob([copy], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'arrangement'}.mid`
  a.click()
  URL.revokeObjectURL(url)
}
