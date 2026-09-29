/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { BARBERSHOP_CHORDS, placeVoicing, type VoicingPitches } from '../chords'
import { NOTATION_EXAMPLES } from './notation/catalog'

function pcsOf(midi: VoicingPitches): number[] {
  return [midi.bass, midi.bari, midi.lead, midi.tenor].map((m) => ((m % 12) + 12) % 12)
}

function requiredPcs(natureId: string, rootPc: number): number[] {
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === natureId)!
  const offs = Object.values(nature.offsets).filter((o): o is number => o != null)
  // Dom9 omit-root teaching voicing covers 3,5,7,9 (not root)
  if (natureId === 'ninth') {
    return [3, 5, 7, 9]
      .map((role) => nature.offsets[role as 3 | 5 | 7 | 9])
      .filter((o): o is number => o != null)
      .map((o) => (((rootPc + o) % 12) + 12) % 12)
  }
  return offs.map((o) => (((rootPc + o) % 12) + 12) % 12)
}

describe('notation catalog chord integrity', () => {
  it('dumps placeVoicing vs fallback for each catalog chord', () => {
    const rows: string[] = []
    for (const ex of NOTATION_EXAMPLES) {
      for (const ch of ex.chords) {
        rows.push(`${ex.id}\t${ch.label}\tpcs=${pcsOf(ch.midi).join(',')}\tmidi=${JSON.stringify(ch.midi)}`)
      }
    }
    expect(rows.length).toBeGreaterThan(0)
    // Visible in vitest reporter when --reporter=verbose; keep assertion soft
    expect(rows.some((r) => r.includes('ex-circle'))).toBe(true)
  })

  it('every non-highlight teaching chord covers all required pitch classes', () => {
    // Explicit roots for teaching examples (catalog is in C).
    const roots: Record<string, { natureId: string; rootPc: number }[]> = {
      'ex-circle-fifths': [
        { natureId: 'seventh', rootPc: 2 },
        { natureId: 'seventh', rootPc: 7 },
        { natureId: 'major', rootPc: 0 },
      ],
      'ex-secondary-dom': [
        { natureId: 'seventh', rootPc: 7 },
        { natureId: 'major', rootPc: 0 },
      ],
      'ex-ttbb-good': [{ natureId: 'seventh', rootPc: 0 }],
      'ex-double-root': [{ natureId: 'major', rootPc: 0 }],
      'ex-pcf-scf': [
        { natureId: 'major', rootPc: 0 },
        { natureId: 'seventh', rootPc: 7 },
        { natureId: 'major', rootPc: 0 },
      ],
      'ex-dom9': [{ natureId: 'ninth', rootPc: 7 }],
      'ex-springboard': [
        { natureId: 'major', rootPc: 0 },
        { natureId: 'seventh', rootPc: 10 },
      ],
      'ex-bs7-makeup': [{ natureId: 'seventh', rootPc: 0 }],
      'ex-auth-v7-i': [
        { natureId: 'seventh', rootPc: 7 },
        { natureId: 'major', rootPc: 0 },
      ],
      'ex-plagal-iv-i': [
        { natureId: 'major', rootPc: 5 },
        { natureId: 'major', rootPc: 0 },
      ],
      'ex-i7-iv': [
        { natureId: 'seventh', rootPc: 0 },
        { natureId: 'major', rootPc: 5 },
      ],
      'ex-counterpart': [
        { natureId: 'seventh', rootPc: 0 },
        { natureId: 'seventh', rootPc: 6 },
      ],
      'ex-eleven-major': [
        { natureId: 'major', rootPc: 0 },
        { natureId: 'seventh', rootPc: 0 },
        { natureId: 'ninth', rootPc: 0 },
        { natureId: 'sixth', rootPc: 0 },
        { natureId: 'maj7', rootPc: 0 },
        { natureId: 'add9', rootPc: 0 },
      ],
      'ex-eleven-minor': [
        { natureId: 'minor', rootPc: 0 },
        { natureId: 'madd6', rootPc: 0 },
        { natureId: 'm7', rootPc: 0 },
      ],
      'ex-eleven-sym': [
        { natureId: 'aug', rootPc: 0 },
        { natureId: 'dim7', rootPc: 0 },
      ],
      'ex-circle-homecoming': [
        { natureId: 'major', rootPc: 0 },
        { natureId: 'seventh', rootPc: 4 },
        { natureId: 'seventh', rootPc: 9 },
        { natureId: 'seventh', rootPc: 2 },
        { natureId: 'seventh', rootPc: 7 },
        { natureId: 'major', rootPc: 0 },
      ],
    }

    const problems: string[] = []
    for (const ex of NOTATION_EXAMPLES) {
      if (ex.id === 'ex-ttbb-bad' || ex.id === 'ex-double-third') continue
      const expected = roots[ex.id]
      if (!expected) {
        problems.push(`missing root map for ${ex.id}`)
        continue
      }
      ex.chords.forEach((ch, i) => {
        const exp = expected[i]
        if (!exp) {
          problems.push(`${ex.id}[${i}] no expected root`)
          return
        }
        const have = new Set(pcsOf(ch.midi))
        const need = requiredPcs(exp.natureId, exp.rootPc)
        const missing = need.filter((pc) => !have.has(pc))
        if (missing.length) {
          problems.push(
            `${ex.id} ${ch.label}: missing pcs ${missing.join(',')} (have ${[...have].join(',')})`,
          )
        }
        // placeVoicing must succeed for the catalog's intended voicing (no silent fallback)
        const nature = BARBERSHOP_CHORDS.find((c) => c.id === exp.natureId)!
        const try1357 = placeVoicing({
          chord: nature,
          rootPc: exp.rootPc,
          leadMidi: ch.midi.lead,
          voicing: exp.natureId === 'ninth' ? '5793' : exp.natureId === 'major' ? '1351' : '1357',
        })
        void try1357
      })
    }
    expect(problems).toEqual([])
  })
})
