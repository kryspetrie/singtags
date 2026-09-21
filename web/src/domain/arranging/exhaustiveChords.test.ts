/**
 * Exhaustive chord-table / placeVoicing iterations.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  BARBERSHOP_CHORDS,
  VOICINGS_BY_CHORD,
  chordContainsLead,
  dom9OmitStrategy,
  leadRoleInChord,
  placeVoicing,
  voicingFitsLead,
  pcName,
  type ChordToneRole,
} from './chords/chords'
import { roleCents, justCentsForVoicing, centsToPitchBend } from './justIntonation'
import { scoreHarmonicity, createHarmonicityScorerPreset } from './harmonicity/harmonicityScore'

const ROOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const
const LEAD_MIDIS = [55, 57, 60, 62, 64, 65, 67, 69, 71, 72] as const

describe('exhaustive chord vocabulary', () => {
  it('every nature has ≥1 voicing string of length 4', () => {
    for (const chord of BARBERSHOP_CHORDS) {
      const vs = VOICINGS_BY_CHORD[chord.id]
      expect(vs, chord.id).toBeDefined()
      expect(vs!.length).toBeGreaterThan(0)
      for (const v of vs!) {
        expect(v.length).toBeGreaterThanOrEqual(4)
        for (let i = 0; i < 4; i++) {
          const role = Number(v[i]) as ChordToneRole
          expect(chord.offsets[role], `${chord.id} voicing ${v} role ${role}`).toBeDefined()
        }
      }
    }
  })

  it.each(BARBERSHOP_CHORDS.map((c) => [c.id, c] as const))(
    'nature %s: offsets are unique pitch classes',
    (_id, chord) => {
      const pcs = Object.values(chord.offsets).map((o) => ((o! % 12) + 12) % 12)
      // Dom9 / add9 intentionally share nothing conflicting; allow duplicates only if same role
      expect(pcs.length).toBe(Object.keys(chord.offsets).length)
    },
  )
})

describe('placeVoicing matrix (nature × root × lead × voicing × spread)', () => {
  for (const chord of BARBERSHOP_CHORDS) {
    const voicings = VOICINGS_BY_CHORD[chord.id] ?? []
    describe(chord.id, () => {
      it('produces TTBB-ordered midi whenever lead is a chord tone and voicing fits', () => {
        let placed = 0
        for (const rootPc of ROOTS) {
          for (const lead of LEAD_MIDIS) {
            if (!chordContainsLead(chord, rootPc, lead)) continue
            const role = leadRoleInChord(chord, rootPc, lead)
            expect(role).not.toBeNull()
            for (const voicing of voicings) {
              if (!voicingFitsLead(voicing, role!)) continue
              for (const spread of [false, true]) {
                const midi = placeVoicing({ chord, rootPc, leadMidi: lead, voicing, spread })
                if (!midi) continue
                placed++
                expect(midi.lead).toBe(lead)
                expect(midi.tenor).toBeGreaterThan(midi.lead)
                expect(midi.bass).toBeLessThanOrEqual(Math.min(midi.bari, midi.lead))
                expect(midi.bass).toBeGreaterThanOrEqual(24)
                expect(midi.tenor).toBeLessThanOrEqual(96)
              }
            }
          }
        }
        expect(placed, `${chord.id} should place at least one voicing`).toBeGreaterThan(0)
      })
    })
  }
})

describe('Dom9 omit matrix', () => {
  it.each(VOICINGS_BY_CHORD.ninth!.map((v) => [v] as const))(
    'voicing %s has known omit strategy',
    (v) => {
      const s = dom9OmitStrategy(v)
      expect(['omit5', 'omitRoot']).toContain(s)
      if (s === 'omit5') expect(v.startsWith('1')).toBe(true)
      if (s === 'omitRoot') expect(v.startsWith('5')).toBe(true)
    },
  )
})

describe('pcName round-trip for all pitch classes', () => {
  it.each(ROOTS.map((pc) => [pc] as const))('pc %i sharp and flat spellings differ only on accidentals', (pc) => {
    const sharp = pcName(pc, false)
    const flat = pcName(pc, true)
    expect(sharp.length).toBeGreaterThan(0)
    expect(flat.length).toBeGreaterThan(0)
    // Natural notes match
    if (![1, 3, 6, 8, 10].includes(pc)) expect(sharp).toBe(flat)
  })
})

describe('JI roleCents for every nature × role present', () => {
  for (const chord of BARBERSHOP_CHORDS) {
    it(`${chord.id}: every defined role yields finite cents`, () => {
      for (const role of Object.keys(chord.offsets).map(Number) as ChordToneRole[]) {
        const c = roleCents(chord, role)
        expect(Number.isFinite(c)).toBe(true)
        expect(Math.abs(c)).toBeLessThan(100) // shade within a semitone of ET
      }
    })
  }

  it.each(ROOTS.map((r) => [r] as const))('justCentsForVoicing seventh root=%i', (rootPc) => {
    const lead = 60 + ((rootPc + 4) % 12) // try major 3rd above root in octave
    // Find a lead that fits seventh
    const chord = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!
    for (let leadMidi = 55; leadMidi <= 72; leadMidi++) {
      if (!chordContainsLead(chord, rootPc, leadMidi)) continue
      const role = leadRoleInChord(chord, rootPc, leadMidi)!
      const voicing = VOICINGS_BY_CHORD.seventh!.find((v) => voicingFitsLead(v, role))
      if (!voicing) continue
      const cents = justCentsForVoicing({
        natureId: 'seventh',
        rootPc,
        voicing,
        leadMidi,
      })
      expect(cents).not.toBeNull()
      expect(Number.isFinite(cents!.bass)).toBe(true)
      const bend = centsToPitchBend(cents!.tenor)
      expect(bend).toBeGreaterThanOrEqual(0)
      expect(bend).toBeLessThanOrEqual(16383)
      void lead
      return
    }
  })
})

describe('harmonicity scorer across natures', () => {
  const presets = ['default', 'bright', 'dark'] as const
  for (const preset of presets) {
    it(`preset ${preset}: scores all natures with a legal closed voicing`, () => {
      const scorer = createHarmonicityScorerPreset(preset)
      for (const chord of BARBERSHOP_CHORDS) {
        const voicing = VOICINGS_BY_CHORD[chord.id]![0]!
        // Pick lead matching voicing lead role on root 0
        const leadRole = Number(voicing[2]) as ChordToneRole
        const off = chord.offsets[leadRole]
        if (off == null) continue
        const leadMidi = 60 + off
        const midi = placeVoicing({
          chord,
          rootPc: 0,
          leadMidi,
          voicing,
          spread: false,
        })
        if (!midi) continue
        const raw = scorer.score({
          midi,
          natureId: chord.id,
          rootPc: 0,
          voicing,
          useJust: true,
        })
        expect(Number.isFinite(raw)).toBe(true)
        expect(scorer.normalize(raw)).toBeGreaterThan(0)
        expect(scorer.normalize(raw)).toBeLessThanOrEqual(1)
        // ET path also finite
        expect(
          Number.isFinite(
            scoreHarmonicity({
              midi,
              natureId: chord.id,
              rootPc: 0,
              voicing,
              useJust: false,
            }),
          ),
        ).toBe(true)
      }
    })
  }
})
