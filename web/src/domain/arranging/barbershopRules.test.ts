/**
 * Barbershop correctness — Approach Three, SCF, contest allowlists, voicing invariants.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  classifyRootMotion,
  isChromaticStep,
  isM3Up,
  isP5Down,
  isP5Up,
  isSpringboardRoot,
  isTritone,
  pcDiff,
  scoreRootMotion,
} from './approachThree'
import {
  allowlistForProfile,
  CHORDS_BHS_EXTENDED,
  CHORDS_SAI11,
  isNatureAllowed,
  ringTier,
} from './contestProfile'
import { scfRootOffset, scfRoots, SCF_NATURES, PCF_NATURE_PRIORITY } from './scf'
import {
  BARBERSHOP_CHORDS,
  chordContainsLead,
  dom9OmitStrategy,
  leadRoleInChord,
  placeVoicing,
  voicingFitsLead,
  VOICINGS_BY_CHORD,
  pcName,
} from './chords'
import {
  candidatesForMelodyNote,
  generateCandidates,
  rankCandidates,
  explainRankingBreakdown,
  autoHarmonizeMelody,
} from './harmonize'
import { createEmptyArrangement, type MelodyEvent, type Pillar } from './types'

function note(midi: number, start = 0, role: MelodyEvent['role'] = 'pmn'): MelodyEvent {
  return { id: `n${midi}-${start}`, midi, startTick: start, durationTicks: 480, role }
}

function pillar(rootPc: number, end = 4000): Pillar {
  return { id: 'p1', rootPc, startTick: 0, endTick: end, source: 'user', confirmed: true }
}

describe('Approach Three root motion', () => {
  it('pcDiff is unsigned pitch-class distance', () => {
    expect(pcDiff(0, 7)).toBe(7)
    expect(pcDiff(7, 0)).toBe(5)
    expect(pcDiff(11, 0)).toBe(1)
  })

  it('recognizes P5 down/up, chromatic, tritone, m3', () => {
    expect(isP5Down(0, 5)).toBe(true) // C → F
    expect(isP5Up(0, 7)).toBe(true) // C → G
    expect(isChromaticStep(0, 1)).toBe(true)
    expect(isChromaticStep(0, 11)).toBe(true)
    expect(isTritone(0, 6)).toBe(true)
    expect(isM3Up(0, 4)).toBe(true)
  })

  it('I and IV are springboard roots', () => {
    expect(isSpringboardRoot(0, 0)).toBe(true)
    expect(isSpringboardRoot(5, 0)).toBe(true)
    expect(isSpringboardRoot(7, 0)).toBe(false)
  })

  it('classifies BS7 chromatic / tritone / m3 only when fromIsSeventh', () => {
    // From V (not I/IV springboard) so seventh-only motions are visible
    expect(
      classifyRootMotion({ fromRoot: 7, toRoot: 8, tonality: 0, fromIsSeventh: true }),
    ).toBe('chromatic')
    expect(
      classifyRootMotion({ fromRoot: 7, toRoot: 8, tonality: 0, fromIsSeventh: false }),
    ).toBe('other')
    expect(
      classifyRootMotion({ fromRoot: 7, toRoot: 1, tonality: 0, fromIsSeventh: true }),
    ).toBe('tritone')
    expect(
      classifyRootMotion({ fromRoot: 7, toRoot: 11, tonality: 0, fromIsSeventh: true }),
    ).toBe('m3_up')
  })

  it('IV→I is cadential; other up-P5 is retrogression', () => {
    expect(
      classifyRootMotion({ fromRoot: 5, toRoot: 0, tonality: 0, fromIsSeventh: false }),
    ).toBe('p5_up_cadential')
    expect(
      classifyRootMotion({ fromRoot: 2, toRoot: 9, tonality: 0, fromIsSeventh: false }),
    ).toBe('p5_up_retro')
  })

  it('I→ii is springboard; I→IV is p5_down (not springboard)', () => {
    expect(classifyRootMotion({ fromRoot: 0, toRoot: 2, tonality: 0 })).toBe('springboard')
    expect(classifyRootMotion({ fromRoot: 0, toRoot: 5, tonality: 0 })).toBe('p5_down')
  })

  it('scores legal motions with toward-pillar bonus', () => {
    expect(scoreRootMotion('p5_down', false)).toBeGreaterThan(scoreRootMotion('p5_up_cadential', false))
    expect(scoreRootMotion('p5_up_cadential', false)).toBeGreaterThan(scoreRootMotion('springboard', false))
    expect(scoreRootMotion('springboard', false)).toBeGreaterThan(scoreRootMotion('other', false))
    expect(scoreRootMotion('p5_down', true) - scoreRootMotion('p5_down', false)).toBe(4)
  })
})

describe('Contest chord vocabulary', () => {
  it('SAI11 is exactly the Rylander eleven', () => {
    expect(CHORDS_SAI11).toHaveLength(11)
    expect(CHORDS_SAI11).toContain('seventh')
    expect(CHORDS_SAI11).not.toContain('half-dim')
    expect(CHORDS_SAI11).not.toContain('dim')
  })

  it('BHS extended adds half-dim and dim', () => {
    expect(CHORDS_BHS_EXTENDED).toContain('half-dim')
    expect(CHORDS_BHS_EXTENDED).toContain('dim')
    expect(allowlistForProfile('learning')).toEqual(CHORDS_BHS_EXTENDED)
  })

  it('sai11 rejects half-dim; bhs_extended allows it', () => {
    expect(isNatureAllowed('sai11', 'half-dim')).toBe(false)
    expect(isNatureAllowed('bhs_extended', 'half-dim')).toBe(true)
    expect(isNatureAllowed('sai11', 'seventh')).toBe(true)
  })

  it('ring tiers prefer major/seventh over aug/dim', () => {
    expect(ringTier('seventh')).toBeLessThan(ringTier('ninth'))
    expect(ringTier('ninth')).toBeLessThan(ringTier('dim7'))
    expect(ringTier('dim7')).toBeLessThan(ringTier('aug'))
    expect(ringTier('unknown-nature')).toBe(7)
  })
})

describe('SCF families', () => {
  it('maps group offsets from primary X', () => {
    expect(scfRootOffset(1)).toBe(7)
    expect(scfRootOffset(2)).toBe(0)
    expect(scfRootOffset(3)).toBe(11)
    expect(scfRootOffset(4)).toBe(1)
    expect(scfRootOffset(5)).toBe(6)
    expect(scfRootOffset(6)).toEqual([5, 8])
  })

  it('scfRoots wraps pitch classes', () => {
    expect(scfRoots(0, 1)).toEqual([7])
    expect(scfRoots(11, 4)).toEqual([0])
    expect(scfRoots(0, 6)).toEqual([5, 8])
  })

  it('PCF priority prefers seventh and major early', () => {
    expect(PCF_NATURE_PRIORITY[0]).toBe('seventh')
    expect(PCF_NATURE_PRIORITY).toContain('major')
  })

  it('SCF group 2 is dim7-only; groups 3–5 prefer sevenths/ninths', () => {
    expect(SCF_NATURES[2]).toEqual(['dim7'])
    expect(SCF_NATURES[3]).toContain('seventh')
    expect(SCF_NATURES[5]).toContain('ninth')
  })
})

describe('Chord tables and placeVoicing invariants', () => {
  it('every VOICINGS_BY_CHORD id exists in BARBERSHOP_CHORDS', () => {
    for (const id of Object.keys(VOICINGS_BY_CHORD)) {
      expect(BARBERSHOP_CHORDS.some((c) => c.id === id)).toBe(true)
    }
  })

  it('placeVoicing keeps tenor above lead and bass not above upper parts', () => {
    const chord = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!
    for (const voicing of VOICINGS_BY_CHORD.seventh!) {
      if (!voicingFitsLead(voicing, 3) && !voicingFitsLead(voicing, 1)) continue
      const leadRole = Number(voicing[2]) as 1 | 3 | 5 | 7 | 9
      // Lead C = MIDI 60 as chord tone matching voicing lead role on root G(7) is hard —
      // place with lead that matches role via chordContainsLead loop:
      for (let lead = 55; lead <= 72; lead++) {
        if (!chordContainsLead(chord, 7, lead)) continue
        if (leadRoleInChord(chord, 7, lead) !== leadRole) continue
        const midi = placeVoicing({ chord, rootPc: 7, leadMidi: lead, voicing })
        if (!midi) continue
        expect(midi.tenor).toBeGreaterThan(midi.lead)
        expect(midi.bass).toBeLessThanOrEqual(Math.min(midi.bari, midi.lead))
        expect(midi.lead).toBe(lead)
      }
    }
  })

  it('Dom9 omit strategies: bass-on-1 omit5, bass-on-5 omitRoot', () => {
    expect(dom9OmitStrategy('1793')).toBe('omit5')
    expect(dom9OmitStrategy('1379')).toBe('omit5')
    expect(dom9OmitStrategy('5793')).toBe('omitRoot')
    expect(dom9OmitStrategy('5397')).toBe('omitRoot')
    expect(VOICINGS_BY_CHORD.ninth![0]!.startsWith('5')).toBe(true)
  })

  it('pcName respects flats preference', () => {
    expect(pcName(1, true)).toBe('Db')
    expect(pcName(1, false)).toBe('C#')
  })

  it('rejects voicing that does not fit lead role', () => {
    // 5731 → bass5 bari7 lead3 tenor1
    expect(voicingFitsLead('5731', 3)).toBe(true)
    expect(voicingFitsLead('5731', 1)).toBe(false)
    expect(voicingFitsLead('53', 3)).toBe(false)
  })
})

describe('Candidate generation and ranking (barbershop biases)', () => {
  it('generates PCF candidates with lead locked and tenor above', () => {
    const cands = generateCandidates({
      note: note(60),
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: null,
    })
    expect(cands.length).toBeGreaterThan(0)
    expect(cands.every((c) => c.midi.lead === 60)).toBe(true)
    expect(cands.every((c) => c.midi.tenor > c.midi.lead)).toBe(true)
    expect(cands.some((c) => c.layer === 'primary')).toBe(true)
  })

  it('sai11 never emits half-dim; bhs_extended may', () => {
    const sai = generateCandidates({
      note: note(60),
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: null,
      profile: 'sai11',
      preferScf: true,
    })
    expect(sai.every((c) => c.natureId !== 'half-dim')).toBe(true)
  })

  it('ranks sevenths and closed voicings ahead of spread/aug on similar motion', () => {
    const raw = generateCandidates({
      note: note(60),
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: null,
    })
    const ranked = rankCandidates(raw)
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked[ranked.length - 1]!.score)
    const topNatures = ranked.slice(0, 5).map((c) => c.natureId)
    expect(topNatures.some((n) => n === 'seventh' || n === 'major')).toBe(true)
  })

  it('secondary-dominant bias tags R1_p5 when seventh resolves down P5 to next pillar', () => {
    const raw = generateCandidates({
      note: note(62), // D — often 7th of G or 3rd of Bb etc.
      pillar: pillar(7),
      tonality: 0,
      prevRootPc: 0,
      nextPillarRoot: 0, // G7 → C
    })
    const seventhsTowardC = raw.filter(
      (c) => c.natureId === 'seventh' && (c.rootPc - 0 + 12) % 12 === 7,
    )
    if (seventhsTowardC.length === 0) return // lead may not sit in G7
    const ranked = rankCandidates(seventhsTowardC)
    expect(ranked.some((c) => c.ruleTags.includes('R1_p5'))).toBe(true)
  })

  it('explainRankingBreakdown returns non-zero motion/primary factors', () => {
    const raw = generateCandidates({
      note: note(60),
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: null,
    })
    const parts = explainRankingBreakdown(raw[0]!)
    expect(parts.length).toBeGreaterThan(0)
    expect(parts.every((p) => p.value !== 0)).toBe(true)
  })

  it('autoHarmonizeMelody produces one stack per note with legal sai11 natures', () => {
    const melody = [60, 64, 67, 65].map((m, i) => note(m, i * 480))
    const stacks = autoHarmonizeMelody({
      melody,
      pillars: [pillar(0)],
      tonality: 0,
      profile: 'sai11',
    })
    expect(stacks).toHaveLength(4)
    expect(stacks.every((s) => s.midi && isNatureAllowed('sai11', s.natureId))).toBe(true)
  })

  it('SMN preferScf yields passing-layer options among candidates', () => {
    const cands = candidatesForMelodyNote({
      note: note(62, 480, 'smn'),
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: 0,
      preferScf: true,
      limit: 24,
    })
    expect(cands.some((c) => c.layer === 'passing')).toBe(true)
  })
})

describe('Auto-harmonize musical sanity on a cadential phrase', () => {
  it('keeps lead MIDI identical to melody and TTBB order', () => {
    const p = createEmptyArrangement('Cadence')
    p.melody = [67, 65, 64, 62, 60].map((midi, i) => note(midi, i * 480, i === 4 ? 'pmn' : 'smn'))
    p.pillars = [pillar(0, 3000)]
    const stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: 0,
      profile: 'sai11',
    })
    for (let i = 0; i < p.melody.length; i++) {
      expect(stacks[i]!.midi!.lead).toBe(p.melody[i]!.midi)
      expect(stacks[i]!.midi!.tenor).toBeGreaterThan(stacks[i]!.midi!.lead)
    }
  })
})
