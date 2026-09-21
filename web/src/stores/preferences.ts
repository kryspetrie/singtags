/**
 * Shared UI preferences: multi-part audio mix/solo, pitch pipe, browse welcome,
 * and library audio part selection. Most fields persist to localStorage; pitch pipe
 * also round-trips through offline cache zip snapshots.
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
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
} from '../audio/pitchPlayer'
import {
  clearActivePitchPipeVoice,
  isPitchPipeSoundId,
  type PitchPipeSoundId,
} from '../audio/pitchPipeVoice'
import {
  isPianoSoundEngineId,
  type PianoSoundEngineId,
} from '../audio/pianoSamples'
import {
  DEFAULT_METRONOME_SOUND_ID,
  isMetronomeSoundId,
  type MetronomeSoundId,
} from '../audio/metronomeSamples'
import {
  UI_SCALE_DEFAULT,
  UI_SCALE_STEP,
  applyUiScale,
  normalizeUiScalePercent,
  resolveInitialUiScale,
  writeStoredUiScale,
} from '../lib/uiScale'
import {
  APP_THEME_DEFAULT,
  applyAppTheme,
  normalizeAppTheme,
  resolveInitialAppTheme,
  writeStoredAppTheme,
  type AppTheme,
} from '../lib/theme'
import {
  applyEmbolden,
  resolveInitialEmbolden,
  writeStoredEmbolden,
} from '../lib/embolden'
import {
  DEFAULT_PRIMARY_NAV_ORDER,
  moveAvailablePrimaryNavId,
  movePrimaryNavId,
  normalizePrimaryNavHidden,
  normalizePrimaryNavOrder,
  normalizePrimaryNavPinCount,
  isZipExportQueueEnabled,
  PRIMARY_NAV_PIN_COUNT,
  type PrimaryNavGates,
  type PrimaryNavId,
} from '../lib/primaryNav'
import {
  normalizeSheetErodeLevel,
  resolveInitialSheetErodeLevel,
  writeStoredSheetErodeLevel,
  type SheetErodeLevel,
} from '../lib/sheetErode'
import type { LibraryAudioPartsMode } from '../lib/audioParts'
import {
  normalizeMixPanSetting,
  type MixPanMode,
  type MixPanSetting,
} from '../audio/multiPartMix'
import {
  DEFAULT_RECORDER_CAPTURE,
  DEFAULT_QUICK_RECORD,
  normalizeRecorderCapture,
  normalizeQuickRecordPrefs,
  type QuickRecordPrefs,
  type RecorderCapturePrefs,
} from '../types/recorder'
import { normalizeCustomParts } from '../lib/audioParts'
import {
  DEFAULT_OPTICAL_FRAME_BYTES,
  DEFAULT_OPTICAL_GRID_CODES,
  DEFAULT_OPTICAL_TX_FPS,
  normalizeOpticalDisplayScale,
  normalizeOpticalFrameBytes,
  normalizeOpticalGridCodes,
  normalizeOpticalTxFps,
} from '../lib/decimen/sendSettings'
import {
  DEFAULT_OPTICAL_TRANSFER_PRESET,
  normalizeOpticalTransferPreset,
  type OpticalTransferPreset,
} from '../lib/decimen/opticalTransferPresets'
import {
  DEFAULT_PDF_RASTER_CACHE_MAX_MB,
  normalizePdfRasterCacheMaxMb,
  PDF_RASTER_CACHE_MAX_MB_KEY,
} from '../offline/pdfRasterCache'

export type PartSide = 'left' | 'right'
export type { MixPanSetting } from '../audio/multiPartMix'

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
}

const SOLO_IN_FILE_KEY = 'singtags.partSoloInFile.v1'
const MIX_PAN_KEY = 'singtags.partMixPan.v2'
/** @deprecated string left/right map — migrated into v2 MixPanSetting objects. */
const MIX_PAN_KEY_V1 = 'singtags.partMixPan.v1'
/** Which learning parts are checked in the Custom mix tab. */
const MIX_SELECTED_KEY = 'singtags.partMixSelected.v1'
const BROWSE_WELCOME_KEY = 'singtags.browseWelcomeDismissed.v1'
const SING_MODE_KEY = 'singtags.singMode.v1'
const SHARE_FULLSCREEN_KEY = 'singtags.shareFullscreen.v1'
const SHARE_BARBERSHOP_TAGS_KEY = 'singtags.shareBarbershopTags.v1'
/** Fullscreen multi-page: one-page pager vs continuous vertical scroll. */
const SHEET_FS_PAGE_MODE_KEY = 'singtags.sheetFsPageMode.v1'
/** Fullscreen sheet piano dock: white-key width percent. */
const SHEET_PIANO_KEY_SCALE_KEY = 'singtags.sheetPianoKeyScale.v2'
/** @deprecated superseded by v2 after null→0 normalize bug wrote 25% as default. */
const SHEET_PIANO_KEY_SCALE_KEY_V1 = 'singtags.sheetPianoKeyScale.v1'
/** Fullscreen sheet piano dock: key-strip height in px. */
const SHEET_PIANO_HEIGHT_KEY = 'singtags.sheetPianoHeightPx.v1'
/** Invert sheet page colors (night reading). */
const SHEET_INVERT_KEY = 'singtags.sheetInvert.v1'
/** Labs: animated QR file transfer (Decimen). Default on. */
const OPTICAL_TRANSFER_ENABLED_KEY = 'singtags.labs.opticalTransfer.enabled.v1'
/** Labs: on-device Local Library (charts/images/tracks). Default off. */
const LOCAL_LIBRARY_ENABLED_KEY = 'singtags.labs.localLibrary.enabled.v1'
/** Labs: WebRTC DataChannel transfer (Wi‑Fi / hotspot). Default off. */
const WEBRTC_TRANSFER_ENABLED_KEY = 'singtags.labs.webrtcTransfer.enabled.v1'
/** Labs: OS Share handoff (Quick Share / AirDrop via share sheet). Default off. */
const OS_SHARE_TRANSFER_ENABLED_KEY = 'singtags.labs.osShareTransfer.enabled.v1'
const AUDIO_RECORDER_ENABLED_KEY = 'singtags.labs.audioRecorder.enabled.v1'
/** Labs: Sing Together repertoire correlation via QR. Default off. */
const SING_TOGETHER_ENABLED_KEY = 'singtags.labs.singTogether.enabled.v1'
/** Labs: Tag Roll piano-roll composer. Default off. */
const TAG_ROLL_ENABLED_KEY = 'singtags.labs.tagRoll.enabled.v1'
/** Labs: Arranging coach gate. Default off until package port. */
const ARRANGING_ENABLED_KEY = 'singtags.labs.arranging.enabled.v1'
const TAG_ROLL_CELL_W_KEY = 'singtags.labs.tagRoll.cellW.v1'
const TAG_ROLL_CELL_H_KEY = 'singtags.labs.tagRoll.cellH.v1'
const TAG_ROLL_METRONOME_SOUND_KEY = 'singtags.labs.tagRoll.metronomeSound.v1'
const TAG_ROLL_METRONOME_VOLUME_KEY = 'singtags.labs.tagRoll.metronomeVolume.v1'
const TAG_ROLL_EXPRESSION_LANE_COLLAPSED_KEY = 'singtags.labs.tagRoll.expressionLaneCollapsed.v1'
/** Default gain for Tag Studio metronome clicks (matches MetronomeClicker). */
export const TAG_ROLL_METRONOME_VOLUME_DEFAULT = 0.85
export const TAG_ROLL_METRONOME_VOLUME_MAX = 1.5
/** Ordered primary-nav destinations; first N available become chrome pins. */
const PRIMARY_NAV_ORDER_KEY = 'singtags.primaryNav.order.v1'
/** Non-lab primary-nav pages hidden from chrome and More. */
const PRIMARY_NAV_HIDDEN_KEY = 'singtags.primaryNav.hidden.v1'
/** When true, use primaryNavPinCount instead of the default 5 slots. */
const PRIMARY_NAV_PIN_OVERRIDE_KEY = 'singtags.primaryNav.pinOverride.v1'
/** Preferred pin-slot count when override is on. */
const PRIMARY_NAV_PIN_COUNT_KEY = 'singtags.primaryNav.pinCount.v1'
const RECORDER_CAPTURE_KEY = 'singtags.recorder.capture.v1'
const QUICK_RECORD_KEY = 'singtags.recorder.quick.v1'
const OPTICAL_FRAME_BYTES_KEY = 'singtags.opticalTransfer.frameBytes.v1'
const OPTICAL_GRID_CODES_KEY = 'singtags.opticalTransfer.gridCodes.v1'
const OPTICAL_AUTO_DENSITY_KEY = 'singtags.opticalTransfer.autoDensity.v1'
const OPTICAL_TX_FPS_KEY = 'singtags.opticalTransfer.txFps.v1'
const OPTICAL_DISPLAY_SCALE_KEY = 'singtags.opticalTransfer.displayScale.v1'
const OPTICAL_PRESET_KEY = 'singtags.opticalTransfer.preset.v1'
const OPTICAL_CAMERA_DEVICE_KEY = 'singtags.opticalTransfer.cameraDeviceId.v1'
const LIBRARY_PARTS_MODE_KEY = 'singtags.libraryAudioPartsMode.v1'
const LIBRARY_PARTS_KEY = 'singtags.libraryAudioParts.v1'
const PITCH_PIPE_PREFS_KEY = 'singtags.pitchPipe.v1'
const APPLY_DETUNE_GLOBAL_KEY = 'singtags.applyDetuneGlobally.v1'
/** @deprecated migrated into PITCH_PIPE_PREFS_KEY */
const PITCH_PIPE_RANGE_KEY = 'singtags.pitchPipeRange.v1'
/** @deprecated migrated into PITCH_PIPE_LAYOUT_KEY */
const PITCH_PIPE_LAYOUT_KEY = 'singtags.pitchPipeLayout.v1'
/** @deprecated quality is fixed at 64 kbps Opus; drop leftover user preference. */
const LEGACY_AUDIO_QUALITY_KEY = 'singtags.audioEncodeQuality.v1'
const A_HZ_SET = new Set<number>(PITCH_PIPE_A_TUNINGS.map((t) => t.hz))

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
  }
}

/** Clamp detune slider to ±50 cents (integer). */
function clampDetuneCents(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(-50, Math.min(50, Math.round(n)))
}

/** Map absolute detune cents to a known concert-A preset, if exact match. */
function matchConcertA(cents: number): PitchPipeAHz | null {
  for (const t of PITCH_PIPE_A_TUNINGS) {
    if (aHzToCents(t.hz) === cents) return t.hz
  }
  return null
}

/** Legacy: `fineCents` was an offset on top of concert A. */
function fromLegacyFineCents(aHz: PitchPipeAHz, fineCents: number): PitchPipePrefs['detuneCents'] {
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
  }
}

/** Read deprecated per-key pitch pipe range from localStorage. */
function loadLegacyPitchPipeRange(): PitchPipeRange {
  try {
    const mapped = normalizePitchPipeRange(localStorage.getItem(PITCH_PIPE_RANGE_KEY))
    if (mapped) return mapped
  } catch {
    /* ignore */
  }
  return 'e3-e4'
}

/** Read deprecated per-key pitch pipe layout from localStorage. */
function loadLegacyPitchPipeLayout(): PitchPipeLayout {
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
function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
  } catch {
    /* ignore */
  }
  return fallback
}

function loadNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

function loadString(key: string, fallback: string): string {
  try {
    const raw = localStorage.getItem(key)
    return raw == null || raw === '' ? fallback : raw
  } catch {
    return fallback
  }
}

/** Normalize / load fullscreen sheet page mode from localStorage. */
export function normalizeSheetFsPageMode(raw: unknown): SheetFsPageMode {
  return raw === 'scroll' ? 'scroll' : 'paging'
}

function loadSheetFsPageMode(): SheetFsPageMode {
  try {
    return normalizeSheetFsPageMode(localStorage.getItem(SHEET_FS_PAGE_MODE_KEY))
  } catch {
    return 'paging'
  }
}

function loadSheetPianoKeyScale(): number {
  try {
    // Drop poisoned v1 values (unset → Number(null)===0 → clamped to 25%).
    localStorage.removeItem(SHEET_PIANO_KEY_SCALE_KEY_V1)
    return normalizeSheetPianoKeyScale(localStorage.getItem(SHEET_PIANO_KEY_SCALE_KEY))
  } catch {
    return normalizeSheetPianoKeyScale(null)
  }
}

function loadSheetPianoHeightPx(): number {
  try {
    return normalizeSheetPianoHeightPx(localStorage.getItem(SHEET_PIANO_HEIGHT_KEY))
  } catch {
    return normalizeSheetPianoHeightPx(null)
  }
}

/** Read a string array from localStorage JSON; normalizes custom audio part names. */
function loadStringArray(key: string, fallback: string[]): string[] {
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

function loadPrimaryNavOrder(): PrimaryNavId[] {
  try {
    const raw = localStorage.getItem(PRIMARY_NAV_ORDER_KEY)
    if (!raw) return [...DEFAULT_PRIMARY_NAV_ORDER]
    return normalizePrimaryNavOrder(JSON.parse(raw) as unknown)
  } catch {
    return [...DEFAULT_PRIMARY_NAV_ORDER]
  }
}

function loadPrimaryNavHidden(): PrimaryNavId[] {
  try {
    const raw = localStorage.getItem(PRIMARY_NAV_HIDDEN_KEY)
    if (!raw) return []
    return normalizePrimaryNavHidden(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

function loadPrimaryNavPinCount(): number {
  try {
    return normalizePrimaryNavPinCount(localStorage.getItem(PRIMARY_NAV_PIN_COUNT_KEY))
  } catch {
    return PRIMARY_NAV_PIN_COUNT
  }
}

/** Read library audio parts mode from localStorage. */
function loadPartsMode(): LibraryAudioPartsMode {
  try {
    const raw = localStorage.getItem(LIBRARY_PARTS_MODE_KEY)
    if (raw === 'all' || raw === 'mix' || raw === 'custom') return raw
  } catch {
    /* ignore */
  }
  return 'all'
}

/** Read per-part left/right map from localStorage (solo channel). */
function loadSideMap(key: string): Record<string, PartSide> {
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
function loadMixPanMap(): Record<string, MixPanSetting> {
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

function loadMixSelectedMap(): Record<string, boolean> {
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

/**
 * Shared UI preferences: multi-part mix pan/solo, pitch pipe, browse welcome, library parts.
 */
export const usePreferencesStore = defineStore('preferences', () => {
  const initialPipe = loadPitchPipePrefs()
  const partSoloInFile = ref<Record<string, PartSide>>(loadSideMap(SOLO_IN_FILE_KEY))
  const partMixPan = ref<Record<string, MixPanSetting>>(loadMixPanMap())
  const partMixSelected = ref<Record<string, boolean>>(loadMixSelectedMap())
  /** Which learning-track parts to include in the full-library audio pack. */
  const libraryAudioPartsMode = ref<LibraryAudioPartsMode>(loadPartsMode())
  const libraryAudioParts = ref<string[]>(
    loadStringArray(LIBRARY_PARTS_KEY, ['lead']),
  )
  const pitchPipeRange = ref<PitchPipeRange>(initialPipe.range)
  const pitchPipeLayout = ref<PitchPipeLayout>(initialPipe.layout)
  const pitchPipeAHz = ref<PitchPipeAHz | null>(initialPipe.aHz)
  const pitchPipeDetuneCents = ref(initialPipe.detuneCents)
  const pitchPipeShowOctave = ref(initialPipe.showOctave)
  const pitchPipeSound = ref<PitchPipeSoundId>(initialPipe.sound)
  const pitchPipeGridScale = ref(initialPipe.gridScale)
  const pitchPipeShowFullKeyboard = ref(initialPipe.showFullKeyboard)
  const pitchPipePianoDefaultOctave = ref<PitchPipePianoDefaultOctave>(
    initialPipe.pianoDefaultOctave,
  )
  const pitchPipePianoEngine = ref<PianoSoundEngineId>(initialPipe.pianoEngine)
  const pitchPipePianoLockPosition = ref(initialPipe.pianoLockPosition)
  const pitchPipeShowPcKeyRange = ref(initialPipe.showPcKeyRange)
  /** App-wide Display size (70–130%, step 5). */
  const uiScalePercent = ref(resolveInitialUiScale())
  /** App color theme (light / dark / high-contrast). */
  const appTheme = ref<AppTheme>(resolveInitialAppTheme())
  /** Slightly heavier text weight for low-vision reading. */
  const emboldenText = ref(resolveInitialEmbolden())
  /**
   * When true, pitch-pipe concert A / fine detune also applies to tag pay-the-key
   * (and any other app pitches that consult this preference).
   */
  const applyDetuneGlobally = ref(loadBool(APPLY_DETUNE_GLOBAL_KEY, false))
  /** When false, browse shows the one-time welcome / offline prompt. */
  const browseWelcomeDismissed = ref(loadBool(BROWSE_WELCOME_KEY, false))
  /**
   * When true, Browse/Recent/Favorites open tags into sheet fullscreen (`?fullscreen`).
   * When false, list taps open the normal tag page (default).
   */
  const singMode = ref(loadBool(SING_MODE_KEY, false))
  /**
   * When true, Copy/Share tag links include `?fullscreen` so recipients open the sheet fullscreen.
   */
  const shareFullscreen = ref(loadBool(SHARE_FULLSCREEN_KEY, false))
  /**
   * When true, Copy/Share/QR use the barbershoptags.com tag page instead of this app.
   */
  const shareBarbershopTags = ref(loadBool(SHARE_BARBERSHOP_TAGS_KEY, false))
  /**
   * Fullscreen multi-page navigation: discrete one-page pager vs continuous vertical scroll.
   * Sticky across Local Library / tag sheet opens.
   */
  const sheetFsPageMode = ref<SheetFsPageMode>(loadSheetFsPageMode())
  /** Fullscreen sheet piano: key width percent (more/fewer keys visible). */
  const sheetPianoKeyScale = ref(loadSheetPianoKeyScale())
  const sheetPianoHeightPx = ref(loadSheetPianoHeightPx())
  /** When true, invert sheet page colors for night reading. */
  const sheetInvert = ref(loadBool(SHEET_INVERT_KEY, false))
  /** Sheet erode intensity (off / light / medium / strong). */
  const sheetErode = ref<SheetErodeLevel>(resolveInitialSheetErodeLevel())
  /**
   * Labs: when true, animated QR optical transfer (send/receive pages, Browse camera receive) is available.
   * Static QR share codes are unrelated and stay available either way.
   */
  const opticalTransferEnabled = ref(loadBool(OPTICAL_TRANSFER_ENABLED_KEY, true))
  /**
   * Labs: when true, Local Library (More → Local Library, /library routes) is available.
   * Existing on-device data is kept; the UI and routes stay hidden while off.
   */
  const localLibraryEnabled = ref(loadBool(LOCAL_LIBRARY_ENABLED_KEY, false))
  /**
   * Labs: when true, Wireless (WebRTC) transfer mode is available on Optical transfer.
   * Same Wi‑Fi / personal hotspot; no SingTags servers.
   */
  const webrtcTransferEnabled = ref(loadBool(WEBRTC_TRANSFER_ENABLED_KEY, false))
  /**
   * Labs: when true, Share via device (OS share sheet / share_target import) is available.
   */
  const osShareTransferEnabled = ref(loadBool(OS_SHARE_TRANSFER_ENABLED_KEY, false))
  /**
   * Labs: when true, Audio Recorder (More → Recorder, /recorder routes) is available.
   * Recordings stay on-device in IndexedDB.
   */
  const audioRecorderEnabled = ref(loadBool(AUDIO_RECORDER_ENABLED_KEY, false))
  /**
   * Labs: when true, Sing Together (More → Sing Together, /matcher) is available.
   * Repertoire + QR correlation stay on-device.
   */
  const singTogetherEnabled = ref(loadBool(SING_TOGETHER_ENABLED_KEY, false))
  /**
   * Labs: when true, Tag Studio (More → Tag Studio, /tag-studio) is available.
   */
  const tagRollEnabled = ref(loadBool(TAG_ROLL_ENABLED_KEY, false))
  /**
   * Labs: when true, Arranging coach will be available (routes/package not wired yet).
   */
  const arrangingEnabled = ref(loadBool(ARRANGING_ENABLED_KEY, false))
  const tagRollCellW = ref(loadNumber(TAG_ROLL_CELL_W_KEY, 28))
  const tagRollCellH = ref(loadNumber(TAG_ROLL_CELL_H_KEY, 14))
  const tagRollMetronomeSound = ref<MetronomeSoundId>(
    (() => {
      const raw = loadString(TAG_ROLL_METRONOME_SOUND_KEY, DEFAULT_METRONOME_SOUND_ID)
      return isMetronomeSoundId(raw) ? raw : DEFAULT_METRONOME_SOUND_ID
    })(),
  )
  const tagRollMetronomeVolume = ref(
    Math.min(
      TAG_ROLL_METRONOME_VOLUME_MAX,
      Math.max(0, loadNumber(TAG_ROLL_METRONOME_VOLUME_KEY, TAG_ROLL_METRONOME_VOLUME_DEFAULT)),
    ),
  )
  const tagRollExpressionLaneCollapsed = ref(
    loadBool(TAG_ROLL_EXPRESSION_LANE_COLLAPSED_KEY, false),
  )
  /**
   * Preference order for chrome pins + More destinations.
   * The first five *available* ids (Labs gates) occupy top/bottom nav.
   */
  const primaryNavOrder = ref<PrimaryNavId[]>(loadPrimaryNavOrder())
  /** Non-lab pages hidden from chrome / More (Labs “hide” uses feature flags). */
  const primaryNavHidden = ref<PrimaryNavId[]>(loadPrimaryNavHidden())
  /** When true, chrome may use more than the default 5 pin slots. */
  const primaryNavPinOverride = ref(loadBool(PRIMARY_NAV_PIN_OVERRIDE_KEY, false))
  /** Preferred pin count when override is enabled (still clamped by screen fit). */
  const primaryNavPinCount = ref(loadPrimaryNavPinCount())
  /** Preferred pin slots for chrome (override or default). */
  const preferredPrimaryNavPinCount = computed(() =>
    primaryNavPinOverride.value
      ? normalizePrimaryNavPinCount(primaryNavPinCount.value)
      : PRIMARY_NAV_PIN_COUNT,
  )
  /** False when Downloads & Exports is hidden — zip enqueue UIs stay off. */
  const zipExportsEnabled = computed(() => isZipExportQueueEnabled(primaryNavHidden.value))
  /** Last-used MediaRecorder capture settings for Labs Audio Recorder. */
  const recorderCapturePrefs = ref(
    (() => {
      try {
        const raw = localStorage.getItem(RECORDER_CAPTURE_KEY)
        if (!raw) return DEFAULT_RECORDER_CAPTURE
        return normalizeRecorderCapture(JSON.parse(raw))
      } catch {
        return DEFAULT_RECORDER_CAPTURE
      }
    })(),
  )
  /** Quick Record auto-labels / notes (capture format lives in recorderCapturePrefs). */
  const quickRecordPrefs = ref(
    (() => {
      try {
        const raw = localStorage.getItem(QUICK_RECORD_KEY)
        if (!raw) return DEFAULT_QUICK_RECORD
        return normalizeQuickRecordPrefs(JSON.parse(raw))
      } catch {
        return DEFAULT_QUICK_RECORD
      }
    })(),
  )
  /** Payload bytes per animated QR frame for optical transfer. */
  const opticalTransferFrameBytes = ref(
    normalizeOpticalFrameBytes(loadNumber(OPTICAL_FRAME_BYTES_KEY, DEFAULT_OPTICAL_FRAME_BYTES)),
  )
  /** When true, pick lowest density/FPS/grid that still aims for the preset airtime. */
  const opticalTransferAutoDensity = ref(loadBool(OPTICAL_AUTO_DENSITY_KEY, true))
  /** Experimental multi-stream grid code count (1, 2, 4, 6, 9). */
  const opticalTransferGridCodes = ref(
    normalizeOpticalGridCodes(loadNumber(OPTICAL_GRID_CODES_KEY, DEFAULT_OPTICAL_GRID_CODES)),
  )
  /** Animated frames per second while sending an optical transfer. */
  const opticalTransferTxFps = ref(
    normalizeOpticalTxFps(loadNumber(OPTICAL_TX_FPS_KEY, DEFAULT_OPTICAL_TX_FPS)),
  )
  /** Stage fill factor for fullscreen optical QR (1 = max stage, 0.4 = smallest). */
  const opticalTransferDisplayScale = ref(
    normalizeOpticalDisplayScale(loadNumber(OPTICAL_DISPLAY_SCALE_KEY, 1)),
  )
  /** Auto / Ultra / Reliable / Balanced / Fast / Fastest — user-facing send tuning. */
  const opticalTransferPreset = ref<OpticalTransferPreset>(
    normalizeOpticalTransferPreset(loadString(OPTICAL_PRESET_KEY, DEFAULT_OPTICAL_TRANSFER_PRESET)),
  )
  /** Preferred MediaDeviceInfo.deviceId for optical receive camera (empty = default). */
  const opticalTransferCameraDeviceId = ref(loadString(OPTICAL_CAMERA_DEVICE_KEY, ''))
  /**
   * Max durable PDF→WebP raster cache size (MB). FIFO eviction by insert time.
   * 0 disables IndexedDB writes (session memory may still help briefly).
   */
  const pdfRasterCacheMaxMb = ref(
    normalizePdfRasterCacheMaxMb(
      loadNumber(PDF_RASTER_CACHE_MAX_MB_KEY, DEFAULT_PDF_RASTER_CACHE_MAX_MB),
    ),
  )

  /** Write current pitch-pipe refs to localStorage. Side effect: `savePitchPipePrefs`. */
  function persistPitchPipe(): void {
    savePitchPipePrefs({
      range: pitchPipeRange.value,
      layout: pitchPipeLayout.value,
      aHz: pitchPipeAHz.value,
      detuneCents: clampDetuneCents(pitchPipeDetuneCents.value),
      showOctave: pitchPipeShowOctave.value,
      sound: pitchPipeSound.value,
      gridScale: pitchPipeGridScale.value,
      showFullKeyboard: pitchPipeShowFullKeyboard.value,
      pianoDefaultOctave: pitchPipePianoDefaultOctave.value,
      pianoEngine: pitchPipePianoEngine.value,
      pianoLockPosition: pitchPipePianoLockPosition.value,
      showPcKeyRange: pitchPipeShowPcKeyRange.value,
    })
  }

  watch(
    libraryAudioPartsMode,
    (v) => {
      try {
        localStorage.setItem(LIBRARY_PARTS_MODE_KEY, v)
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    libraryAudioParts,
    (v) => {
      try {
        localStorage.setItem(LIBRARY_PARTS_KEY, JSON.stringify(normalizeCustomParts(v)))
      } catch {
        /* ignore */
      }
    },
    { deep: true, flush: 'sync' },
  )

  watch(
    uiScalePercent,
    (v) => {
      const next = normalizeUiScalePercent(v)
      if (next !== v) {
        uiScalePercent.value = next
        return
      }
      writeStoredUiScale(next)
      applyUiScale(next)
    },
    { flush: 'sync', immediate: true },
  )

  watch(
    appTheme,
    (v) => {
      const next = normalizeAppTheme(v)
      if (next !== v) {
        appTheme.value = next
        return
      }
      writeStoredAppTheme(next)
      applyAppTheme(next)
    },
    { flush: 'sync', immediate: true },
  )

  watch(
    emboldenText,
    (v) => {
      writeStoredEmbolden(v)
      applyEmbolden(v)
    },
    { flush: 'sync', immediate: true },
  )

  watch(
    [
      pitchPipeRange,
      pitchPipeLayout,
      pitchPipeAHz,
      pitchPipeDetuneCents,
      pitchPipeShowOctave,
      pitchPipeSound,
      pitchPipeGridScale,
      pitchPipeShowFullKeyboard,
      pitchPipePianoDefaultOctave,
      pitchPipePianoEngine,
      pitchPipePianoLockPosition,
      pitchPipeShowPcKeyRange,
    ],
    () => persistPitchPipe(),
    { flush: 'sync' },
  )

  watch(
    browseWelcomeDismissed,
    (v) => {
      try {
        localStorage.setItem(BROWSE_WELCOME_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    applyDetuneGlobally,
    (v) => {
      try {
        localStorage.setItem(APPLY_DETUNE_GLOBAL_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    singMode,
    (v) => {
      try {
        localStorage.setItem(SING_MODE_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    opticalTransferEnabled,
    (v) => {
      try {
        localStorage.setItem(OPTICAL_TRANSFER_ENABLED_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    localLibraryEnabled,
    (v) => {
      try {
        localStorage.setItem(LOCAL_LIBRARY_ENABLED_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    webrtcTransferEnabled,
    (v) => {
      try {
        localStorage.setItem(WEBRTC_TRANSFER_ENABLED_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    osShareTransferEnabled,
    (v) => {
      try {
        localStorage.setItem(OS_SHARE_TRANSFER_ENABLED_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    audioRecorderEnabled,
    (v) => {
      try {
        localStorage.setItem(AUDIO_RECORDER_ENABLED_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    singTogetherEnabled,
    (v) => {
      try {
        localStorage.setItem(SING_TOGETHER_ENABLED_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    tagRollEnabled,
    (v) => {
      try {
        localStorage.setItem(TAG_ROLL_ENABLED_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    arrangingEnabled,
    (v) => {
      try {
        localStorage.setItem(ARRANGING_ENABLED_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    tagRollCellW,
    (v) => {
      try {
        localStorage.setItem(TAG_ROLL_CELL_W_KEY, String(v))
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    tagRollCellH,
    (v) => {
      try {
        localStorage.setItem(TAG_ROLL_CELL_H_KEY, String(v))
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    tagRollMetronomeSound,
    (v) => {
      try {
        localStorage.setItem(TAG_ROLL_METRONOME_SOUND_KEY, v)
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    tagRollMetronomeVolume,
    (v) => {
      try {
        localStorage.setItem(TAG_ROLL_METRONOME_VOLUME_KEY, String(v))
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    tagRollExpressionLaneCollapsed,
    (v) => {
      try {
        localStorage.setItem(TAG_ROLL_EXPRESSION_LANE_COLLAPSED_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    primaryNavOrder,
    (v) => {
      try {
        localStorage.setItem(PRIMARY_NAV_ORDER_KEY, JSON.stringify(normalizePrimaryNavOrder(v)))
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync', deep: true },
  )

  watch(
    primaryNavHidden,
    (v) => {
      try {
        localStorage.setItem(PRIMARY_NAV_HIDDEN_KEY, JSON.stringify(normalizePrimaryNavHidden(v)))
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync', deep: true },
  )

  watch(
    primaryNavPinOverride,
    (v) => {
      try {
        localStorage.setItem(PRIMARY_NAV_PIN_OVERRIDE_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    primaryNavPinCount,
    (v) => {
      try {
        localStorage.setItem(
          PRIMARY_NAV_PIN_COUNT_KEY,
          String(normalizePrimaryNavPinCount(v)),
        )
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    recorderCapturePrefs,
    (v) => {
      try {
        localStorage.setItem(RECORDER_CAPTURE_KEY, JSON.stringify(normalizeRecorderCapture(v)))
      } catch {
        /* ignore */
      }
    },
    { deep: true, flush: 'sync' },
  )

  watch(
    quickRecordPrefs,
    (v) => {
      try {
        localStorage.setItem(QUICK_RECORD_KEY, JSON.stringify(normalizeQuickRecordPrefs(v)))
      } catch {
        /* ignore */
      }
    },
    { deep: true, flush: 'sync' },
  )

  watch(
    shareFullscreen,
    (v) => {
      try {
        localStorage.setItem(SHARE_FULLSCREEN_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    shareBarbershopTags,
    (v) => {
      try {
        localStorage.setItem(SHARE_BARBERSHOP_TAGS_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    sheetFsPageMode,
    (v) => {
      try {
        localStorage.setItem(SHEET_FS_PAGE_MODE_KEY, v)
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    sheetPianoKeyScale,
    (v) => {
      try {
        localStorage.setItem(SHEET_PIANO_KEY_SCALE_KEY, String(v))
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    sheetPianoHeightPx,
    (v) => {
      try {
        localStorage.setItem(SHEET_PIANO_HEIGHT_KEY, String(v))
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    sheetInvert,
    (v) => {
      try {
        localStorage.setItem(SHEET_INVERT_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    sheetErode,
    (v) => {
      const next = normalizeSheetErodeLevel(v)
      if (next !== v) {
        sheetErode.value = next
        return
      }
      writeStoredSheetErodeLevel(next)
    },
    { flush: 'sync', immediate: true },
  )

  watch(
    opticalTransferFrameBytes,
    (v) => {
      try {
        localStorage.setItem(OPTICAL_FRAME_BYTES_KEY, String(v))
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    opticalTransferAutoDensity,
    (v) => {
      try {
        localStorage.setItem(OPTICAL_AUTO_DENSITY_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    opticalTransferPreset,
    (v) => {
      try {
        localStorage.setItem(OPTICAL_PRESET_KEY, v)
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    opticalTransferGridCodes,
    (v) => {
      try {
        localStorage.setItem(OPTICAL_GRID_CODES_KEY, String(v))
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    pdfRasterCacheMaxMb,
    (v) => {
      try {
        localStorage.setItem(PDF_RASTER_CACHE_MAX_MB_KEY, String(normalizePdfRasterCacheMaxMb(v)))
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    opticalTransferTxFps,
    (v) => {
      try {
        localStorage.setItem(OPTICAL_TX_FPS_KEY, String(v))
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    opticalTransferDisplayScale,
    (v) => {
      try {
        localStorage.setItem(OPTICAL_DISPLAY_SCALE_KEY, String(v))
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    opticalTransferCameraDeviceId,
    (v) => {
      try {
        localStorage.setItem(OPTICAL_CAMERA_DEVICE_KEY, v)
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    partSoloInFile,
    (v) => {
      try {
        localStorage.setItem(SOLO_IN_FILE_KEY, JSON.stringify(v))
      } catch {
        /* ignore */
      }
    },
    { deep: true, flush: 'sync' },
  )

  watch(
    partMixPan,
    (v) => {
      try {
        localStorage.setItem(MIX_PAN_KEY, JSON.stringify(v))
        localStorage.removeItem(MIX_PAN_KEY_V1)
      } catch {
        /* ignore */
      }
    },
    { deep: true, flush: 'sync' },
  )

  watch(
    partMixSelected,
    (v) => {
      try {
        localStorage.setItem(MIX_SELECTED_KEY, JSON.stringify(v))
      } catch {
        /* ignore */
      }
    },
    { deep: true, flush: 'sync' },
  )

  /** Dismiss the one-time browse welcome / offline prompt. Side effect: localStorage. */
  function dismissBrowseWelcome(): void {
    browseWelcomeDismissed.value = true
  }

  /** Set which learning-track parts to include in full-library audio pack. Side effect: localStorage. */
  function setLibraryAudioPartsMode(mode: LibraryAudioPartsMode): void {
    libraryAudioPartsMode.value = mode
  }

  /** Toggle one part name in the custom library parts list (case-insensitive). */
  function toggleLibraryAudioPart(part: string): void {
    const key = part.toLowerCase()
    const next = new Set(libraryAudioParts.value.map((p) => p.toLowerCase()))
    if (next.has(key)) next.delete(key)
    else next.add(key)
    libraryAudioParts.value = [...next]
  }

  /** Solo channel for a part when playing a single file (`left` default). */
  function getPartSoloInFile(part: string): PartSide {
    return partSoloInFile.value[part] ?? 'left'
  }

  /** Set solo channel for a part. Side effect: localStorage. */
  function setPartSoloInFile(part: string, side: PartSide): void {
    partSoloInFile.value = { ...partSoloInFile.value, [part]: side }
  }

  /** Custom-mix pan for a part (`Hard L` default). */
  function getPartMixPan(part: string): MixPanSetting {
    return partMixPan.value[part] ?? { mode: 'left', value: -1 }
  }

  /** Set Custom-mix pan for a part. Side effect: localStorage. */
  function setPartMixPan(part: string, setting: MixPanSetting | MixPanMode | PartSide): void {
    partMixPan.value = { ...partMixPan.value, [part]: normalizeMixPanSetting(setting) }
  }

  /** Whether a learning part is checked in the Custom mix tab. */
  function getPartMixSelected(part: string): boolean {
    return partMixSelected.value[part] === true
  }

  /** Set Custom-mix checkbox for a part. Side effect: localStorage. */
  function setPartMixSelected(part: string, on: boolean): void {
    partMixSelected.value = { ...partMixSelected.value, [part]: on }
  }

  /** Learning parts currently checked for Custom mix (stable order preserved by caller). */
  function selectedMixParts(available: readonly string[]): string[] {
    return available.filter((p) => partMixSelected.value[p] === true)
  }

  /** Set pitch-pipe note range. Side effect: localStorage via pitch-pipe watcher. */
  function setPitchPipeRange(range: PitchPipeRange): void {
    pitchPipeRange.value = range
  }

  /** Set pitch-pipe layout (grid, list, piano, piano-h). Side effect: localStorage. */
  function setPitchPipeLayout(layout: PitchPipeLayout): void {
    pitchPipeLayout.value = layout
  }

  /** Show octave digits on note labels (E4 vs E). Side effect: localStorage. */
  function setPitchPipeShowOctave(on: boolean): void {
    pitchPipeShowOctave.value = on
  }

  /** Set grid layout key size (70–250%, step 5). Side effect: localStorage. */
  function setPitchPipeGridScale(percent: number): void {
    pitchPipeGridScale.value = normalizePitchPipeGridScale(percent)
  }

  /** Nudge grid key size by ±5% (or a multiple of the step). */
  function nudgePitchPipeGridScale(delta: number): void {
    const steps = Math.round(delta / 5) || Math.sign(delta)
    setPitchPipeGridScale(pitchPipeGridScale.value + steps * 5)
  }

  /** Piano: show scrollable 66-key keyboard. Side effect: localStorage. */
  function setPitchPipeShowFullKeyboard(on: boolean): void {
    pitchPipeShowFullKeyboard.value = on
  }

  /** Horizontal piano: which C–C octave to open on. Side effect: localStorage. */
  function setPitchPipePianoDefaultOctave(octave: unknown): void {
    pitchPipePianoDefaultOctave.value = normalizePitchPipePianoDefaultOctave(octave)
  }

  /** Piano layouts / sheet dock: synth vs acoustic samples. Side effect: localStorage. */
  function setPitchPipePianoEngine(engine: PianoSoundEngineId): void {
    if (!isPianoSoundEngineId(engine)) return
    pitchPipePianoEngine.value = engine
  }

  /** Horizontal piano / sheet dock: lock scroll position. Side effect: localStorage. */
  function setPitchPipePianoLockPosition(on: boolean): void {
    pitchPipePianoLockPosition.value = on
  }

  /** Dim keys outside the computer-keyboard window. Side effect: localStorage. */
  function setPitchPipeShowPcKeyRange(on: boolean): void {
    pitchPipeShowPcKeyRange.value = on
  }

  /** Set absolute UI scale percent (snapped to 5% steps, clamped 70–130). */
  function setUiScalePercent(percent: number): void {
    uiScalePercent.value = normalizeUiScalePercent(percent)
  }

  /** Nudge UI scale by ±5% (or a multiple of the step). */
  function nudgeUiScale(delta: number): void {
    const steps = Math.round(delta / UI_SCALE_STEP) || Math.sign(delta)
    setUiScalePercent(uiScalePercent.value + steps * UI_SCALE_STEP)
  }

  /** Restore Display size to 100%. */
  function resetUiScale(): void {
    setUiScalePercent(UI_SCALE_DEFAULT)
  }

  function setAppTheme(theme: AppTheme): void {
    appTheme.value = normalizeAppTheme(theme)
  }

  function resetAppTheme(): void {
    setAppTheme(APP_THEME_DEFAULT)
  }

  function setEmboldenText(on: boolean): void {
    emboldenText.value = on
  }

  /**
   * Built-in pitch sound (Mellow / Bright). Persists in pitch-pipe prefs and
   * clears any lab custom voice override so the selected built-in applies.
   */
  function setPitchPipeSound(sound: PitchPipeSoundId): void {
    if (!isPitchPipeSoundId(sound)) return
    pitchPipeSound.value = sound
    clearActivePitchPipeVoice()
  }

  /** Set concert-A preset highlight (may be null when detune is custom). */
  function setPitchPipeAHz(hz: PitchPipeAHz | null): void {
    pitchPipeAHz.value = hz
  }

  /** Absolute cents vs A440. Clears concert A when off-preset (pass `clearConcertA`). */
  function setPitchPipeDetuneCents(cents: number, opts?: { clearConcertA?: boolean }): void {
    pitchPipeDetuneCents.value = clampDetuneCents(cents)
    if (opts?.clearConcertA) pitchPipeAHz.value = null
  }

  /** Apply a concert A preset and snap detune to that pitch. */
  function setPitchPipeConcertA(hz: PitchPipeAHz): void {
    pitchPipeAHz.value = hz
    pitchPipeDetuneCents.value = clampDetuneCents(aHzToCents(hz))
  }

  /** Reload pitch-pipe prefs from storage (e.g. after offline cache restore). */
  function hydratePitchPipePrefs(): void {
    const p = loadPitchPipePrefs()
    pitchPipeRange.value = p.range
    pitchPipeLayout.value = p.layout
    pitchPipeAHz.value = p.aHz
    pitchPipeDetuneCents.value = p.detuneCents
    pitchPipeShowOctave.value = p.showOctave
    pitchPipeSound.value = p.sound
    pitchPipeGridScale.value = p.gridScale
    pitchPipeShowFullKeyboard.value = p.showFullKeyboard
    pitchPipePianoDefaultOctave.value = p.pianoDefaultOctave
    pitchPipePianoEngine.value = p.pianoEngine
    pitchPipePianoLockPosition.value = p.pianoLockPosition
    pitchPipeShowPcKeyRange.value = p.showPcKeyRange
  }

  /** Absolute cents to add to tag pay-the-key when global tuning is enabled. */
  function globalPitchDetuneCents(): number {
    return applyDetuneGlobally.value ? clampDetuneCents(pitchPipeDetuneCents.value) : 0
  }

  /** Toggle whether pitch-pipe tuning applies app-wide. */
  function setApplyDetuneGlobally(on: boolean): void {
    applyDetuneGlobally.value = on
  }

  /** Toggle Sing mode (list opens → fullscreen sheet). */
  function setSingMode(on: boolean): void {
    singMode.value = on
  }

  /** Labs: enable/disable animated QR optical transfer. */
  function setOpticalTransferEnabled(on: boolean): void {
    opticalTransferEnabled.value = on
  }

  /** Labs: enable/disable Local Library UI and routes. */
  function setLocalLibraryEnabled(on: boolean): void {
    localLibraryEnabled.value = on
  }

  /** Labs: enable/disable WebRTC wireless transfer mode. */
  function setWebrtcTransferEnabled(on: boolean): void {
    webrtcTransferEnabled.value = on
  }

  /** Labs: enable/disable OS Share handoff mode. */
  function setOsShareTransferEnabled(on: boolean): void {
    osShareTransferEnabled.value = on
  }

  /** Labs: enable/disable Audio Recorder UI and routes. */
  function setAudioRecorderEnabled(on: boolean): void {
    audioRecorderEnabled.value = on
  }

  /** Labs: enable/disable Sing Together repertoire correlation. */
  function setSingTogetherEnabled(on: boolean): void {
    singTogetherEnabled.value = on
  }

  /** Labs: enable/disable Tag Roll piano-roll composer. */
  function setTagRollEnabled(on: boolean): void {
    tagRollEnabled.value = on
  }

  /** Labs: enable/disable Arranging coach gate (no routes until package port). */
  function setArrangingEnabled(on: boolean): void {
    arrangingEnabled.value = on
  }

  /** Remember last Tag Roll cell size for new projects. */
  function setTagRollCellSize(cellW: number, cellH: number): void {
    tagRollCellW.value = cellW
    tagRollCellH.value = cellH
  }

  /** Tag Studio metronome click sample pair (persists across projects). */
  function setTagRollMetronomeSound(id: string): void {
    tagRollMetronomeSound.value = isMetronomeSoundId(id) ? id : DEFAULT_METRONOME_SOUND_ID
  }

  /** Tag Studio metronome click volume (0–1.5, persists across projects). */
  function setTagRollMetronomeVolume(v: number): void {
    if (!Number.isFinite(v)) return
    tagRollMetronomeVolume.value = Math.min(
      TAG_ROLL_METRONOME_VOLUME_MAX,
      Math.max(0, v),
    )
  }

  /** Collapse the Tag Studio expression lane chrome. */
  function setTagRollExpressionLaneCollapsed(on: boolean): void {
    tagRollExpressionLaneCollapsed.value = !!on
  }

  /** Replace the primary-nav preference order (normalized). */
  function setPrimaryNavOrder(order: readonly PrimaryNavId[]): void {
    primaryNavOrder.value = normalizePrimaryNavOrder(order)
  }

  /** Move one primary-nav destination within the preference order. */
  function movePrimaryNav(id: PrimaryNavId, toIndex: number): void {
    primaryNavOrder.value = movePrimaryNavId(primaryNavOrder.value, id, toIndex)
  }

  /** Move among currently available destinations (Settings reorder UI). */
  function moveAvailablePrimaryNav(
    id: PrimaryNavId,
    toAvailableIndex: number,
    gates: PrimaryNavGates,
  ): void {
    primaryNavOrder.value = moveAvailablePrimaryNavId(
      primaryNavOrder.value,
      id,
      toAvailableIndex,
      gates,
      primaryNavHidden.value,
    )
  }

  /** Hide or show a non-lab primary-nav page (Labs use feature flags instead). */
  function setPrimaryNavHidden(id: PrimaryNavId, hide: boolean): void {
    const next = new Set(normalizePrimaryNavHidden(primaryNavHidden.value))
    if (hide) next.add(id)
    else next.delete(id)
    primaryNavHidden.value = normalizePrimaryNavHidden([...next])
  }

  /** Toggle overriding the default 5 pin slots. */
  function setPrimaryNavPinOverride(on: boolean): void {
    primaryNavPinOverride.value = on
    if (on && primaryNavPinCount.value < PRIMARY_NAV_PIN_COUNT) {
      primaryNavPinCount.value = PRIMARY_NAV_PIN_COUNT
    }
  }

  /** Preferred pin-slot count when override is on. */
  function setPrimaryNavPinCount(count: number): void {
    primaryNavPinCount.value = normalizePrimaryNavPinCount(count)
  }

  /** Nudge preferred pin count when override is on. */
  function nudgePrimaryNavPinCount(delta: number): void {
    setPrimaryNavPinCount(primaryNavPinCount.value + delta)
  }

  /** Restore the default primary-nav order, clears hides, and resets pin override. */
  function resetPrimaryNavOrder(): void {
    primaryNavOrder.value = [...DEFAULT_PRIMARY_NAV_ORDER]
    primaryNavHidden.value = []
    primaryNavPinOverride.value = false
    primaryNavPinCount.value = PRIMARY_NAV_PIN_COUNT
  }

  /** Persist Labs Audio Recorder capture settings. */
  function setRecorderCapturePrefs(prefs: RecorderCapturePrefs): void {
    recorderCapturePrefs.value = normalizeRecorderCapture(prefs)
  }

  /** Persist Quick Record auto-labels / notes. */
  function setQuickRecordPrefs(prefs: QuickRecordPrefs): void {
    quickRecordPrefs.value = normalizeQuickRecordPrefs(prefs)
  }

  /** Include `?fullscreen` on shared tag links. */
  function setShareFullscreen(on: boolean): void {
    shareFullscreen.value = on
  }

  /** Share the barbershoptags.com page instead of a SingTags deep link. */
  function setShareBarbershopTags(on: boolean): void {
    shareBarbershopTags.value = on
  }

  /** Fullscreen multi-page: paging vs continuous scroll (persisted). */
  function setSheetFsPageMode(mode: SheetFsPageMode): void {
    sheetFsPageMode.value = normalizeSheetFsPageMode(mode)
  }

  /** Fullscreen sheet piano key width percent (persisted). */
  function setSheetPianoKeyScale(percent: number): void {
    sheetPianoKeyScale.value = normalizeSheetPianoKeyScale(percent)
  }

  /** Nudge sheet piano key width by a percent delta (snapped via normalize). */
  function nudgeSheetPianoKeyScale(delta: number): void {
    setSheetPianoKeyScale(sheetPianoKeyScale.value + delta)
  }

  /** Fullscreen sheet piano key-strip height in px (persisted). */
  function setSheetPianoHeightPx(px: number): void {
    sheetPianoHeightPx.value = normalizeSheetPianoHeightPx(px)
  }

  /** Invert sheet music page colors (persisted). */
  function setSheetInvert(on: boolean): void {
    sheetInvert.value = on
  }

  /** Thicken sheet ink via morphological erode (persisted; applied before invert). */
  function setSheetErode(level: SheetErodeLevel): void {
    sheetErode.value = normalizeSheetErodeLevel(level)
  }

  function setOpticalTransferFrameBytes(value: number): void {
    opticalTransferFrameBytes.value = normalizeOpticalFrameBytes(value)
    opticalTransferAutoDensity.value = false
  }

  function setOpticalTransferAutoDensity(on: boolean): void {
    opticalTransferAutoDensity.value = on
  }

  function setOpticalTransferPreset(preset: OpticalTransferPreset): void {
    opticalTransferPreset.value = normalizeOpticalTransferPreset(preset)
    opticalTransferAutoDensity.value = true
  }

  function setOpticalTransferGridCodes(value: number): void {
    opticalTransferGridCodes.value = normalizeOpticalGridCodes(value)
  }

  function setOpticalTransferTxFps(value: number): void {
    opticalTransferTxFps.value = normalizeOpticalTxFps(value)
  }

  function setOpticalTransferDisplayScale(scale: number): void {
    opticalTransferDisplayScale.value = normalizeOpticalDisplayScale(scale)
  }

  function setOpticalTransferCameraDeviceId(deviceId: string): void {
    opticalTransferCameraDeviceId.value = deviceId.trim()
  }

  function setPdfRasterCacheMaxMb(mb: number): void {
    pdfRasterCacheMaxMb.value = normalizePdfRasterCacheMaxMb(mb)
    void import('../offline/pdfRasterCache').then((m) => m.enforcePdfRasterCacheBudget())
  }

  return {
    partSoloInFile,
    partMixPan,
    partMixSelected,
    browseWelcomeDismissed,
    applyDetuneGlobally,
    singMode,
    shareFullscreen,
    shareBarbershopTags,
    sheetFsPageMode,
    sheetPianoKeyScale,
    sheetPianoHeightPx,
    sheetInvert,
    sheetErode,
    opticalTransferEnabled,
    localLibraryEnabled,
    webrtcTransferEnabled,
    osShareTransferEnabled,
    audioRecorderEnabled,
    singTogetherEnabled,
    tagRollEnabled,
    arrangingEnabled,
    tagRollCellW,
    tagRollCellH,
    tagRollMetronomeSound,
    tagRollMetronomeVolume,
    tagRollExpressionLaneCollapsed,
    primaryNavOrder,
    primaryNavHidden,
    primaryNavPinOverride,
    primaryNavPinCount,
    preferredPrimaryNavPinCount,
    zipExportsEnabled,
    recorderCapturePrefs,
    quickRecordPrefs,
    opticalTransferFrameBytes,
    opticalTransferAutoDensity,
    opticalTransferPreset,
    opticalTransferGridCodes,
    opticalTransferTxFps,
    opticalTransferDisplayScale,
    opticalTransferCameraDeviceId,
    pdfRasterCacheMaxMb,
    libraryAudioPartsMode,
    libraryAudioParts,
    pitchPipeRange,
    pitchPipeLayout,
    pitchPipeAHz,
    pitchPipeDetuneCents,
    pitchPipeShowOctave,
    pitchPipeSound,
    pitchPipeGridScale,
    pitchPipeShowFullKeyboard,
    pitchPipePianoDefaultOctave,
    pitchPipePianoEngine,
    pitchPipePianoLockPosition,
    pitchPipeShowPcKeyRange,
    uiScalePercent,
    appTheme,
    emboldenText,
    setLibraryAudioPartsMode,
    toggleLibraryAudioPart,
    dismissBrowseWelcome,
    setApplyDetuneGlobally,
    setSingMode,
    setOpticalTransferEnabled,
    setLocalLibraryEnabled,
    setWebrtcTransferEnabled,
    setOsShareTransferEnabled,
    setAudioRecorderEnabled,
    setSingTogetherEnabled,
    setTagRollEnabled,
    setArrangingEnabled,
    setTagRollCellSize,
    setTagRollMetronomeSound,
    setTagRollMetronomeVolume,
    setTagRollExpressionLaneCollapsed,
    setPrimaryNavOrder,
    movePrimaryNav,
    moveAvailablePrimaryNav,
    setPrimaryNavHidden,
    setPrimaryNavPinOverride,
    setPrimaryNavPinCount,
    nudgePrimaryNavPinCount,
    resetPrimaryNavOrder,
    setRecorderCapturePrefs,
    setQuickRecordPrefs,
    setShareFullscreen,
    setShareBarbershopTags,
    setSheetFsPageMode,
    setSheetPianoKeyScale,
    nudgeSheetPianoKeyScale,
    setSheetPianoHeightPx,
    setSheetInvert,
    setSheetErode,
    setOpticalTransferFrameBytes,
    setOpticalTransferAutoDensity,
    setOpticalTransferPreset,
    setOpticalTransferGridCodes,
    setOpticalTransferTxFps,
    setOpticalTransferDisplayScale,
    setOpticalTransferCameraDeviceId,
    setPdfRasterCacheMaxMb,
    globalPitchDetuneCents,
    getPartSoloInFile,
    setPartSoloInFile,
    getPartMixPan,
    setPartMixPan,
    getPartMixSelected,
    setPartMixSelected,
    selectedMixParts,
    setPitchPipeRange,
    setPitchPipeLayout,
    setPitchPipeShowOctave,
    setPitchPipeGridScale,
    nudgePitchPipeGridScale,
    setPitchPipeShowFullKeyboard,
    setPitchPipePianoDefaultOctave,
    setPitchPipePianoEngine,
    setPitchPipePianoLockPosition,
    setPitchPipeShowPcKeyRange,
    setUiScalePercent,
    nudgeUiScale,
    resetUiScale,
    setAppTheme,
    resetAppTheme,
    setEmboldenText,
    setPitchPipeSound,
    setPitchPipeAHz,
    setPitchPipeDetuneCents,
    setPitchPipeConcertA,
    hydratePitchPipePrefs,
  }
})
