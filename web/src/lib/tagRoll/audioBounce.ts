/**
 * Offline bounce of Tag Roll notes to WAV (simple oscillators — reliable offline).
 */
import { audioBufferToWav } from '../../download/transform'
import type { TagRollNote, TagRollProject } from './types'
import { TAG_ROLL_PPQ } from './types'

const MAX_SECONDS = 180

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function ticksToSec(ticks: number, bpm: number): number {
  return (ticks / TAG_ROLL_PPQ) * (60 / Math.max(1, bpm))
}

async function renderNotes(
  notes: TagRollNote[],
  bpm: number,
  lengthTicks: number,
): Promise<AudioBuffer> {
  const duration = Math.min(MAX_SECONDS, ticksToSec(lengthTicks, bpm) + 0.5)
  const sr = 44100
  const offline = new OfflineAudioContext(2, Math.ceil(duration * sr), sr)
  const master = offline.createGain()
  master.gain.value = 0.22
  master.connect(offline.destination)

  for (const n of notes) {
    const start = ticksToSec(n.startTick, bpm)
    const dur = Math.max(0.05, ticksToSec(n.durationTicks, bpm))
    if (start >= duration) continue
    const osc = offline.createOscillator()
    const g = offline.createGain()
    osc.type = 'triangle'
    osc.frequency.value = midiToHz(n.midi)
    g.gain.setValueAtTime(0, start)
    g.gain.linearRampToValueAtTime(0.9, start + 0.015)
    g.gain.setValueAtTime(0.9, start + Math.max(0.02, dur - 0.05))
    g.gain.linearRampToValueAtTime(0, start + dur)
    osc.connect(g)
    g.connect(master)
    osc.start(start)
    osc.stop(start + dur + 0.02)
  }

  return offline.startRendering()
}

export type BounceProgress = { label: string; ratio: number }

export async function bounceTagRollTracks(
  project: TagRollProject,
  opts: {
    mix: boolean
    perPart: boolean
    onProgress?: (p: BounceProgress) => void
  },
): Promise<{ partId: string; label: string; filename: string; bytes: ArrayBuffer }[]> {
  const out: { partId: string; label: string; filename: string; bytes: ArrayBuffer }[] = []
  const steps: { partId: string; label: string; notes: TagRollNote[] }[] = []

  if (opts.perPart) {
    for (const part of project.parts) {
      const notes = project.notes.filter((n) => n.partId === part.id)
      if (!notes.length) continue
      steps.push({ partId: part.name.toLowerCase().replace(/\s+/g, '-'), label: part.name, notes })
    }
  }
  if (opts.mix || (!opts.perPart && !opts.mix)) {
    steps.push({
      partId: 'mix',
      label: 'Mix',
      notes: [...project.notes],
    })
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    opts.onProgress?.({
      label: `Rendering ${step.label}…`,
      ratio: i / Math.max(1, steps.length),
    })
    const buf = await renderNotes(step.notes, project.bpm, project.lengthTicks)
    const bytes = audioBufferToWav(buf)
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    out.push({
      partId: step.partId,
      label: step.label,
      filename: `tag-roll-${step.partId}.wav`,
      bytes: ab,
    })
  }
  opts.onProgress?.({ label: 'Done', ratio: 1 })
  return out
}
