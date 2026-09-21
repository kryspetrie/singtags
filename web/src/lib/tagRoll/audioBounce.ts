/**
 * Offline bounce of Tag Roll notes to WAV/MP3 (simple oscillators — reliable offline).
 * Uses the project tempo map (markers, rit/accel, fermatas) for wall-clock timing.
 * Per-part monophonic: overlaps glide with ease-in-out; attack/decay from soundEnvelope.
 * Part-left learning tracks match Tag-page reconstruct: featured hard L, accompaniment
 * hard R with {@link sideVoiceGain}; Mix uses fixed barbershop equal-power pans.
 */
import { sideVoiceGain } from '../../audio/multiPartMix'
import { equalPowerPanGains, mixPanForPart } from '../../audio/partLeftReconstruct'
import { createAudioBuffer } from '../../audio/audioBufferFactory'
import { encodeAudioBuffer } from '../../download/encode'
import { audioBufferToWav } from '../../download/transform'
import { planBlowPitch, prependAudioBuffer, renderBlowPitchBufferAsync } from './blowPitch'
import { noteSoundSegments } from './fermataNoteSplit'
import { measureStartTick } from './measureBeat'
import {
  findOverlappingPredecessor,
  frequencyEaseInOutCurve,
  midiToHz,
  overlapWindow,
  shouldDecayOnNoteEnd,
} from './portamento'
import { releaseSecForNoteEnd, TAG_ROLL_DEFAULT_SOUND_ENVELOPE } from './soundEnvelope'
import { TAG_ROLL_DEFAULT_SWING, wallSecondsAtScoreTick } from './swingMap'
import { secondsAtTick } from './tempoMap'
import type { TagRollNote, TagRollProject } from './types'
import { TAG_ROLL_DEFAULT_BPM, TAG_ROLL_PPQ } from './types'

export const TAG_ROLL_BOUNCE_MAX_SECONDS = 180

/** @deprecated Prefer secondsAtTick(project…) for variable tempo. */
export function ticksToSec(ticks: number, bpm: number): number {
  return (ticks / 480) * (60 / Math.max(1, bpm))
}

export function partSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}

/** Safe download / zip entry name fragment. */
export function safeTrackNamePart(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'track'
}

/** Hosted-style filename: `Lilly Marlene - Lead.mp3`. */
export function bounceTrackFilename(title: string, label: string, ext: string): string {
  return `${safeTrackNamePart(title)} - ${safeTrackNamePart(label)}.${ext}`
}

/**
 * Start of the first measure that contains any note (0 when empty).
 * Exports trim leading empty measures so playback begins with content.
 */
export function firstContentMeasureTick(project: TagRollProject): number {
  if (!project.notes.length) return 0
  let min = Infinity
  for (const n of project.notes) min = Math.min(min, n.startTick)
  if (!Number.isFinite(min)) return 0
  return measureStartTick(min, project.timeSignature, project.ppq || TAG_ROLL_PPQ)
}

/** Drop samples before `startTick` (tempo-map + swing aware). */
export function trimBufferFromTick(
  buf: AudioBuffer,
  project: TagRollProject,
  startTick: number,
): AudioBuffer {
  if (!(startTick > 0)) return buf
  const startSec = tickSec(project, startTick)
  const startSample = Math.min(
    Math.max(0, buf.length - 1),
    Math.max(0, Math.floor(startSec * buf.sampleRate)),
  )
  if (startSample <= 0) return buf
  const length = Math.max(1, buf.length - startSample)
  const out = createAudioBuffer(buf.numberOfChannels, length, buf.sampleRate)
  for (let c = 0; c < buf.numberOfChannels; c++) {
    out.getChannelData(c).set(buf.getChannelData(c).subarray(startSample, startSample + length))
  }
  return out
}

/** @internal Exported for tests — wall-clock sounding segments per note. */
export function planNoteSoundSegments(
  n: TagRollNote,
  project: TagRollProject,
): { start: number; dur: number }[] {
  return noteSoundSegments(
    n,
    project.tempoMarkers,
    project.expressions,
    project.bpm || TAG_ROLL_DEFAULT_BPM,
    project.notes,
    project.swing ?? TAG_ROLL_DEFAULT_SWING,
    project.timeSignature,
    project.ppq || TAG_ROLL_PPQ,
  ).map((s) => ({ start: s.startSec, dur: s.durSec }))
}

function tickSec(project: TagRollProject, tick: number): number {
  const straight = (t: number) =>
    secondsAtTick(
      t,
      project.tempoMarkers,
      project.expressions,
      project.bpm || TAG_ROLL_DEFAULT_BPM,
      Math.max(1, Math.round(TAG_ROLL_PPQ / 16)),
      project.notes,
    )
  return wallSecondsAtScoreTick(
    tick,
    project.swing ?? TAG_ROLL_DEFAULT_SWING,
    straight,
    project.timeSignature,
    project.ppq || TAG_ROLL_PPQ,
  )
}

type BounceVoiceEvent =
  | {
      kind: 'attack'
      midi: number
      startSec: number
      endSec: number
      /** Phrase-end release (no immediate follower). */
      phraseEnd: boolean
    }
  | {
      kind: 'glide'
      fromMidi: number
      toMidi: number
      startSec: number
      endSec: number
      sustainUntilSec: number
      phraseEnd: boolean
    }

/** Plan monophonic voice events for one part (sorted). */
export function planPartBounceEvents(
  notes: readonly TagRollNote[],
  project: TagRollProject,
): BounceVoiceEvent[] {
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))
  const events: BounceVoiceEvent[] = []
  for (const n of sorted) {
    const endTick = n.startTick + n.durationTicks
    const startSec = tickSec(project, n.startTick)
    const endSec = tickSec(project, endTick)
    const phraseEnd = shouldDecayOnNoteEnd(sorted, n)
    const pred = findOverlappingPredecessor(sorted, n)
    const win = pred ? overlapWindow(pred, n) : null
    if (pred && win) {
      const g0 = tickSec(project, win.startTick)
      const g1 = tickSec(project, win.endTick)
      events.push({
        kind: 'glide',
        fromMidi: pred.midi,
        toMidi: n.midi,
        startSec: g0,
        endSec: g1,
        sustainUntilSec: endSec,
        phraseEnd,
      })
    } else {
      events.push({ kind: 'attack', midi: n.midi, startSec, endSec, phraseEnd })
    }
  }
  return events
}

function scheduleAttack(
  offline: OfflineAudioContext,
  master: GainNode,
  midi: number,
  start: number,
  end: number,
  durationCap: number,
  attackSec: number,
  releaseSec: number,
): void {
  if (start >= durationCap) return
  const stopAt = Math.min(end, durationCap)
  const playDur = stopAt - start
  if (playDur <= 0) return
  const osc = offline.createOscillator()
  const g = offline.createGain()
  osc.type = 'triangle'
  osc.frequency.value = midiToHz(midi)
  const attack = Math.min(attackSec, playDur * 0.45)
  g.gain.setValueAtTime(0, start)
  g.gain.linearRampToValueAtTime(0.9, start + attack)
  g.gain.setValueAtTime(0.9, stopAt)
  const release = Math.min(releaseSec, Math.max(0.008, durationCap - stopAt))
  const silenceAt = Math.min(durationCap, stopAt + release)
  g.gain.linearRampToValueAtTime(0, silenceAt)
  osc.connect(g)
  g.connect(master)
  osc.start(start)
  osc.stop(silenceAt + 0.02)
}

function scheduleGlide(
  offline: OfflineAudioContext,
  master: GainNode,
  fromMidi: number,
  toMidi: number,
  glideStart: number,
  glideEnd: number,
  sustainUntil: number,
  durationCap: number,
  releaseSec: number,
): void {
  if (glideStart >= durationCap) return
  const stopAt = Math.min(sustainUntil, durationCap)
  if (stopAt <= glideStart) return
  const osc = offline.createOscillator()
  const g = offline.createGain()
  osc.type = 'triangle'
  const dur = Math.max(0.001, Math.min(glideEnd, durationCap) - glideStart)
  const curve = frequencyEaseInOutCurve(midiToHz(fromMidi), midiToHz(toMidi), 64)
  try {
    osc.frequency.setValueAtTime(curve[0]!, glideStart)
    osc.frequency.setValueCurveAtTime(curve, glideStart, dur)
  } catch {
    osc.frequency.setValueAtTime(midiToHz(toMidi), glideStart + dur)
  }
  g.gain.setValueAtTime(0.9, glideStart)
  g.gain.setValueAtTime(0.9, stopAt)
  const release = Math.min(releaseSec, Math.max(0.008, durationCap - stopAt))
  const silenceAt = Math.min(durationCap, stopAt + release)
  g.gain.linearRampToValueAtTime(0, silenceAt)
  osc.connect(g)
  g.connect(master)
  osc.start(glideStart)
  osc.stop(silenceAt + 0.02)
}

export async function renderNotes(
  notes: TagRollNote[],
  project: TagRollProject,
  lengthTicks: number,
): Promise<AudioBuffer> {
  const duration = Math.min(
    TAG_ROLL_BOUNCE_MAX_SECONDS,
    secondsAtTick(
      lengthTicks,
      project.tempoMarkers,
      project.expressions,
      project.bpm || TAG_ROLL_DEFAULT_BPM,
      Math.max(1, Math.round(TAG_ROLL_PPQ / 16)),
      project.notes,
    ) + 0.5,
  )
  const sr = 44100
  const offline = new OfflineAudioContext(2, Math.ceil(duration * sr), sr)
  const master = offline.createGain()
  master.gain.value = 0.22
  master.connect(offline.destination)

  const env = project.soundEnvelope ?? TAG_ROLL_DEFAULT_SOUND_ENVELOPE
  const byPart = new Map<string, TagRollNote[]>()
  for (const n of notes) {
    const list = byPart.get(n.partId) ?? []
    list.push(n)
    byPart.set(n.partId, list)
  }

  for (const partNotes of byPart.values()) {
    for (const ev of planPartBounceEvents(partNotes, project)) {
      if (ev.kind === 'attack') {
        scheduleAttack(
          offline,
          master,
          ev.midi,
          ev.startSec,
          ev.endSec,
          duration,
          env.attackSec,
          releaseSecForNoteEnd(env, ev.phraseEnd),
        )
      } else {
        scheduleGlide(
          offline,
          master,
          ev.fromMidi,
          ev.toMidi,
          ev.startSec,
          ev.endSec,
          ev.sustainUntilSec,
          duration,
          releaseSecForNoteEnd(env, ev.phraseEnd),
        )
      }
    }
  }

  return offline.startRendering()
}

/** Downmix stereo bounce buffer to mono (avg of channels). */
export function bufferToMono(buf: AudioBuffer): Float32Array {
  const n = buf.length
  const out = new Float32Array(n)
  const chs = buf.numberOfChannels
  for (let c = 0; c < chs; c++) {
    const data = buf.getChannelData(c)
    for (let i = 0; i < n; i++) out[i]! += data[i]!
  }
  if (chs > 1) {
    const inv = 1 / chs
    for (let i = 0; i < n; i++) out[i]! *= inv
  }
  return out
}

function peakOf(data: Float32Array): number {
  let peak = 0
  const step = data.length > 500_000 ? 4 : 1
  for (let i = 0; i < data.length; i += step) {
    const a = Math.abs(data[i]!)
    if (a > peak) peak = a
  }
  return peak
}

/**
 * Part-left learning stereo: solo hard L, accompaniment hard R with
 * {@link sideVoiceGain} (matches Tag-page offline reconstruct).
 */
export function buildPartLeftBuffer(
  solo: Float32Array,
  accompanimentParts: Float32Array[],
  sampleRate: number,
): AudioBuffer {
  const length = Math.max(solo.length, ...accompanimentParts.map((p) => p.length), 1)
  const gain = sideVoiceGain(Math.max(1, accompanimentParts.length))
  const accomp = new Float32Array(length)
  for (const src of accompanimentParts) {
    for (let i = 0; i < src.length; i++) accomp[i]! += src[i]! * gain
  }
  const left = new Float32Array(length)
  const right = new Float32Array(length)
  for (let i = 0; i < solo.length; i++) left[i]! = solo[i]!
  for (let i = 0; i < length; i++) right[i]! = accomp[i]!
  const peak = Math.max(peakOf(left), peakOf(right), 1e-9)
  const headroom = peak > 0.99 ? 0.99 / peak : 1
  if (headroom !== 1) {
    for (let i = 0; i < length; i++) {
      left[i]! *= headroom
      right[i]! *= headroom
    }
  }
  const out = createAudioBuffer(2, length, sampleRate)
  out.getChannelData(0).set(left)
  out.getChannelData(1).set(right)
  return out
}

/**
 * Stereo mix from mono stems using fixed barbershop equal-power pans
 * (Tenor −0.5, Lead −0.25, Bass +0.25, Bari +0.5 — same as offline ultra mix).
 */
export function buildMixBuffer(
  parts: Array<{ mono: Float32Array; pan: number }>,
  sampleRate: number,
): AudioBuffer {
  const length = Math.max(1, ...parts.map((p) => p.mono.length), 1)
  const left = new Float32Array(length)
  const right = new Float32Array(length)
  for (const p of parts) {
    const { l, r } = equalPowerPanGains(p.pan)
    const src = p.mono
    for (let i = 0; i < src.length; i++) {
      const s = src[i]!
      left[i]! += s * l
      right[i]! += s * r
    }
  }
  const peak = Math.max(peakOf(left), peakOf(right), 1e-9)
  const headroom = peak > 0.99 ? 0.99 / peak : 1
  if (headroom !== 1) {
    for (let i = 0; i < length; i++) {
      left[i]! *= headroom
      right[i]! *= headroom
    }
  }
  const out = createAudioBuffer(2, length, sampleRate)
  out.getChannelData(0).set(left)
  out.getChannelData(1).set(right)
  return out
}

/** Mono stem → dual-mono stereo (solo practice export). */
export function monoToDualStereo(mono: Float32Array, sampleRate: number): AudioBuffer {
  const out = createAudioBuffer(2, Math.max(1, mono.length), sampleRate)
  out.getChannelData(0).set(mono)
  out.getChannelData(1).set(mono)
  return out
}

export type BounceProgress = { label: string; ratio: number }

export type BounceFormat = 'wav' | 'mp3'

export type BounceStep =
  | { kind: 'mix'; partId: string; label: string }
  | { kind: 'part'; partId: string; label: string; notes: TagRollNote[]; featuredPartId: string }
  | { kind: 'partLeft'; partId: string; label: string; featuredPartId: string }

export function planBounceSteps(
  project: TagRollProject,
  opts: { mix: boolean; perPart: boolean; partLeft?: boolean },
): BounceStep[] {
  const steps: BounceStep[] = []
  const wantMix = opts.mix || !!opts.partLeft
  if (wantMix && project.notes.length) {
    steps.push({
      kind: 'mix',
      partId: 'mix',
      label: 'Mix',
    })
  }
  if (opts.partLeft) {
    for (const part of project.parts) {
      const has = project.notes.some((n) => n.partId === part.id)
      if (!has) continue
      steps.push({
        kind: 'partLeft',
        partId: partSlug(part.name),
        label: part.name,
        featuredPartId: part.id,
      })
    }
  }
  if (opts.perPart) {
    for (const part of project.parts) {
      const notes = project.notes.filter((n) => n.partId === part.id)
      if (!notes.length) continue
      steps.push({
        kind: 'part',
        partId: `${partSlug(part.name)}-solo`,
        label: `${part.name} Solo`,
        notes,
        featuredPartId: part.id,
      })
    }
  }
  return steps
}

async function encodeBounceBuffer(
  buf: AudioBuffer,
  format: BounceFormat,
): Promise<ArrayBuffer> {
  if (format === 'mp3') {
    const bytes = await encodeAudioBuffer(buf, 'mp3', { quality: 'standard' })
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  }
  const bytes = audioBufferToWav(buf)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export type BounceTrack = {
  partId: string
  label: string
  filename: string
  bytes: ArrayBuffer
}

export async function bounceTagRollTracks(
  project: TagRollProject,
  opts: {
    mix: boolean
    perPart: boolean
    partLeft?: boolean
    format?: BounceFormat
    onProgress?: (p: BounceProgress) => void
  },
): Promise<BounceTrack[]> {
  const format = opts.format ?? 'wav'
  const ext = format === 'mp3' ? 'mp3' : 'wav'
  const steps = planBounceSteps(project, {
    mix: opts.mix || !!opts.partLeft,
    perPart: opts.perPart,
    partLeft: opts.partLeft,
  })
  const out: BounceTrack[] = []
  const total = Math.max(1, steps.length)
  const contentStart = firstContentMeasureTick(project)
  const blowPlan = planBlowPitch(project)
  let blowBuf: AudioBuffer | null = null
  if (blowPlan) {
    opts.onProgress?.({ label: 'Rendering pitch…', ratio: 0.02 })
    blowBuf = await renderBlowPitchBufferAsync(blowPlan, 44100)
  }

  const needStems =
    steps.some((s) => s.kind === 'partLeft' || s.kind === 'mix') ||
    steps.some((s) => s.kind === 'part')
  const monoByPartId = new Map<string, Float32Array>()
  let sampleRate = 44100
  if (needStems) {
    for (let i = 0; i < project.parts.length; i++) {
      const part = project.parts[i]!
      const notes = project.notes.filter((n) => n.partId === part.id)
      if (!notes.length) continue
      opts.onProgress?.({
        label: `Rendering ${part.name} stem…`,
        ratio: (i / Math.max(1, project.parts.length)) * 0.35,
      })
      const buf = await renderNotes(notes, project, project.lengthTicks)
      sampleRate = buf.sampleRate
      monoByPartId.set(part.id, bufferToMono(buf))
    }
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    opts.onProgress?.({
      label: `Rendering ${step.label}…`,
      ratio: needStems ? 0.35 + (i / total) * 0.65 : i / total,
    })
    let buf: AudioBuffer
    if (step.kind === 'mix') {
      const stems = project.parts
        .filter((p) => monoByPartId.has(p.id))
        .map((p) => ({
          mono: monoByPartId.get(p.id)!,
          pan: mixPanForPart(p.name),
        }))
      buf = buildMixBuffer(stems, sampleRate)
    } else if (step.kind === 'partLeft') {
      const solo = monoByPartId.get(step.featuredPartId) ?? new Float32Array(1)
      const others = [...monoByPartId.entries()]
        .filter(([id]) => id !== step.featuredPartId)
        .map(([, m]) => m)
      buf = buildPartLeftBuffer(solo, others, sampleRate)
    } else {
      const mono = monoByPartId.get(step.featuredPartId)
      buf = mono
        ? monoToDualStereo(mono, sampleRate)
        : await renderNotes(step.notes, project, project.lengthTicks)
    }
    buf = trimBufferFromTick(buf, project, contentStart)
    if (blowBuf) {
      // Pitch measure (centered) immediately before first content measure.
      if (blowBuf.sampleRate !== buf.sampleRate) {
        blowBuf = await renderBlowPitchBufferAsync(blowPlan!, buf.sampleRate)
      }
      buf = prependAudioBuffer(blowBuf, buf)
    }
    const bytes = await encodeBounceBuffer(buf, format)
    out.push({
      partId: step.partId,
      label: step.label,
      filename: bounceTrackFilename(project.title, step.label, ext),
      bytes,
    })
  }
  opts.onProgress?.({ label: 'Done', ratio: 1 })
  return out
}
