/**
 * Pure types and localStorage helpers for the preferences store.
 * No Pinia. The store imports these and re-exports the public symbols.
 */
import {
  PITCH_PIPE_A_TUNINGS,
  aHzToCents,
  normalizePitchPipeGridScale,
  normalizePitchPipePianoDefaultOctave,
  normalizePitchPipeRange,
  normalizeSheetPianoKeyScale,
  normalizeSheetPianoHeightPx,
  isPitchPipeLayout,
  type PitchPipeAHz,
  type PitchPipeLayout,
  type PitchPipePianoDefaultOctave,
  type PitchPipeRange,
} from '../../audio/pitchUiLabels'
import {
  isPitchPipeSoundId,
  normalizePitchPipeAttackSec,
  PITCH_PIPE_ATTACK_SEC_DEFAULT,
  type PitchPipeSoundId,
} from '../../audio/pitchPipeVoice'
import {
  isPianoSoundEngineId,
  type PianoSoundEngineId,
} from '../../audio/pianoSamples'
import {
  defaultVoicingProfile,
  normalizeVoicingProfile,
  type VoicingProfile,
} from '../../domain/arranging/voicingProfile'
import {
  DEFAULT_PRIMARY_NAV_ORDER,
  normalizePrimaryNavHidden,
  normalizePrimaryNavOrder,
  normalizePrimaryNavPinCount,
  PRIMARY_NAV_PIN_COUNT,
  type PrimaryNavId,
} from '../../lib/primaryNav'
import type { LibraryAudioPartsMode } from '../../lib/audioParts'
import { normalizeMixPanSetting, type MixPanSetting } from '../../audio/multiPartMix'
import { normalizeCustomParts } from '../../lib/audioParts'
export type PartSide = 'left' | 'right'
export type { MixPanSetting }

/** Fullscreen multi-page navigation: discrete pages vs continuous scroll stack. */
export type SheetFsPageMode = 'paging' | 'scroll'

/** Pitch-pipe UI prefs (localStorage + offline cache zip). */
export type PitchPipePrefs = {
  range: PitchPipeRange
  layout: PitchPipeLayout
  /** Concert A preset, or null when the detune slider is off-preset (“—”). */
  aHz: PitchPipeAHz | null
  /** Absolute cents vs A440 (drives the slider and playback). */
  detuneCents: number
  /** When true, note labels include octave (E4); default off shows letter only (E). */
  showOctave: boolean
  /** Built-in pitch sound (Mellow default, Bright alternate). */
  sound: PitchPipeSoundId
  /** Grid layout key size (70–250%, step 5). */
  gridScale: number
  /** Piano layout: scrollable 66-key keyboard (C2–F7). */
  showFullKeyboard: boolean
  /** Horizontal piano: which C–C octave to open on (2 = C2–C3 … 6 = C6–C7). */
  pianoDefaultOctave: PitchPipePianoDefaultOctave
  /**
   * Piano layouts + sheet dock: synth (default pitch-pipe voice) or acoustic samples.
   * Grid/list always use synth.
   */
  pianoEngine: PianoSoundEngineId
  /** Horizontal piano / sheet dock: freeze scroll position (no drag-to-pan). */
  pianoLockPosition: boolean
  /**
   * When true, dim keys outside the computer-keyboard (A–' / S–L) window.
   * Default on; turn off on mobile if the highlight is distracting.
   */
  showPcKeyRange: boolean
  /**
   * Synth note-on fade-in (seconds). Starts at 25% level, ramps to full.
   * 0 = instant. Acoustic samples ignore this.
   */
  attackSec: number
}

export const SOLO_IN_FILE_KEY = 'singtags.partSoloInFile.v1'
export const MIX_PAN_KEY = 'singtags.partMixPan.v2'
/** @deprecated string left/right map — migrated into v2 MixPanSetting objects. */
export const MIX_PAN_KEY_V1 = 'singtags.partMixPan.v1'
/** Which learning parts are checked in the Custom mix tab. */
export const MIX_SELECTED_KEY = 'singtags.partMixSelected.v1'
export const BROWSE_WELCOME_KEY = 'singtags.browseWelcomeDismissed.v1'
export const SING_MODE_KEY = 'singtags.singMode.v1'
export const SHARE_FULLSCREEN_KEY = 'singtags.shareFullscreen.v1'
export const SHARE_BARBERSHOP_TAGS_KEY = 'singtags.shareBarbershopTags.v1'
/** Fullscreen multi-page: one-page pager vs continuous vertical scroll. */
export const SHEET_FS_PAGE_MODE_KEY = 'singtags.sheetFsPageMode.v1'
/** Fullscreen sheet piano dock: white-key width percent. */
export const SHEET_PIANO_KEY_SCALE_KEY = 'singtags.sheetPianoKeyScale.v2'
/** @deprecated superseded by v2 after null→0 normalize bug wrote 25% as default. */
export const SHEET_PIANO_KEY_SCALE_KEY_V1 = 'singtags.sheetPianoKeyScale.v1'
/** Fullscreen sheet piano dock: key-strip height in px. */
export const SHEET_PIANO_HEIGHT_KEY = 'singtags.sheetPianoHeightPx.v1'
/** Invert sheet page colors (night reading). */
export const SHEET_INVERT_KEY = 'singtags.sheetInvert.v1'
/** Labs: animated QR file transfer (Decimen). Default on. */
export const OPTICAL_TRANSFER_ENABLED_KEY = 'singtags.labs.opticalTransfer.enabled.v1'
/** Labs: on-device Local Library (charts/images/tracks). Default off. */
export const LOCAL_LIBRARY_ENABLED_KEY = 'singtags.labs.localLibrary.enabled.v1'
/** Labs: WebRTC DataChannel transfer (Wi‑Fi / hotspot). Default off. */
export const WEBRTC_TRANSFER_ENABLED_KEY = 'singtags.labs.webrtcTransfer.enabled.v1'
/** Labs: Digital Tuner (on-device mic pitch). Default off. */
export const DIGITAL_TUNER_ENABLED_KEY = 'singtags.labs.digitalTuner.enabled.v1'
/** Digital Tuner settings blob (no f0 history). */
export const DIGITAL_TUNER_PREFS_KEY = 'singtags.digitalTuner.v1'
/** @deprecated OS Share / Quick Share / AirDrop removed; key retained for migrate. */
export const OS_SHARE_TRANSFER_ENABLED_KEY = 'singtags.labs.osShareTransfer.enabled.v1'
export const AUDIO_RECORDER_ENABLED_KEY = 'singtags.labs.audioRecorder.enabled.v1'
/** Labs: Sing Together repertoire correlation via QR. Default off. */
export const SING_TOGETHER_ENABLED_KEY = 'singtags.labs.singTogether.enabled.v1'
/** Labs: Tag Roll piano-roll composer. Default off. */
export const TAG_ROLL_ENABLED_KEY = 'singtags.labs.tagRoll.enabled.v1'
/** Labs: Arranging coach gate. Default off until package port. */
export const ARRANGING_ENABLED_KEY = 'singtags.labs.arranging.enabled.v1'
export const TAG_ROLL_CELL_W_KEY = 'singtags.labs.tagRoll.cellW.v1'
export const TAG_ROLL_CELL_H_KEY = 'singtags.labs.tagRoll.cellH.v1'
export const TAG_ROLL_METRONOME_SOUND_KEY = 'singtags.labs.tagRoll.metronomeSound.v1'
export const TAG_ROLL_METRONOME_VOLUME_KEY = 'singtags.labs.tagRoll.metronomeVolume.v1'
export const TAG_ROLL_SOUNDFONT_FAVORITES_KEY = 'singtags.labs.tagRoll.soundfontFavorites.v1'
export const TAG_ROLL_EXPRESSION_LANE_COLLAPSED_KEY = 'singtags.labs.tagRoll.expressionLaneCollapsed.v1'
export const TAG_ROLL_COACH_LANE_COLLAPSED_KEY = 'singtags.labs.tagRoll.coachLaneCollapsed.v1'
export const TAG_ROLL_COACH_GUIDED_STEP_KEY = 'singtags.labs.tagRoll.coachGuidedStep.v1'
export const TAG_ROLL_CHORD_WALK_AUTO_ADVANCE_KEY = 'singtags.labs.tagRoll.chordWalkAutoAdvance.v1'
export const TAG_ROLL_VOICING_RANGES_OPEN_KEY = 'singtags.labs.tagRoll.voicingRangesOpen.v1'
export const TAG_ROLL_VOICING_RANGE_FILTER_KEY = 'singtags.labs.tagRoll.voicingRangeFilter.v1'
export const TAG_ROLL_PATH_OPTIMIZE_PREFS_KEY = 'singtags.labs.tagRoll.pathOptimize.v1'
/** @deprecated migrated to chordsLaneCollapsed */
export const TAG_ROLL_DECLARED_LANE_COLLAPSED_KEY = 'singtags.labs.tagRoll.declaredLaneCollapsed.v1'
export const TAG_ROLL_CHORDS_LANE_COLLAPSED_KEY = 'singtags.labs.tagRoll.chordsLaneCollapsed.v1'
export const TAG_ROLL_DETECTED_LANE_COLLAPSED_KEY = 'singtags.labs.tagRoll.detectedLaneCollapsed.v1'
export const TAG_ROLL_LYRICS_LANE_COLLAPSED_KEY = 'singtags.labs.tagRoll.lyricsLaneCollapsed.v1'

export type TagRollBottomLaneId = 'chords' | 'detected' | 'mods' | 'coach' | 'lyrics'
/** Default gain for Tag Studio metronome clicks (matches MetronomeClicker). */
export const TAG_ROLL_METRONOME_VOLUME_DEFAULT = 0.85
export const TAG_ROLL_METRONOME_VOLUME_MAX = 1.5
/** Ordered primary-nav destinations; first N available become chrome pins. */
export const PRIMARY_NAV_ORDER_KEY = 'singtags.primaryNav.order.v1'
/** Non-lab primary-nav pages hidden from chrome and More. */
export const PRIMARY_NAV_HIDDEN_KEY = 'singtags.primaryNav.hidden.v1'
/** When true, use primaryNavPinCount instead of the default 5 slots. */
export const PRIMARY_NAV_PIN_OVERRIDE_KEY = 'singtags.primaryNav.pinOverride.v1'
/** Preferred pin-slot count when override is on. */
export const PRIMARY_NAV_PIN_COUNT_KEY = 'singtags.primaryNav.pinCount.v1'
export const RECORDER_CAPTURE_KEY = 'singtags.recorder.capture.v1'
export const QUICK_RECORD_KEY = 'singtags.recorder.quick.v1'
export const OPTICAL_FRAME_BYTES_KEY = 'singtags.opticalTransfer.frameBytes.v1'
export const OPTICAL_GRID_CODES_KEY = 'singtags.opticalTransfer.gridCodes.v1'
export const OPTICAL_AUTO_DENSITY_KEY = 'singtags.opticalTransfer.autoDensity.v1'
export const OPTICAL_TX_FPS_KEY = 'singtags.opticalTransfer.txFps.v1'
export const OPTICAL_DISPLAY_SCALE_KEY = 'singtags.opticalTransfer.displayScale.v1'
export const OPTICAL_PRESET_KEY = 'singtags.opticalTransfer.preset.v1'
export const OPTICAL_CAMERA_DEVICE_KEY = 'singtags.opticalTransfer.cameraDeviceId.v1'
export const LIBRARY_PARTS_MODE_KEY = 'singtags.libraryAudioPartsMode.v1'
export const LIBRARY_PARTS_KEY = 'singtags.libraryAudioParts.v1'
export const PITCH_PIPE_PREFS_KEY = 'singtags.pitchPipe.v1'
export const APPLY_DETUNE_GLOBAL_KEY = 'singtags.applyDetuneGlobally.v1'
/** @deprecated migrated into PITCH_PIPE_PREFS_KEY */
export const PITCH_PIPE_RANGE_KEY = 'singtags.pitchPipeRange.v1'
/** @deprecated migrated into PITCH_PIPE_LAYOUT_KEY */
export const PITCH_PIPE_LAYOUT_KEY = 'singtags.pitchPipeLayout.v1'
/** @deprecated quality is fixed at 64 kbps Opus; drop leftover user preference. */
export const LEGACY_AUDIO_QUALITY_KEY = 'singtags.audioEncodeQuality.v1'
export const A_HZ_SET = new Set<number>(PITCH_PIPE_A_TUNINGS.map((t) => t.hz))

try {
  localStorage.removeItem(LEGACY_AUDIO_QUALITY_KEY)
} catch {
  /* ignore */
}

/** Default pitch-pipe settings (E3–E4 grid at A440, mellow sound). */
export function defaultPitchPipePrefs(): PitchPipePrefs {
  return {
    range: 'e3-e4',
    layout: 'grid',
    aHz: 440,
    detuneCents: 0,
    showOctave: false,
    sound: 'mellow',
    gridScale: 100,
    showFullKeyboard: false,
    pianoDefaultOctave: 4,
    pianoEngine: 'synth',
    pianoLockPosition: false,
    showPcKeyRange: true,
    attackSec: PITCH_PIPE_ATTACK_SEC_DEFAULT,
  }
}

/** Clamp detune slider to ±50 cents (integer). */
export function clampDetuneCents(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(-50, Math.min(50, Math.round(n)))
}

/** Map absolute detune cents to a known concert-A preset, if exact match. */
export function matchConcertA(cents: number): PitchPipeAHz | null {
  for (const t of PITCH_PIPE_A_TUNINGS) {
    if (aHzToCents(t.hz) === cents) return t.hz
  }
  return null
}

/** Legacy: `fineCents` was an offset on top of concert A. */
export function fromLegacyFineCents(aHz: PitchPipeAHz, fineCents: number): PitchPipePrefs['detuneCents'] {
  return clampDetuneCents(aHzToCents(aHz) + fineCents)
}

/**
 * Parse pitch-pipe prefs from JSON (localStorage or offline zip).
 * Supports current `detuneCents` format and legacy `fineCents` offset format.
 *
 * @returns Parsed prefs or null when invalid.
 */
export function parsePitchPipePrefs(raw: unknown): PitchPipePrefs | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const range = normalizePitchPipeRange(o.range)
  const layout = isPitchPipeLayout(o.layout) ? o.layout : null
  if (!range || !layout) return null

  const showOctave = o.showOctave === true
  const sound: PitchPipeSoundId = isPitchPipeSoundId(o.sound) ? o.sound : 'mellow'
  const gridScale = normalizePitchPipeGridScale(o.gridScale)
  const showFullKeyboard = o.showFullKeyboard === true
  const pianoDefaultOctave = normalizePitchPipePianoDefaultOctave(o.pianoDefaultOctave)
  const pianoEngine: PianoSoundEngineId = isPianoSoundEngineId(o.pianoEngine)
    ? o.pianoEngine
    : 'synth'
  const pianoLockPosition = o.pianoLockPosition === true
  /** Missing key → true (legacy prefs keep highlighting). */
  const showPcKeyRange = o.showPcKeyRange !== false
  const attackSec =
    o.attackSec === undefined ? PITCH_PIPE_ATTACK_SEC_DEFAULT : normalizePitchPipeAttackSec(o.attackSec)

  // New format: absolute detuneCents; aHz may be null (custom).
  if (typeof o.detuneCents === 'number') {
    const detuneCents = clampDetuneCents(o.detuneCents)
    const aHz =
      o.aHz === null
        ? null
        : typeof o.aHz === 'number' && A_HZ_SET.has(o.aHz)
          ? (o.aHz as PitchPipeAHz)
          : matchConcertA(detuneCents)
    return {
      range,
      layout,
      aHz,
      detuneCents,
      showOctave,
      sound,
      gridScale,
      showFullKeyboard,
      pianoDefaultOctave,
      pianoEngine,
      pianoLockPosition,
      showPcKeyRange,
      attackSec,
    }
  }

  // Legacy format: aHz required + fineCents on top of that A.
  const aHz = typeof o.aHz === 'number' && A_HZ_SET.has(o.aHz) ? (o.aHz as PitchPipeAHz) : null
  if (aHz == null) return null
  const fine = typeof o.fineCents === 'number' ? o.fineCents : 0
  const detuneCents = fromLegacyFineCents(aHz, fine)
  return {
    range,
    layout,
    aHz: matchConcertA(detuneCents),
    detuneCents,
    showOctave,
    sound,
    gridScale,
    showFullKeyboard,
    pianoDefaultOctave,
    pianoEngine,
    pianoLockPosition,
    showPcKeyRange,
    attackSec,
  }
}

/** Read deprecated per-key pitch pipe range from localStorage. */
export function loadLegacyPitchPipeRange(): PitchPipeRange {
  try {
    const mapped = normalizePitchPipeRange(localStorage.getItem(PITCH_PIPE_RANGE_KEY))
    if (mapped) return mapped
  } catch {
    /* ignore */
  }
  return 'e3-e4'
}

/** Read deprecated per-key pitch pipe layout from localStorage. */
export function loadLegacyPitchPipeLayout(): PitchPipeLayout {
  try {
    const raw = localStorage.getItem(PITCH_PIPE_LAYOUT_KEY)
    if (isPitchPipeLayout(raw)) return raw
  } catch {
    /* ignore */
  }
  return 'grid'
}

/**
 * Load pitch-pipe prefs from localStorage, with legacy key migration fallback.
 * Side effect: reads localStorage only.
 */
export function loadPitchPipePrefs(): PitchPipePrefs {
  try {
    const raw = localStorage.getItem(PITCH_PIPE_PREFS_KEY)
    if (raw) {
      const parsed = parsePitchPipePrefs(JSON.parse(raw) as unknown)
      if (parsed) return parsed
    }
  } catch {
    /* ignore */
  }
  return {
    range: loadLegacyPitchPipeRange(),
    layout: loadLegacyPitchPipeLayout(),
    aHz: 440,
    detuneCents: 0,
    showOctave: false,
    sound: 'mellow',
    gridScale: 100,
    showFullKeyboard: false,
    pianoDefaultOctave: 4,
    pianoEngine: 'synth',
    pianoLockPosition: false,
    showPcKeyRange: true,
    attackSec: PITCH_PIPE_ATTACK_SEC_DEFAULT,
  }
}

/**
 * Persist pitch-pipe prefs and remove deprecated split keys.
 * Side effect: localStorage write/remove.
 */
export function savePitchPipePrefs(prefs: PitchPipePrefs): void {
  try {
    localStorage.setItem(PITCH_PIPE_PREFS_KEY, JSON.stringify(prefs))
    localStorage.removeItem(PITCH_PIPE_RANGE_KEY)
    localStorage.removeItem(PITCH_PIPE_LAYOUT_KEY)
  } catch {
    /* ignore */
  }
}

/** Snapshot for offline cache zip (`preferences/pitch-pipe.json`). */
export function pitchPipePrefsSnapshot(): PitchPipePrefs {
  return loadPitchPipePrefs()
}

/** Apply snapshot from offline cache zip into localStorage. */
export function applyPitchPipePrefsSnapshot(raw: unknown): boolean {
  const parsed = parsePitchPipePrefs(raw)
  if (!parsed) return false
  savePitchPipePrefs(parsed)
  return true
}

/** Read a boolean flag from localStorage (`1`/`0`, `true`/`false`). */
export function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
  } catch {
    /* ignore */
  }
  return fallback
}

export function loadNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

export function loadString(key: string, fallback: string): string {
  try {
    const raw = localStorage.getItem(key)
    return raw == null || raw === '' ? fallback : raw
  } catch {
    return fallback
  }
}

export type TagRollPathOptimizeTaste = 'classic' | 'circle' | 'busy'

export type TagRollPathOptimizePrefs = {
  mode: 'fill' | 'revoice' | 'rechord' | 'full'
  /** 0 = Basic (simple/obvious), 1 = Risky. */
  risk: number
  /** @deprecated Kept for older localStorage; mapped to risk when risk missing. */
  voiceLeading?: number
  cadenceBias: 'off' | 'moderate' | 'strong'
  /** Classic / Circle / Busy candidate-gate profile. */
  taste: TagRollPathOptimizeTaste
  maxPasses: number
  /** Stop a stage when pass-to-pass score gain is below ε. */
  stopEarly: boolean
  /** Skip reject gate so optimize may worsen jumpiness / motion / lint. */
  allowWorsen: boolean
  /** Ensemble ranges / pitch center for Revoice. */
  voicingProfile: VoicingProfile
}

export function defaultPathOptimizePrefs(): TagRollPathOptimizePrefs {
  return {
    mode: 'full',
    risk: 0.2,
    cadenceBias: 'moderate',
    taste: 'classic',
    maxPasses: 12,
    stopEarly: true,
    allowWorsen: false,
    voicingProfile: defaultVoicingProfile(),
  }
}

export function loadPathOptimizePrefs(): TagRollPathOptimizePrefs {
  const d = defaultPathOptimizePrefs()
  try {
    const raw = localStorage.getItem(TAG_ROLL_PATH_OPTIMIZE_PREFS_KEY)
    if (!raw) return d
    const j = JSON.parse(raw) as Partial<TagRollPathOptimizePrefs>
    const mode =
      j.mode === 'fill' || j.mode === 'revoice' || j.mode === 'rechord' || j.mode === 'full'
        ? j.mode
        : d.mode
    const cadenceBias =
      j.cadenceBias === 'off' || j.cadenceBias === 'moderate' || j.cadenceBias === 'strong'
        ? j.cadenceBias
        : d.cadenceBias
    const risk =
      typeof j.risk === 'number' && Number.isFinite(j.risk)
        ? Math.min(1, Math.max(0, j.risk))
        : typeof j.voiceLeading === 'number' && Number.isFinite(j.voiceLeading)
          ? Math.min(1, Math.max(0, 1 - j.voiceLeading))
          : d.risk
    const maxPasses =
      typeof j.maxPasses === 'number' && Number.isFinite(j.maxPasses)
        ? Math.min(500, Math.max(1, Math.round(j.maxPasses)))
        : d.maxPasses
    const stopEarly = typeof j.stopEarly === 'boolean' ? j.stopEarly : d.stopEarly
    const allowWorsen = typeof j.allowWorsen === 'boolean' ? j.allowWorsen : d.allowWorsen
    const taste: TagRollPathOptimizeTaste =
      j.taste === 'circle' || j.taste === 'busy' || j.taste === 'classic' ? j.taste : d.taste
    const voicingProfile = normalizeVoicingProfile(j.voicingProfile)
    return { mode, risk, cadenceBias, taste, maxPasses, stopEarly, allowWorsen, voicingProfile }
  } catch {
    return d
  }
}

/** Normalize / load fullscreen sheet page mode from localStorage. */
export function normalizeSheetFsPageMode(raw: unknown): SheetFsPageMode {
  return raw === 'scroll' ? 'scroll' : 'paging'
}

export function loadSheetFsPageMode(): SheetFsPageMode {
  try {
    return normalizeSheetFsPageMode(localStorage.getItem(SHEET_FS_PAGE_MODE_KEY))
  } catch {
    return 'paging'
  }
}

export function loadSheetPianoKeyScale(): number {
  try {
    // Drop poisoned v1 values (unset → Number(null)===0 → clamped to 25%).
    localStorage.removeItem(SHEET_PIANO_KEY_SCALE_KEY_V1)
    return normalizeSheetPianoKeyScale(localStorage.getItem(SHEET_PIANO_KEY_SCALE_KEY))
  } catch {
    return normalizeSheetPianoKeyScale(null)
  }
}

export function loadSheetPianoHeightPx(): number {
  try {
    return normalizeSheetPianoHeightPx(localStorage.getItem(SHEET_PIANO_HEIGHT_KEY))
  } catch {
    return normalizeSheetPianoHeightPx(null)
  }
}

/** Read a string array from localStorage JSON; normalizes custom audio part names. */
export function loadStringArray(key: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return fallback
    return normalizeCustomParts(parsed.filter((v) => typeof v === 'string') as string[])
  } catch {
    return fallback
  }
}

/** SoundFont instrument favorites (`soundfontId|bankMSB:bankLSB:program`). */
export function loadSoundfontFavoriteKeys(): string[] {
  try {
    const raw = localStorage.getItem(TAG_ROLL_SOUNDFONT_FAVORITES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: string[] = []
    const seen = new Set<string>()
    for (const v of parsed) {
      if (typeof v !== 'string') continue
      const key = v.trim().slice(0, 96)
      if (!key || seen.has(key)) continue
      // soundfontId|msb:lsb:program
      if (!/^[a-z0-9-]+\|\d{1,3}:\d{1,3}:\d{1,3}$/i.test(key)) continue
      seen.add(key)
      out.push(key)
      if (out.length >= 64) break
    }
    return out
  } catch {
    return []
  }
}

export function loadPrimaryNavOrder(): PrimaryNavId[] {
  try {
    const raw = localStorage.getItem(PRIMARY_NAV_ORDER_KEY)
    if (!raw) return [...DEFAULT_PRIMARY_NAV_ORDER]
    return normalizePrimaryNavOrder(JSON.parse(raw) as unknown)
  } catch {
    return [...DEFAULT_PRIMARY_NAV_ORDER]
  }
}

export function loadPrimaryNavHidden(): PrimaryNavId[] {
  try {
    const raw = localStorage.getItem(PRIMARY_NAV_HIDDEN_KEY)
    if (!raw) return []
    return normalizePrimaryNavHidden(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

export function loadPrimaryNavPinCount(): number {
  try {
    return normalizePrimaryNavPinCount(localStorage.getItem(PRIMARY_NAV_PIN_COUNT_KEY))
  } catch {
    return PRIMARY_NAV_PIN_COUNT
  }
}

/** Read library audio parts mode from localStorage. */
export function loadPartsMode(): LibraryAudioPartsMode {
  try {
    const raw = localStorage.getItem(LIBRARY_PARTS_MODE_KEY)
    if (raw === 'all' || raw === 'mix' || raw === 'custom') return raw
  } catch {
    /* ignore */
  }
  return 'all'
}

/** Read per-part left/right map from localStorage (solo channel). */
export function loadSideMap(key: string): Record<string, PartSide> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, PartSide> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (v === 'left' || v === 'right') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** Read Custom-mix pan map (v2 objects, with v1 string migration). */
export function loadMixPanMap(): Record<string, MixPanSetting> {
  try {
    const raw = localStorage.getItem(MIX_PAN_KEY) ?? localStorage.getItem(MIX_PAN_KEY_V1)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, MixPanSetting> = {}
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = normalizeMixPanSetting(v)
    }
    return out
  } catch {
    return {}
  }
}

export function loadMixSelectedMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(MIX_SELECTED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}
