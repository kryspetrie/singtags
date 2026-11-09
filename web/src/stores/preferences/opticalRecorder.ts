/** Optical transfer, recorder, and sheet-viewer preference actions. */

import { type StoreDeps } from './deps'

import { watch } from 'vue'

import { normalizeSheetPianoKeyScale, normalizeSheetPianoHeightPx } from '../../audio/pitchUiLabels'

import {
  normalizeSheetErodeLevel,
  writeStoredSheetErodeLevel,
  type SheetErodeLevel,
} from '../../lib/sheetErode'

import {
  normalizeRecorderCapture,
  normalizeQuickRecordPrefs,
  type QuickRecordPrefs,
  type RecorderCapturePrefs,
} from '../../types/recorder'

import {
  normalizeOpticalDisplayScale,
  normalizeOpticalFrameBytes,
  normalizeOpticalGridCodes,
  normalizeOpticalTxFps,
} from '../../lib/decimen/sendSettings'

import { normalizeOpticalTransferPreset, type OpticalTransferPreset } from '../../lib/decimen/opticalTransferPresets'

import { normalizePdfRasterCacheMaxMb, PDF_RASTER_CACHE_MAX_MB_KEY } from '../../offline/pdfRasterCache'

import {
  OPTICAL_AUTO_DENSITY_KEY,
  OPTICAL_CAMERA_DEVICE_KEY,
  OPTICAL_DISPLAY_SCALE_KEY,
  OPTICAL_FRAME_BYTES_KEY,
  OPTICAL_GRID_CODES_KEY,
  OPTICAL_PRESET_KEY,
  OPTICAL_TX_FPS_KEY,
  QUICK_RECORD_KEY,
  RECORDER_CAPTURE_KEY,
  SHARE_BARBERSHOP_TAGS_KEY,
  SHARE_FULLSCREEN_KEY,
  SHEET_FS_PAGE_MODE_KEY,
  SHEET_INVERT_KEY,
  SHEET_PIANO_HEIGHT_KEY,
  SHEET_PIANO_KEY_SCALE_KEY,
  type SheetFsPageMode,
  normalizeSheetFsPageMode,
} from './storage'

export function createOpticalRecorderActions(deps: StoreDeps) {

  const opticalTransferAutoDensity = deps.opticalTransferAutoDensity
  const opticalTransferCameraDeviceId = deps.opticalTransferCameraDeviceId
  const opticalTransferDisplayScale = deps.opticalTransferDisplayScale
  const opticalTransferFrameBytes = deps.opticalTransferFrameBytes
  const opticalTransferGridCodes = deps.opticalTransferGridCodes
  const opticalTransferPreset = deps.opticalTransferPreset
  const opticalTransferTxFps = deps.opticalTransferTxFps
  const pdfRasterCacheMaxMb = deps.pdfRasterCacheMaxMb
  const quickRecordPrefs = deps.quickRecordPrefs
  const recorderCapturePrefs = deps.recorderCapturePrefs
  const shareBarbershopTags = deps.shareBarbershopTags
  const shareFullscreen = deps.shareFullscreen
  const sheetErode = deps.sheetErode
  const sheetFsPageMode = deps.sheetFsPageMode
  const sheetInvert = deps.sheetInvert
  const sheetPianoHeightPx = deps.sheetPianoHeightPx
  const sheetPianoKeyScale = deps.sheetPianoKeyScale

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
  function setSheetPianoKeyScale(percent: number, minScale?: number): void {
    sheetPianoKeyScale.value = normalizeSheetPianoKeyScale(percent, minScale)
  }

  /** Nudge sheet piano key width by a percent delta (snapped via normalize). */
  function nudgeSheetPianoKeyScale(delta: number, minScale?: number): void {
    setSheetPianoKeyScale(sheetPianoKeyScale.value + delta, minScale)
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
    void import('../../offline/pdfRasterCache').then((m) => m.enforcePdfRasterCacheBudget())
  }

  const actions = {
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
  }
  Object.assign(deps, actions)

  function bindWatches(): void {

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
  }

  return { actions, bindWatches }

}
