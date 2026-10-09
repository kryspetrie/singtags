/**
 * Adversarial corpus loop — compare Path Optimize / moment picks to manuals.
 * Corpus anchors: Rylander finals, Flinn/BAM doubling, Bonnie V7→I, circle highway,
 * Dom9-when-Lead-is-9, unforced-minor demotion, bass 1/5, no unisons/mud.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement, type ArrangementProject } from '../types'
import { pathOptimize } from './optimize'
import { candidatesForMoment } from './candidates'
import { weightsFromRisk } from './types'
import { createSequentialIdGenerator } from '../../../adapters/arranging/persistence/systemServices'
import {
  TTBB_BASS_MIN,
  TTBB_CLOSE_SPAN_MAX,
  ttbbPartsDistinct,
} from '../chords'
import { triadDoubleKind as doubleKind } from '../harmonize/candidateRanker'

type Finding = {
  pass: number
  id: string
  sev: 'critical' | 'medium' | 'low'
  corpus: string
  detail: string
}

const findings: Finding[] = []

function note(
  pass: number,
  id: string,
  sev: Finding['sev'],
  corpus: string,
  detail: string,
  ok: boolean,
) {
  if (!ok) findings.push({ pass, id, sev, corpus, detail })
  expect(ok, `[${sev}] ${id}: ${detail} (corpus: ${corpus})`).toBe(true)
}

function mkMelody(
  midis: number[],
  tonality: number,
  pillars: { rootPc: number; start: number; end: number }[],
): ArrangementProject {
  const p = createEmptyArrangement('adv')
  p.tonality = tonality
  p.preferFlats = tonality === 10 || tonality === 5 || tonality === 3
  p.melody = midis.map((midi, i) => ({
    id: `m${i}`,
    midi,
    startTick: i * 480,
    durationTicks: 480,
    role: i % 2 ? ('smn' as const) : ('pmn' as const),
  }))
  p.pillars = pillars.map((x, i) => ({
    id: `p${i}`,
    rootPc: x.rootPc,
    startTick: x.start,
    endTick: x.end,
    source: 'user' as const,
    confirmed: true,
  }))
  return p
}

async function optimizeBasic(p: ArrangementProject) {
  return pathOptimize(
    p,
    {
      mode: 'full',
      scope: { kind: 'whole' },
      weights: { risk: 0, cadenceBias: 'moderate' },
      maxPasses: 8,
      skipProbe: true,
    },
    { idGen: createSequentialIdGenerator() },
  )
}

function stacksOf(p: ArrangementProject) {
  return [...p.stacks].filter((s) => s.midi).sort((a, b) => a.startTick - b.startTick)
}

function legality(p: ArrangementProject, pass: number, id: string) {
  const stacks = stacksOf(p)
  for (const s of stacks) {
    const m = s.midi!
    note(
      pass,
      `${id}/unison@${s.startTick}`,
      'critical',
      'Prietto/BAM: four distinct parts; unisons illegal',
      `${s.natureId}@${s.rootPc} ${JSON.stringify(m)}`,
      ttbbPartsDistinct(m),
    )
    note(
      pass,
      `${id}/mud@${s.startTick}`,
      'critical',
      'Lloyd/BAM TTBB bass floor',
      `bass=${m.bass}`,
      m.bass >= TTBB_BASS_MIN,
    )
    const spanCap =
      s.natureId === 'major' || s.natureId === 'minor'
        ? Math.max(TTBB_CLOSE_SPAN_MAX, 24)
        : TTBB_CLOSE_SPAN_MAX
    note(
      pass,
      `${id}/span@${s.startTick}`,
      'medium',
      'BAM close/home at Basic (tetrad ≤21; triad root-double ≤24)',
      `span=${m.tenor - m.bass} cap=${spanCap}`,
      m.tenor - m.bass <= spanCap,
    )
  }
}

describe('adversarial corpus loop', () => {
  it('pass 1 — Rylander finals + root doubles + Bonnie V7→I', async () => {
    const PASS = 1

    // Rylander: 99% end major; Flinn/BAM: double root; bass on 1/5.
    {
      const p = mkMelody(
        [60, 64, 67, 65, 64, 62, 60],
        0,
        [
          { rootPc: 0, start: 0, end: 3 * 480 },
          { rootPc: 7, start: 3 * 480, end: 5 * 480 },
          { rootPc: 0, start: 5 * 480, end: 8 * 480 },
        ],
      )
      const out = await optimizeBasic(p)
      note(PASS, 'ryl-final-applied', 'critical', 'engine applies', out.report.message, out.report.applied)
      legality(out.project, PASS, 'ryl-final')
      const last = stacksOf(out.project).at(-1)!
      note(
        PASS,
        'ryl-final-major',
        'critical',
        'Rylander p.3: 99% end with a major chord',
        `${last.natureId}@${last.rootPc}`,
        last.rootPc === 0 && last.natureId === 'major',
      )
      const kind = doubleKind(last.midi!, last.rootPc, last.natureId)
      note(
        PASS,
        'ryl-final-root-double',
        'critical',
        'Flinn/BAM/Prietto/Rylander: major → double the root',
        `kind=${kind}`,
        kind === 'root',
      )
      const bassRole = Number(last.voicing[0])
      note(
        PASS,
        'ryl-final-bass-15',
        'medium',
        'BAM: bass on root or fifth',
        `bassRole=${bassRole} voicing=${last.voicing}`,
        bassRole === 1 || bassRole === 5,
      )
    }

    // Bonnie-class: Bb, Lead F→Bb → F7 then Bb major (not hanging V, not F major).
    {
      const p = mkMelody(
        [65, 58],
        10,
        [
          { rootPc: 5, start: 0, end: 480 },
          { rootPc: 10, start: 480, end: 2000 },
        ],
      )
      const open = candidatesForMoment(p, p.melody[0]!, {
        topK: 8,
        weights: weightsFromRisk(0),
      })[0]!
      note(
        PASS,
        'bonnie-open-F7',
        'critical',
        'Bonnie / knowledge walkthrough: ^5 → V7 (F7 in Bb)',
        `${open.natureId}@${open.rootPc}`,
        open.rootPc === 5 && open.natureId === 'seventh',
      )
      const out = await optimizeBasic(p)
      legality(out.project, PASS, 'bonnie')
      const [a, b] = stacksOf(out.project)
      note(
        PASS,
        'bonnie-path-V7',
        'critical',
        'V7→I cadence spelling',
        `${a?.natureId}@${a?.rootPc} → ${b?.natureId}@${b?.rootPc}`,
        !!a &&
          !!b &&
          a.rootPc === 5 &&
          a.natureId === 'seventh' &&
          b.rootPc === 10 &&
          b.natureId === 'major',
      )
    }

    // Lead on ^1 mid-phrase under I → major home (not I7).
    {
      const p = mkMelody(
        [60, 64],
        0,
        [{ rootPc: 0, start: 0, end: 2000 }],
      )
      const top = candidatesForMoment(p, p.melody[0]!, {
        topK: 6,
        weights: weightsFromRisk(0),
      })[0]!
      note(
        PASS,
        'mid-tonic-major',
        'critical',
        'P1/manuals: Lead on 1/5 → major home mid-phrase',
        `${top.natureId}@${top.rootPc}/${top.voicing}`,
        top.natureId === 'major' && top.rootPc === 0,
      )
    }
  })

  it('pass 2 — Lead ^3 → I7; Dom9 when Lead is 9; unforced minor ban', async () => {
    const PASS = 2

    // Lead on ^3 under I → I7 (4-PC) preferred over doubled major.
    {
      const p = mkMelody([64, 60], 0, [{ rootPc: 0, start: 0, end: 2000 }])
      const top = candidatesForMoment(p, p.melody[0]!, {
        topK: 6,
        weights: weightsFromRisk(0),
      })[0]!
      note(
        PASS,
        'lead3-I7',
        'medium',
        'P1/Prietto: Lead on 3/7 → complete Mm7',
        `${top.natureId}@${top.rootPc}`,
        top.natureId === 'seventh' && top.rootPc === 0,
      )
    }

    // Lead on 9 of V (A under G7/9 in C) → Dom9 allowed / competitive.
    {
      const p = mkMelody([69, 60], 0, [
        { rootPc: 7, start: 0, end: 480 },
        { rootPc: 0, start: 480, end: 2000 },
      ])
      const cands = candidatesForMoment(p, p.melody[0]!, {
        topK: 12,
        weights: weightsFromRisk(0),
      })
      const dom9 = cands.find((c) => c.rootPc === 7 && c.natureId === 'ninth')
      note(
        PASS,
        'dom9-lead9-present',
        'medium',
        'Flinn predominant Dom9 when Lead is the 9th',
        `top=${cands[0]?.natureId}@${cands[0]?.rootPc}; hasNinth=${!!dom9}`,
        !!dom9,
      )
      note(
        PASS,
        'dom9-lead9-competitive',
        'low',
        'Flinn: Dom9 is predominant flavor when melody forces 9',
        `rank=${cands.findIndex((c) => c.natureId === 'ninth')} score=${dom9?.score}`,
        !!dom9 && (dom9.score ?? 0) >= (cands[0]!.score ?? 0) - 8,
      )
    }

    // Lead on ^5 under I → not unforced Cm / Cm7 as top pick.
    {
      const p = mkMelody([67, 60], 0, [{ rootPc: 0, start: 0, end: 2000 }])
      const top = candidatesForMoment(p, p.melody[0]!, {
        topK: 6,
        weights: weightsFromRisk(0),
      })[0]!
      note(
        PASS,
        'no-unforced-minor',
        'critical',
        'BAM/Flinn: minor only when called for (Lead ♭3)',
        `${top.natureId}@${top.rootPc}`,
        !(top.rootPc === 0 && (top.natureId === 'minor' || top.natureId === 'm7')),
      )
      note(
        PASS,
        'lead5-home',
        'medium',
        'Lead on 5 under I → major or V-family, not i',
        `${top.natureId}@${top.rootPc}`,
        (top.rootPc === 0 && top.natureId === 'major') ||
          (top.rootPc === 7 && (top.natureId === 'seventh' || top.natureId === 'ninth')),
      )
    }

    // Doubled major 3rd must not beat root double when both place.
    {
      const p = mkMelody([64, 60], 0, [{ rootPc: 0, start: 0, end: 2000 }])
      const majors = candidatesForMoment(p, p.melody[0]!, {
        topK: 24,
        weights: weightsFromRisk(0),
      }).filter((c) => c.natureId === 'major' && c.rootPc === 0)
      const rootish = majors.filter(
        (c) => doubleKind(c.midi!, 0, 'major') === 'root',
      )
      const thirdish = majors.filter(
        (c) => doubleKind(c.midi!, 0, 'major') === 'third',
      )
      if (rootish.length && thirdish.length) {
        note(
          PASS,
          'no-ugly-third-double',
          'critical',
          'Rylander: doubling the third is ugly',
          `bestRoot=${rootish[0]!.score} bestThird=${thirdish[0]!.score}`,
          (rootish[0]!.score ?? 0) > (thirdish[0]!.score ?? 0),
        )
      }
    }
  })

  it('pass 3 — circle highway, hanging V7, Lead ♭7 final I7', async () => {
    const PASS = 3

    // Approaching I: last should not hang on V7.
    {
      const p = mkMelody(
        [60, 62, 64, 65, 67, 69, 71, 72],
        0,
        [
          { rootPc: 0, start: 0, end: 2 * 480 },
          { rootPc: 5, start: 2 * 480, end: 4 * 480 },
          { rootPc: 7, start: 4 * 480, end: 6 * 480 },
          { rootPc: 0, start: 6 * 480, end: 10 * 480 },
        ],
      )
      // End on C5 (^1) for tonic close.
      p.melody[7]!.midi = 60
      const out = await optimizeBasic(p)
      legality(out.project, PASS, 'hang')
      const last = stacksOf(out.project).at(-1)!
      note(
        PASS,
        'no-hanging-V7',
        'critical',
        'Cadence grammar / Bonnie-class: do not end on V7',
        `${last.natureId}@${last.rootPc}`,
        !(last.rootPc === 7 && (last.natureId === 'seventh' || last.natureId === 'ninth')),
      )
      note(
        PASS,
        'tonic-final-root',
        'critical',
        'Song final on tonic root',
        `${last.natureId}@${last.rootPc}`,
        last.rootPc === 0,
      )
    }

    // Lead on ♭7 of tonic at final → I7 allowed (Rylander carve-out).
    {
      const p = mkMelody([60, 67, 70], 0, [
        { rootPc: 0, start: 0, end: 480 },
        { rootPc: 7, start: 480, end: 960 },
        { rootPc: 0, start: 960, end: 2000 },
      ])
      // Final Lead Bb = ♭7 of C.
      const top = candidatesForMoment(p, p.melody[2]!, {
        topK: 8,
        weights: weightsFromRisk(0),
      })[0]!
      note(
        PASS,
        'final-b7-I7',
        'medium',
        'Rylander: Lead on ♭7 forces I7 close',
        `${top.natureId}@${top.rootPc}`,
        top.rootPc === 0 && top.natureId === 'seventh',
      )
    }

    // Circle fragment under pillars I→V→I with Lead that fits: expect V7 then I major.
    {
      const p = mkMelody([60, 67, 60], 0, [
        { rootPc: 0, start: 0, end: 480 },
        { rootPc: 7, start: 480, end: 960 },
        { rootPc: 0, start: 960, end: 2000 },
      ])
      const out = await optimizeBasic(p)
      const s = stacksOf(out.project)
      note(
        PASS,
        'circle-V7-I',
        'critical',
        'knowledge/21: clear V7→I highway',
        s.map((x) => `${x.natureId}@${x.rootPc}`).join(' → '),
        s.length === 3 &&
          s[1]!.rootPc === 7 &&
          s[1]!.natureId === 'seventh' &&
          s[2]!.rootPc === 0 &&
          s[2]!.natureId === 'major',
      )
    }
  })

  it('pass 4 — register climb, IV7 legality, Risky vs Basic Dom9 flood', async () => {
    const PASS = 4

    // Wandering phrase: bass should not monotonically climb into lead band.
    {
      const midis = [60, 62, 64, 65, 67, 65, 64, 62, 60]
      const p = mkMelody(midis, 0, [
        { rootPc: 0, start: 0, end: 3 * 480 },
        { rootPc: 5, start: 3 * 480, end: 5 * 480 },
        { rootPc: 7, start: 5 * 480, end: 7 * 480 },
        { rootPc: 0, start: 7 * 480, end: 12 * 480 },
      ])
      const out = await optimizeBasic(p)
      legality(out.project, PASS, 'climb')
      const seq = stacksOf(out.project)
      const firstBass = seq[0]!.midi!.bass
      const lastBass = seq.at(-1)!.midi!.bass
      const maxBass = Math.max(...seq.map((s) => s.midi!.bass))
      note(
        PASS,
        'bass-returns-home',
        'medium',
        'BAM home register; resist inversion climb',
        `first=${firstBass} last=${lastBass} max=${maxBass}`,
        lastBass <= firstBass + 7 && maxBass <= 62,
      )
    }

    // IV7 under IV pillar with Lead on ^1 of IV (F in C) is legal BS7, not banned.
    {
      const p = mkMelody([65, 64], 0, [
        { rootPc: 5, start: 0, end: 480 },
        { rootPc: 0, start: 480, end: 2000 },
      ])
      const cands = candidatesForMoment(p, p.melody[0]!, {
        topK: 12,
        weights: weightsFromRisk(0),
      })
      const iv7 = cands.find((c) => c.rootPc === 5 && c.natureId === 'seventh')
      note(
        PASS,
        'iv7-available',
        'medium',
        'knowledge/13: IV7 is BS7 (not a fake secondary)',
        `present=${!!iv7} top=${cands[0]?.natureId}@${cands[0]?.rootPc}`,
        !!iv7,
      )
    }

    // Basic must not flood SCF color (dim7/aug) on a plain tonic ^1.
    {
      const p = mkMelody([60], 0, [{ rootPc: 0, start: 0, end: 2000 }])
      const cands = candidatesForMoment(p, p.melody[0]!, {
        topK: 16,
        weights: weightsFromRisk(0),
      })
      const weird = cands.filter((c) =>
        ['dim7', 'dim', 'aug', 'half-dim', 'maj7'].includes(c.natureId),
      )
      note(
        PASS,
        'basic-no-scf-flood',
        'medium',
        'P2/Basic classical highway; SCF waits for risk',
        weird.map((c) => c.natureId).join(','),
        weird.length === 0,
      )
    }
  })

  it('pass 5 — Five-Foot-Two-ish III7 chain at Risky; Basic stays readable', async () => {
    const PASS = 5

    // Melody C E A D G C — classic III7–VI7–II7–V7–I tone anchors (Risky).
    {
      const midis = [60, 64, 69, 62, 67, 60]
      const p = mkMelody(midis, 0, [
        { rootPc: 0, start: 0, end: 480 },
        { rootPc: 0, start: 480, end: 5 * 480 },
        { rootPc: 0, start: 5 * 480, end: 8 * 480 },
      ])
      // Single I pillar — circle chain is between pillars / SCF at Risky.
      p.pillars = [{ id: 'p0', rootPc: 0, startTick: 0, endTick: 8 * 480, source: 'user', confirmed: true }]

      const basic = await pathOptimize(
        structuredClone(p),
        {
          mode: 'full',
          scope: { kind: 'whole' },
          weights: { risk: 0, cadenceBias: 'moderate' },
          maxPasses: 8,
          skipProbe: true,
        },
        { idGen: createSequentialIdGenerator() },
      )
      legality(basic.project, PASS, 'fft-basic')
      const bLast = stacksOf(basic.project).at(-1)!
      note(
        PASS,
        'fft-basic-tonic-major',
        'critical',
        'Basic readable close: tonic major under ^1',
        `${bLast.natureId}@${bLast.rootPc}`,
        bLast.rootPc === 0 && bLast.natureId === 'major',
      )

      const risky = await pathOptimize(
        structuredClone(p),
        {
          mode: 'full',
          scope: { kind: 'whole' },
          weights: { risk: 0.85, cadenceBias: 'strong' },
          maxPasses: 10,
          skipProbe: true,
        },
        { idGen: createSequentialIdGenerator() },
      )
      const rStacks = stacksOf(risky.project)
      const roots = rStacks.map((s) => s.rootPc)
      const hasCircleFlavor =
        roots.some((r) => r === 4 || r === 9 || r === 2) && roots.includes(7)
      note(
        PASS,
        'fft-risky-circle-flavor',
        'low',
        'knowledge/21 Five Foot Two: III7/VI7/II7 color at high risk',
        roots.join(','),
        hasCircleFlavor || rStacks.some((s) => s.natureId === 'seventh' && s.rootPc !== 0),
      )
      const rLast = rStacks.at(-1)!
      note(
        PASS,
        'fft-risky-lands-tonic',
        'critical',
        'Even Risky must land tonic at final ^1',
        `${rLast.natureId}@${rLast.rootPc}`,
        rLast.rootPc === 0 &&
          (rLast.natureId === 'major' || rLast.natureId === 'seventh'),
      )
    }

    // Emit summary for the loop report (always runs last among these its).
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          findingCount: findings.length,
          bySev: {
            critical: findings.filter((f) => f.sev === 'critical').length,
            medium: findings.filter((f) => f.sev === 'medium').length,
            low: findings.filter((f) => f.sev === 'low').length,
          },
          findings,
        },
        null,
        2,
      ),
    )
  })
})
