/**
 * Turn a matched cadence catalog entry into concrete chord steps (key-relative).
 */
import { degreeOf, pcOf } from '../secondaryDominant'
import { isDominantNature } from '../tensionRelease'
import type { CadenceContext, CadenceDef } from './types'
import type { CadencePlanStep } from './planTypes'

function tonic(ctx: CadenceContext): number {
  return pcOf(ctx.tonality)
}

function dominant(ctx: CadenceContext): number {
  return pcOf(ctx.tonality + 7)
}

function subdominant(ctx: CadenceContext): number {
  return pcOf(ctx.tonality + 5)
}

function supertonic(ctx: CadenceContext): number {
  return pcOf(ctx.tonality + 2)
}

function flatTwo(ctx: CadenceContext): number {
  return pcOf(ctx.tonality + 1)
}

function flatSeven(ctx: CadenceContext): number {
  return pcOf(ctx.tonality + 10)
}

function melDeg(ctx: CadenceContext): number {
  return degreeOf(ctx.melodyMidi, ctx.tonality)
}

function step(
  momentOffset: number,
  rootPc: number,
  natureId: string,
  label: string,
  role: CadencePlanStep['role'],
): CadencePlanStep {
  return { momentOffset, rootPc: pcOf(rootPc), natureId, label, role }
}

/**
 * Materialize an applyable chord series for a catalog hit.
 * Returns null when the def has no multi-step recipe for this context shape.
 */
export function materializeCadenceSteps(
  def: CadenceDef,
  ctx: CadenceContext,
): CadencePlanStep[] | null {
  const match = def.matchContext(ctx)
  if (!match.hit) return null

  switch (def.id) {
    case 'auth_v7_i': {
      if (melDeg(ctx) === 7) {
        return [
          step(0, dominant(ctx), 'seventh', 'V7', 'approach'),
          step(1, tonic(ctx), 'major', 'I', 'arrival'),
        ]
      }
      // Completing into I after V7.
      return [step(0, tonic(ctx), 'major', 'I', 'arrival')]
    }
    case 'lead_tone_v7':
      return [
        step(0, dominant(ctx), 'seventh', 'V7', 'approach'),
        step(1, tonic(ctx), 'major', 'I', 'arrival'),
      ]
    case 'circle_ii_v_i': {
      const afterIi =
        ctx.prevRootPc != null &&
        ctx.prevNatureId != null &&
        (ctx.prevNatureId === 'seventh' || ctx.prevNatureId === 'ninth') &&
        degreeOf(ctx.prevRootPc, ctx.tonality) === 2
      if (afterIi) {
        return [
          step(0, dominant(ctx), 'seventh', 'V7', 'approach'),
          step(1, tonic(ctx), 'major', 'I', 'arrival'),
        ]
      }
      return [
        step(0, supertonic(ctx), 'seventh', 'II7', 'approach'),
        step(1, dominant(ctx), 'seventh', 'V7', 'approach'),
        step(2, tonic(ctx), 'major', 'I', 'arrival'),
      ]
    }
    case 'primary_dom7':
      return [
        step(0, tonic(ctx), 'seventh', 'I7', 'approach'),
        step(1, subdominant(ctx), 'major', 'IV', 'arrival'),
      ]
    case 'circle_frag': {
      const target = ctx.nextPillarRoot ?? ctx.pillarRoot
      if (target == null) return null
      const approach = pcOf(target + 7)
      return [step(0, approach, 'seventh', 'V7/next', 'approach')]
    }
    case 'plagal_iv_i':
      return [
        step(0, subdominant(ctx), 'major', 'IV', 'approach'),
        step(1, tonic(ctx), 'major', 'I', 'arrival'),
      ]
    case 'tag_penult':
      return [
        step(0, dominant(ctx), 'seventh', 'V7', 'approach'),
        step(1, tonic(ctx), 'major', 'I', 'arrival'),
      ]
    case 'half_cad':
      return [step(0, dominant(ctx), 'seventh', 'V7', 'arrival')]
    case 'light_bII':
      return [
        step(0, flatTwo(ctx), 'seventh', '♭II7', 'approach'),
        step(1, tonic(ctx), 'major', 'I', 'arrival'),
      ]
    case 'backdoor':
      return [
        step(0, flatSeven(ctx), 'seventh', '♭VII7', 'approach'),
        step(1, tonic(ctx), 'major', 'I', 'arrival'),
      ]
    default:
      return null
  }
}

/** Whether a previous stack looks like a dominant of the tonic (for context builders). */
export function prevLooksLikeAuthV7(ctx: CadenceContext): boolean {
  return (
    ctx.prevRootPc != null &&
    ctx.prevNatureId != null &&
    isDominantNature(ctx.prevNatureId) &&
    pcOf(ctx.prevRootPc - tonic(ctx)) === 7
  )
}
