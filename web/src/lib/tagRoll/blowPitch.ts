/**
 * Blow-pitch intro: one measure of centered pitch-pipe tone immediately before
 * the first content measure. Decay (voice release) finishes before notes start.
 */
import { createAudioBuffer } from '../../audio/audioBufferFactory'
import { midiToNote, noteToMidi } from '../../audio/pianoSamples'
import { PAY_KEY_MAX_NOTE, PAY_KEY_MIN_NOTE } from '../../audio/pitchPlayer'
import {
  resolvePitchPipeVoiceById,
  type PitchPipeVoiceConfig,
} from '../../audio/pitchPipeVoice'
import { measureStartTick } from './measureBeat'
import { bpmAtTick, measureTicks, secondsAtTick, ticksToSecondsAtBpm } from './tempoMap'
import type { TagRollProject } from './types'
import { TAG_ROLL_DEFAULT_BPM, TAG_ROLL_PPQ } from './types'

function firstContentTick(project: TagRollProject): number {
  if (!project.notes.length) return 0
  let min = Infinity
  for (const n of project.notes) min = Math.min(min, n.startTick)
  if (!Number.isFinite(min)) return 0
  return measureStartTick(min, project.timeSignature, project.ppq || TAG_ROLL_PPQ)
}

export type BlowPitchPlan = {
  /** MIDI tonic in the pay-the-key range. */
  midi: number
  noteName: string
  soundId: string
  voice: PitchPipeVoiceConfig
  /** Wall-clock length of one measure at the content-start tempo. */
  measureSec: number
  measureTicks: number
  /** Pitch-pipe release; decay completes by the end of the pitch measure. */
  releaseSec: number
  /** Sustain before release starts (`measureSec - releaseSec`, floored by attack). */
  holdSec: number
  /** First measure that contains notes. */
  contentStartTick: number
  /**
   * Musical tick where the pitch measure begins (may be negative when notes
   * start in measure 1 — live intro is a pre-roll; export prepends audio).
   */
  pitchStartTick: number
}

/** Pick a tonic MIDI in E3–E4 for a pitch class (same range as pay-the-key). */
export function tonicMidiForPitchClass(pc: number): number {
  const root = ((Math.round(pc) % 12) + 12) % 12
  const min = noteToMidi(PAY_KEY_MIN_NOTE)
  const max = noteToMidi(PAY_KEY_MAX_NOTE)
  for (const oct of [3, 4]) {
    const midi = (oct + 1) * 12 + root
    if (midi >= min && midi <= max) return midi
  }
  return Math.min(max, Math.max(min, 60 - ((60 - root) % 12)))
}

/**
 * Plan the blow-pitch intro, or `null` when disabled / no notes / measure too short.
 */
export function planBlowPitch(project: TagRollProject): BlowPitchPlan | null {
  if (!project.blowPitchEnabled) return null
  if (!project.notes.length) return null

  const voice = resolvePitchPipeVoiceById(project.pitchPipeSoundId)
  const mt = measureTicks(project.timeSignature, project.ppq || TAG_ROLL_PPQ)
  const contentStartTick = firstContentTick(project)
  const pitchStartTick = contentStartTick - mt

  const bpm = bpmAtTick(
    Math.max(0, contentStartTick),
    project.tempoMarkers,
    project.expressions,
    project.bpm || TAG_ROLL_DEFAULT_BPM,
  )
  // Prefer tempo-map span when the pitch measure sits on the grid.
  let measureSec: number
  if (pitchStartTick >= 0) {
    const step = Math.max(1, Math.round(TAG_ROLL_PPQ / 16))
    measureSec =
      secondsAtTick(
        contentStartTick,
        project.tempoMarkers,
        project.expressions,
        project.bpm || TAG_ROLL_DEFAULT_BPM,
        step,
        project.notes,
      ) -
      secondsAtTick(
        pitchStartTick,
        project.tempoMarkers,
        project.expressions,
        project.bpm || TAG_ROLL_DEFAULT_BPM,
        step,
        project.notes,
      )
  } else {
    measureSec = ticksToSecondsAtBpm(mt, bpm)
  }
  if (!(measureSec > 0.05)) return null

  const releaseSec = Math.min(voice.releaseSec, measureSec * 0.85)
  const attackSec = Math.min(voice.attackSec, measureSec * 0.25)
  const holdSec = Math.max(attackSec, measureSec - releaseSec)
  if (holdSec + releaseSec > measureSec + 1e-6) return null

  const midi = tonicMidiForPitchClass(project.tonality)
  return {
    midi,
    noteName: midiToNote(midi),
    soundId: project.pitchPipeSoundId,
    voice,
    measureSec,
    measureTicks: mt,
    releaseSec,
    holdSec,
    contentStartTick,
    pitchStartTick,
  }
}

/** True when playback from `fromTick` should include the blow-pitch intro. */
export function shouldBlowPitchOnPlay(
  project: TagRollProject,
  fromTick: number,
): boolean {
  const plan = planBlowPitch(project)
  if (!plan) return false
  return fromTick <= plan.contentStartTick
}

/**
 * Offline stereo render of one blow-pitch measure (equal L/R, pitch-pipe voice).
 * Decay reaches silence by `measureSec`.
 */
export async function renderBlowPitchBufferAsync(
  plan: BlowPitchPlan,
  sampleRate: number,
): Promise<AudioBuffer> {
  const { voice, midi, measureSec, holdSec, releaseSec } = plan
  const length = Math.max(1, Math.ceil(measureSec * sampleRate))
  const offline = new OfflineAudioContext(2, length, sampleRate)
  const master = offline.createGain()
  master.gain.value = voice.masterGain
  // Mono → stereo destination upmixes equally to L and R.
  master.connect(offline.destination)

  let mixBus: AudioNode = master
  if (voice.filter) {
    const f = offline.createBiquadFilter()
    f.type = voice.filter.type
    f.frequency.value = voice.filter.frequencyHz
    f.Q.value = voice.filter.Q
    f.connect(master)
    mixBus = f
  }

  const freq = 440 * 2 ** ((midi - 69) / 12)
  const attack = Math.min(voice.attackSec, holdSec * 0.9)
  const stopAt = Math.min(measureSec, holdSec + releaseSec)

  for (const partial of voice.partials) {
    const osc = offline.createOscillator()
    const g = offline.createGain()
    osc.type = partial.type
    osc.frequency.value = freq * 2 ** (partial.semitones / 12)
    osc.detune.value = partial.detuneCents
    g.gain.setValueAtTime(0, 0)
    g.gain.linearRampToValueAtTime(partial.gain, attack)
    g.gain.setValueAtTime(partial.gain, holdSec)
    g.gain.linearRampToValueAtTime(0, stopAt)
    osc.connect(g)
    g.connect(mixBus)
    osc.start(0)
    osc.stop(stopAt + 0.02)
  }

  return offline.startRendering()
}

/** Prepend a pitch measure onto an existing stereo (or mono) buffer. */
export function prependAudioBuffer(head: AudioBuffer, body: AudioBuffer): AudioBuffer {
  const channels = Math.max(head.numberOfChannels, body.numberOfChannels, 1)
  const sr = body.sampleRate || head.sampleRate
  const length = head.length + body.length
  const out = createAudioBuffer(channels, Math.max(1, length), sr)
  for (let c = 0; c < channels; c++) {
    const dest = out.getChannelData(c)
    const h = head.getChannelData(Math.min(c, head.numberOfChannels - 1))
    const b = body.getChannelData(Math.min(c, body.numberOfChannels - 1))
    dest.set(h, 0)
    dest.set(b, h.length)
  }
  return out
}
