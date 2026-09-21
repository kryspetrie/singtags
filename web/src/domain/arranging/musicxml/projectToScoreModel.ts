/**
 * Map ArrangementProject → intermediate score model (TTBB or per-part).
 */
import { pcName } from '../chords'
import type { ArrangementProject } from '../types'
import { ARRANGING_PPQ } from '../types'
import type { ArrangementScoreModel, ScoreNote, ScorePart } from './scoreModel'
import { measureTicks } from './scoreModel'

export type ScoreLayout = 'ttbb' | 'perPart'

function lengthOf(project: ArrangementProject): number {
  let max = ARRANGING_PPQ * 4 * 4
  for (const n of project.melody) max = Math.max(max, n.startTick + n.durationTicks)
  for (const s of project.stacks) max = Math.max(max, s.startTick + s.durationTicks)
  const mLen = measureTicks(ARRANGING_PPQ, 4, 4)
  return Math.max(mLen, Math.ceil(max / mLen) * mLen)
}

function chordText(project: ArrangementProject, stack: ArrangementProject['stacks'][0]): string {
  const root = pcName(stack.rootPc, project.preferFlats)
  const nature = stack.natureId === 'unknown' || !stack.natureId ? '' : stack.natureId
  // Prefer short notation from common natures
  const map: Record<string, string> = {
    major: '',
    seventh: '7',
    ninth: '9',
    minor: 'm',
    m7: 'm7',
    dim7: 'o7',
    dim: 'o',
    aug: '+',
    sixth: '6',
    maj7: 'M7',
    'half-dim': 'ø7',
    add9: 'add9',
    madd6: 'madd6',
  }
  return `${root}${map[nature] ?? (nature === 'unknown' ? '' : nature)}`
}

export function projectToScoreModel(
  project: ArrangementProject,
  layout: ScoreLayout = 'ttbb',
): ArrangementScoreModel {
  const lengthTicks = lengthOf(project)
  const chordSymbols = project.stacks
    .filter((s) => s.midi)
    .map((s) => ({ tick: s.startTick, text: chordText(project, s) }))

  const melodyByOnset = new Map(project.melody.map((m) => [m.startTick, m]))

  if (layout === 'perPart') {
    const roles: Array<{ id: string; name: string; clef: ScorePart['clef']; pick: (m: NonNullable<(typeof project.stacks)[0]['midi']>) => number }> = [
      { id: 'P1', name: 'Tenor', clef: 'treble8vb', pick: (m) => m.tenor },
      { id: 'P2', name: 'Lead', clef: 'treble8vb', pick: (m) => m.lead },
      { id: 'P3', name: 'Bari', clef: 'bass', pick: (m) => m.bari },
      { id: 'P4', name: 'Bass', clef: 'bass', pick: (m) => m.bass },
    ]
    const parts: ScorePart[] = roles.map((r) => {
      const notes: ScoreNote[] = []
      for (const s of project.stacks) {
        if (!s.midi) continue
        const mel = melodyByOnset.get(s.startTick)
        notes.push({
          midi: r.pick(s.midi),
          startTick: s.startTick,
          durationTicks: s.durationTicks,
          ...(r.name === 'Lead' && mel?.lyric ? { lyric: mel.lyric } : {}),
        })
      }
      if (r.name === 'Lead') {
        for (const m of project.melody) {
          const covered = notes.some(
            (n) => n.startTick === m.startTick && n.durationTicks === m.durationTicks,
          )
          if (!covered) {
            notes.push({
              midi: m.midi,
              startTick: m.startTick,
              durationTicks: m.durationTicks,
              ...(m.lyric ? { lyric: m.lyric } : {}),
            })
          }
        }
      }
      notes.sort((a, b) => a.startTick - b.startTick)
      return { id: r.id, name: r.name, clef: r.clef, notes }
    })
    return {
      title: project.title,
      bpm: project.bpm,
      ppq: project.ppq,
      preferFlats: project.preferFlats,
      timeSignature: { numerator: 4, denominator: 4 },
      lengthTicks,
      parts,
      chordSymbols,
    }
  }

  // TTBB: two staves — tenor+lead (voices), bari+bass
  const upper: ScoreNote[] = []
  const lower: ScoreNote[] = []
  for (const s of project.stacks) {
    if (!s.midi) continue
    const mel = melodyByOnset.get(s.startTick)
    upper.push({
      midi: s.midi.lead,
      startTick: s.startTick,
      durationTicks: s.durationTicks,
      ...(mel?.lyric ? { lyric: mel.lyric } : {}),
      chordSymbol: chordText(project, s),
    })
    upper.push({
      midi: s.midi.tenor,
      startTick: s.startTick,
      durationTicks: s.durationTicks,
    })
    lower.push({
      midi: s.midi.bass,
      startTick: s.startTick,
      durationTicks: s.durationTicks,
    })
    lower.push({
      midi: s.midi.bari,
      startTick: s.startTick,
      durationTicks: s.durationTicks,
    })
  }
  for (const m of project.melody) {
    const covered = upper.some(
      (n) => n.startTick === m.startTick && n.durationTicks === m.durationTicks,
    )
    if (!covered) {
      upper.push({
        midi: m.midi,
        startTick: m.startTick,
        durationTicks: m.durationTicks,
        ...(m.lyric ? { lyric: m.lyric } : {}),
      })
    }
  }
  upper.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi)
  lower.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi)

  return {
    title: project.title,
    bpm: project.bpm,
    ppq: project.ppq,
    preferFlats: project.preferFlats,
    timeSignature: { numerator: 4, denominator: 4 },
    lengthTicks,
    parts: [
      { id: 'P1', name: 'Tenor & Lead', clef: 'treble8vb', notes: upper },
      { id: 'P2', name: 'Bari & Bass', clef: 'bass', notes: lower },
    ],
    chordSymbols,
  }
}
