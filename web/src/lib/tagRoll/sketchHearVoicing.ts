/**
 * Re-export domain sketch Hear voicing for Tag Studio consumers.
 * Prefer importing from `domain/arranging/sketchHearVoicing` in application code.
 */
export {
  SKETCH_HEAR_BASS_MIN,
  SKETCH_HEAR_TENOR_MAX,
  SKETCH_HEAR_DEFAULT_LEAD,
  optimizeSketchHearPath,
  sketchHearMidis,
  sketchHearVoicing,
  type SketchHearChordRef,
  type SketchHearQuality,
} from '../../domain/arranging/sketchHearVoicing'

// Keep HarmonySketchQuality-compatible alias used by older lib call sites.
export type { SketchHearQuality as HarmonySketchHearQuality } from '../../domain/arranging/sketchHearVoicing'
