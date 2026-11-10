/**
 * Shared UI preferences: multi-part audio mix/solo, pitch pipe, browse welcome,
 * and library audio part selection. Most fields persist to localStorage; pitch pipe
 * also round-trips through offline cache zip snapshots.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  type PitchPipeAHz,
  type PitchPipeLayout,
  type PitchPipePianoDefaultOctave,
  type PitchPipeRange,
} from '../audio/pitchUiLabels'
import { type PitchPipeSoundId } from '../audio/pitchPipeVoice'
import { type PianoSoundEngineId } from '../audio/pianoSamples'
import {
  DEFAULT_METRONOME_SOUND_ID,
  isMetronomeSoundId,
  type MetronomeSoundId,
} from '../audio/metronomeSamples'
import { loadDetectedInterest, type DetectedInterestLevel } from '../lib/tagRoll/detectedInterestPrefs'
import { loadDetectedLockLeadVoicing, loadSketchLockLeadVoicing } from '../lib/tagRoll/leadLockVoicingPrefs'
import { loadDetectedScoreTweaks } from '../lib/tagRoll/detectedScoreTweaksPrefs'
import { type DetectedScoreTweaks } from '../domain/arranging/detectedScoreTweaks'
import { resolveInitialUiScale } from '../lib/uiScale'
import { resolveInitialAppTheme, type AppTheme } from '../lib/theme'
import { resolveInitialEmbolden } from '../lib/embolden'
import {
  normalizePrimaryNavPinCount,
  isZipExportQueueEnabled,
  PRIMARY_NAV_PIN_COUNT,
  type PrimaryNavId,
} from '../lib/primaryNav'
import { resolveInitialSheetErodeLevel, type SheetErodeLevel } from '../lib/sheetErode'
import type { LibraryAudioPartsMode } from '../lib/audioParts'
import { type MixPanSetting } from '../audio/multiPartMix'
import {
  DEFAULT_RECORDER_CAPTURE,
  DEFAULT_QUICK_RECORD,
  normalizeRecorderCapture,
  normalizeQuickRecordPrefs,
} from '../types/recorder'
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
import {
  APPLY_DETUNE_GLOBAL_KEY,
  AUDIO_RECORDER_ENABLED_KEY,
  BROWSE_WELCOME_KEY,
  LIBRARY_PARTS_KEY,
  LOCAL_LIBRARY_ENABLED_KEY,
  OPTICAL_AUTO_DENSITY_KEY,
  OPTICAL_CAMERA_DEVICE_KEY,
  OPTICAL_DISPLAY_SCALE_KEY,
  OPTICAL_FRAME_BYTES_KEY,
  OPTICAL_GRID_CODES_KEY,
  OPTICAL_PRESET_KEY,
  OPTICAL_TRANSFER_ENABLED_KEY,
  OPTICAL_TX_FPS_KEY,
  OS_SHARE_TRANSFER_ENABLED_KEY,
  PRIMARY_NAV_PIN_OVERRIDE_KEY,
  type PartSide,
  QUICK_RECORD_KEY,
  RECORDER_CAPTURE_KEY,
  SHARE_BARBERSHOP_TAGS_KEY,
  SHARE_FULLSCREEN_KEY,
  SHEET_INVERT_KEY,
  SING_MODE_KEY,
  SING_TOGETHER_ENABLED_KEY,
  SOLO_IN_FILE_KEY,
  type SheetFsPageMode,
  TAG_ROLL_CELL_H_KEY,
  TAG_ROLL_CELL_W_KEY,
  TAG_ROLL_CHORDS_LANE_COLLAPSED_KEY,
  TAG_ROLL_CHORD_WALK_AUTO_ADVANCE_KEY,
  TAG_ROLL_COACH_GUIDED_STEP_KEY,
  TAG_ROLL_COACH_LANE_COLLAPSED_KEY,
  TAG_ROLL_DECLARED_LANE_COLLAPSED_KEY,
  TAG_ROLL_DETECTED_LANE_COLLAPSED_KEY,
  TAG_ROLL_ENABLED_KEY,
  TAG_ROLL_EXPRESSION_LANE_COLLAPSED_KEY,
  TAG_ROLL_LYRICS_LANE_COLLAPSED_KEY,
  TAG_ROLL_METRONOME_SOUND_KEY,
  TAG_ROLL_METRONOME_VOLUME_DEFAULT,
  TAG_ROLL_METRONOME_VOLUME_KEY,
  TAG_ROLL_METRONOME_VOLUME_MAX,
  TAG_ROLL_VOICING_RANGES_OPEN_KEY,
  TAG_ROLL_VOICING_RANGE_FILTER_KEY,
  WEBRTC_TRANSFER_ENABLED_KEY,
  DIGITAL_TUNER_ENABLED_KEY,
  loadBool,
  loadMixPanMap,
  loadMixSelectedMap,
  loadNumber,
  loadPartsMode,
  loadPathOptimizePrefs,
  loadPitchPipePrefs,
  loadPrimaryNavHidden,
  loadPrimaryNavOrder,
  loadPrimaryNavPinCount,
  loadSheetFsPageMode,
  loadSheetPianoHeightPx,
  loadSheetPianoKeyScale,
  loadSideMap,
  loadSoundfontFavoriteKeys,
  loadString,
  loadStringArray,
} from './preferences/storage'
import { type StoreDeps } from './preferences/deps'
import { createMixAndUiActions } from './preferences/mixAndUi'
import { createPitchPipeActions } from './preferences/pitchPipeActions'
import { createLabsFlagActions } from './preferences/labsFlags'
import { createDigitalTunerActions } from './preferences/digitalTunerActions'
import { createTagRollChromeActions } from './preferences/tagRollChrome'
import { createOpticalRecorderActions } from './preferences/opticalRecorder'
import { loadDigitalTunerPrefs } from '../lib/preferences/digitalTuner'

export type {
  PartSide,
  MixPanSetting,
  SheetFsPageMode,
  PitchPipePrefs,
  TagRollBottomLaneId,
  TagRollPathOptimizeTaste,
  TagRollPathOptimizePrefs,
} from './preferences/storage'
export {
  TAG_ROLL_METRONOME_VOLUME_DEFAULT,
  TAG_ROLL_METRONOME_VOLUME_MAX,
  defaultPitchPipePrefs,
  parsePitchPipePrefs,
  loadPitchPipePrefs,
  savePitchPipePrefs,
  pitchPipePrefsSnapshot,
  applyPitchPipePrefsSnapshot,
  defaultPathOptimizePrefs,
  normalizeSheetFsPageMode,
} from './preferences/storage'
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
  const pitchPipeAttackSec = ref(initialPipe.attackSec)
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
   * Optical transfer (More → Optical transfer). Always on; legacy Labs key forced on.
   */
  const opticalTransferEnabled = ref(true)
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
   * Labs: when true, Digital Tuner (More → Tuner, /tuner) is available.
   * Mic analysis stays on-device; rings clear on leave.
   */
  const digitalTunerEnabled = ref(loadBool(DIGITAL_TUNER_ENABLED_KEY, false))
  /** Digital Tuner settings (no f0 history). */
  const digitalTunerPrefs = ref(loadDigitalTunerPrefs())
  /**
   * @deprecated OS Share / Quick Share / AirDrop removed from product surface.
   * Legacy key retained so old settings do not throw.
   */
  const osShareTransferEnabled = ref(false)
  /**
   * Audio Recorder (More → Recorder). Always on; legacy Labs key forced on.
   */
  const audioRecorderEnabled = ref(true)
  /**
   * Labs: when true, Sing Together (More → Sing Together, /matcher) is available.
   * Repertoire + QR correlation stay on-device.
   */
  const singTogetherEnabled = ref(loadBool(SING_TOGETHER_ENABLED_KEY, false))
  /**
   * Labs: when true, Tag Studio (More → Tag Studio, /tag-studio) is available.
   * Coach / arranging surfaces ship with Tag Studio — no separate labs gate.
   */
  const tagRollEnabled = ref(loadBool(TAG_ROLL_ENABLED_KEY, false))
  /** Always mirrors Tag Studio — kept for callers that still check arrangingEnabled. */
  const arrangingEnabled = computed(() => tagRollEnabled.value)
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
  /** Favorited SoundFont instruments (persists across projects). */
  const tagRollSoundfontFavorites = ref<string[]>(loadSoundfontFavoriteKeys())
  const tagRollExpressionLaneCollapsed = ref(
    loadBool(TAG_ROLL_EXPRESSION_LANE_COLLAPSED_KEY, true),
  )
  const tagRollCoachLaneCollapsed = ref(loadBool(TAG_ROLL_COACH_LANE_COLLAPSED_KEY, true))
  /** Last Coach rail page (home | chords | check | polish). */
  const tagRollCoachGuidedStep = ref(
    loadString(TAG_ROLL_COACH_GUIDED_STEP_KEY, 'home') || 'home',
  )
  /** After Chord Walk Apply, step to next empty (else next moment). */
  const tagRollChordWalkAutoAdvance = ref(loadBool(TAG_ROLL_CHORD_WALK_AUTO_ADVANCE_KEY, false))
  /** Piano-side ensemble Ranges strip (global arranging tool). */
  const tagRollVoicingRangesOpen = ref(loadBool(TAG_ROLL_VOICING_RANGES_OPEN_KEY, false))
  /** When on, Coach/Harmonize Suggest filters to part bands + max span. */
  const tagRollVoicingRangeFilter = ref(loadBool(TAG_ROLL_VOICING_RANGE_FILTER_KEY, false))
  /** Last Path Optimizer UI settings. */
  const tagRollPathOptimizePrefs = ref(loadPathOptimizePrefs())
  /** Chords lane (locked harmony map). Migrates legacy Declared collapse pref. */
  const tagRollChordsLaneCollapsed = ref(
    (() => {
      try {
        const next = localStorage.getItem(TAG_ROLL_CHORDS_LANE_COLLAPSED_KEY)
        if (next != null) return next === '1' || next === 'true'
        const legacy = localStorage.getItem(TAG_ROLL_DECLARED_LANE_COLLAPSED_KEY)
        if (legacy != null) return legacy === '1' || legacy === 'true'
      } catch {
        /* ignore */
      }
      return true
    })(),
  )
  const tagRollDetectedLaneCollapsed = ref(loadBool(TAG_ROLL_DETECTED_LANE_COLLAPSED_KEY, true))
  const tagRollLyricsLaneCollapsed = ref(loadBool(TAG_ROLL_LYRICS_LANE_COLLAPSED_KEY, true))
  /** Detected hole-fill aggressiveness (Basic / Mild / Bold). Default Mild. */
  const detectedInterest = ref<DetectedInterestLevel>(loadDetectedInterest('mild'))
  /** Detected scoring weight Tweaks (JSON). Default = shipped Mild/Bold table. */
  const detectedScoreTweaks = ref<DetectedScoreTweaks>(loadDetectedScoreTweaks())
  /**
   * Sketch audition: force melody into the lead slot of block-chord inversions.
   * Off → closed catalog inversions (synthetic lead). Default on.
   */
  const tagRollSketchLockLeadVoicing = ref(loadSketchLockLeadVoicing(true))
  /**
   * Detected audition: same Lead-lock as Sketch. Off → closed catalog inversions.
   * Default on.
   */
  const tagRollDetectedLockLeadVoicing = ref(loadDetectedLockLeadVoicing(true))
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
  const deps: StoreDeps = {
    initialPipe,
    partSoloInFile,
    partMixPan,
    partMixSelected,
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
    pitchPipeAttackSec,
    uiScalePercent,
    appTheme,
    emboldenText,
    applyDetuneGlobally,
    browseWelcomeDismissed,
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
    digitalTunerEnabled,
    digitalTunerPrefs,
    osShareTransferEnabled,
    audioRecorderEnabled,
    singTogetherEnabled,
    tagRollEnabled,
    arrangingEnabled,
    tagRollCellW,
    tagRollCellH,
    tagRollMetronomeSound,
    tagRollMetronomeVolume,
    tagRollSoundfontFavorites,
    tagRollExpressionLaneCollapsed,
    tagRollCoachLaneCollapsed,
    tagRollCoachGuidedStep,
    tagRollChordWalkAutoAdvance,
    tagRollVoicingRangesOpen,
    tagRollVoicingRangeFilter,
    tagRollPathOptimizePrefs,
    tagRollChordsLaneCollapsed,
    tagRollDetectedLaneCollapsed,
    tagRollLyricsLaneCollapsed,
    detectedInterest,
    detectedScoreTweaks,
    tagRollSketchLockLeadVoicing,
    tagRollDetectedLockLeadVoicing,
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
    opticalTransferGridCodes,
    opticalTransferTxFps,
    opticalTransferDisplayScale,
    opticalTransferPreset,
    opticalTransferCameraDeviceId,
    pdfRasterCacheMaxMb,
  }
  const mixAndUiActions = createMixAndUiActions(deps)
  const pitchPipeActions = createPitchPipeActions(deps)
  const labsFlagActions = createLabsFlagActions(deps)
  const digitalTunerActions = createDigitalTunerActions(deps)
  const tagRollChromeActions = createTagRollChromeActions(deps)
  const opticalRecorderActions = createOpticalRecorderActions(deps)
  mixAndUiActions.bindWatches()
  pitchPipeActions.bindWatches()
  labsFlagActions.bindWatches()
  digitalTunerActions.bindWatches()
  tagRollChromeActions.bindWatches()
  opticalRecorderActions.bindWatches()
  const {
    dismissBrowseWelcome,
    setLibraryAudioPartsMode,
    toggleLibraryAudioPart,
    getPartSoloInFile,
    setPartSoloInFile,
    getPartMixPan,
    setPartMixPan,
    getPartMixSelected,
    setPartMixSelected,
    selectedMixParts,
    setUiScalePercent,
    nudgeUiScale,
    resetUiScale,
    setAppTheme,
    resetAppTheme,
    setEmboldenText,
    setSingMode,
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
    setPitchPipeAttackSec,
    setPitchPipeSound,
    setPitchPipeAHz,
    setPitchPipeDetuneCents,
    setPitchPipeConcertA,
    hydratePitchPipePrefs,
    globalPitchDetuneCents,
    setApplyDetuneGlobally,
    setOpticalTransferEnabled,
    setLocalLibraryEnabled,
    setWebrtcTransferEnabled,
    setDigitalTunerEnabled,
    setDigitalTunerPrefs,
    resetDigitalTunerPrefs,
    hydrateDigitalTunerPrefs,
    resolveTunerA4Hz,
    setOsShareTransferEnabled,
    setAudioRecorderEnabled,
    setSingTogetherEnabled,
    setTagRollEnabled,
    setArrangingEnabled,
    setTagRollCellSize,
    setTagRollMetronomeSound,
    setTagRollMetronomeVolume,
    toggleTagRollSoundfontFavorite,
    isTagRollSoundfontFavorite,
    setTagRollExpressionLaneCollapsed,
    setTagRollCoachLaneCollapsed,
    setTagRollCoachGuidedStep,
    setTagRollChordWalkAutoAdvance,
    setTagRollVoicingRangesOpen,
    toggleTagRollVoicingRangesOpen,
    setTagRollVoicingRangeFilter,
    setTagRollPathOptimizePrefs,
    setTagRollChordsLaneCollapsed,
    setTagRollDeclaredLaneCollapsed,
    setTagRollDetectedLaneCollapsed,
    setTagRollLyricsLaneCollapsed,
    setDetectedInterest,
    setTagRollSketchLockLeadVoicing,
    setTagRollDetectedLockLeadVoicing,
    setDetectedScoreTweaks,
    resetDetectedScoreTweaks,
    setTagRollLaneCollapsed,
    toggleTagRollLane,
    openTagRollBottomLane,
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
  } = {
    ...mixAndUiActions.actions,
    ...pitchPipeActions.actions,
    ...labsFlagActions.actions,
    ...digitalTunerActions.actions,
    ...tagRollChromeActions.actions,
    ...opticalRecorderActions.actions,
  }

  try {
    localStorage.setItem(OPTICAL_TRANSFER_ENABLED_KEY, '1')
    localStorage.setItem(AUDIO_RECORDER_ENABLED_KEY, '1')
    localStorage.setItem(OS_SHARE_TRANSFER_ENABLED_KEY, '0')
  } catch {
    /* ignore */
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
    digitalTunerEnabled,
    digitalTunerPrefs,
    osShareTransferEnabled,
    audioRecorderEnabled,
    singTogetherEnabled,
    tagRollEnabled,
    arrangingEnabled,
    tagRollCellW,
    tagRollCellH,
    tagRollMetronomeSound,
    tagRollMetronomeVolume,
    tagRollSoundfontFavorites,
    tagRollExpressionLaneCollapsed,
    tagRollCoachLaneCollapsed,
    tagRollCoachGuidedStep,
    tagRollChordWalkAutoAdvance,
    tagRollVoicingRangesOpen,
    tagRollVoicingRangeFilter,
    tagRollPathOptimizePrefs,
    tagRollChordsLaneCollapsed,
    /** @deprecated Prefer tagRollChordsLaneCollapsed */
    tagRollDeclaredLaneCollapsed: tagRollChordsLaneCollapsed,
    tagRollDetectedLaneCollapsed,
    tagRollLyricsLaneCollapsed,
    detectedInterest,
    detectedScoreTweaks,
    tagRollSketchLockLeadVoicing,
    tagRollDetectedLockLeadVoicing,
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
    pitchPipeAttackSec,
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
    setDigitalTunerEnabled,
    setDigitalTunerPrefs,
    resetDigitalTunerPrefs,
    hydrateDigitalTunerPrefs,
    resolveTunerA4Hz,
    setOsShareTransferEnabled,
    setAudioRecorderEnabled,
    setSingTogetherEnabled,
    setTagRollEnabled,
    setArrangingEnabled,
    setTagRollCellSize,
    setTagRollMetronomeSound,
    setTagRollMetronomeVolume,
    toggleTagRollSoundfontFavorite,
    isTagRollSoundfontFavorite,
    setTagRollExpressionLaneCollapsed,
    setTagRollCoachLaneCollapsed,
    setTagRollCoachGuidedStep,
    setTagRollChordWalkAutoAdvance,
    setTagRollVoicingRangesOpen,
    toggleTagRollVoicingRangesOpen,
    setTagRollVoicingRangeFilter,
    setTagRollPathOptimizePrefs,
    setTagRollChordsLaneCollapsed,
    setTagRollDeclaredLaneCollapsed,
    setTagRollDetectedLaneCollapsed,
    setTagRollLyricsLaneCollapsed,
    setDetectedInterest,
    setDetectedScoreTweaks,
    resetDetectedScoreTweaks,
    setTagRollSketchLockLeadVoicing,
    setTagRollDetectedLockLeadVoicing,
    setTagRollLaneCollapsed,
    toggleTagRollLane,
    openTagRollBottomLane,
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
    setPitchPipeAttackSec,
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
