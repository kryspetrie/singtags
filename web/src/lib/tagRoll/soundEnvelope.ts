/**
 * Tag Studio sound envelope: attack + two note-off decays.
 * - decaySec — release into the next same-part note (legato / abutting)
 * - phraseDecaySec — release when a note ends into silence (phrase end, fermata gap)
 */
export type TagRollSoundEnvelope = {
  /** Seconds from silence to full level on note-on. */
  attackSec: number
  /** Seconds to silence when another same-part note follows immediately. */
  decaySec: number
  /** Seconds to silence when the note ends into a gap (phrase end). */
  phraseDecaySec: number
}

export const TAG_ROLL_DEFAULT_SOUND_ENVELOPE: TagRollSoundEnvelope = {
  attackSec: 0.05,
  decaySec: 0.05,
  phraseDecaySec: 0.45,
}

export const TAG_ROLL_ATTACK_SEC_MIN = 0.005
export const TAG_ROLL_ATTACK_SEC_MAX = 0.5
export const TAG_ROLL_DECAY_SEC_MIN = 0.005
export const TAG_ROLL_DECAY_SEC_MAX = 0.5
export const TAG_ROLL_PHRASE_DECAY_SEC_MIN = 0.005
export const TAG_ROLL_PHRASE_DECAY_SEC_MAX = 1.5
/** Range input step for attack/decay (5 ms). */
export const TAG_ROLL_ENVELOPE_SEC_STEP = 0.005

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function normalizeSoundEnvelope(raw: unknown): TagRollSoundEnvelope {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const hasPhrase = typeof o.phraseDecaySec === 'number' && Number.isFinite(o.phraseDecaySec)
  const oldDecay =
    typeof o.decaySec === 'number' && Number.isFinite(o.decaySec) ? o.decaySec : null
  return {
    attackSec: clamp(
      Number(o.attackSec) || TAG_ROLL_DEFAULT_SOUND_ENVELOPE.attackSec,
      TAG_ROLL_ATTACK_SEC_MIN,
      TAG_ROLL_ATTACK_SEC_MAX,
    ),
    // Legacy single-decay projects: keep short legato default; map old value → phrase.
    decaySec: clamp(
      hasPhrase
        ? (oldDecay ?? TAG_ROLL_DEFAULT_SOUND_ENVELOPE.decaySec)
        : TAG_ROLL_DEFAULT_SOUND_ENVELOPE.decaySec,
      TAG_ROLL_DECAY_SEC_MIN,
      TAG_ROLL_DECAY_SEC_MAX,
    ),
    phraseDecaySec: clamp(
      hasPhrase
        ? Number(o.phraseDecaySec)
        : (oldDecay ?? TAG_ROLL_DEFAULT_SOUND_ENVELOPE.phraseDecaySec),
      TAG_ROLL_PHRASE_DECAY_SEC_MIN,
      TAG_ROLL_PHRASE_DECAY_SEC_MAX,
    ),
  }
}

/** Release length for a note-off given whether the note ends a phrase (no follower). */
export function releaseSecForNoteEnd(
  env: TagRollSoundEnvelope,
  phraseEnd: boolean,
): number {
  return phraseEnd ? env.phraseDecaySec : env.decaySec
}
