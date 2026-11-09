/** Mix, solo, UI scale, theme, and browse-welcome preference actions. */

import { type StoreDeps } from './deps'

import { watch } from 'vue'

import {
  UI_SCALE_DEFAULT,
  UI_SCALE_STEP,
  applyUiScale,
  normalizeUiScalePercent,
  writeStoredUiScale,
} from '../../lib/uiScale'

import {
  APP_THEME_DEFAULT,
  applyAppTheme,
  normalizeAppTheme,
  writeStoredAppTheme,
  type AppTheme,
} from '../../lib/theme'

import { applyEmbolden, writeStoredEmbolden } from '../../lib/embolden'

import type { LibraryAudioPartsMode } from '../../lib/audioParts'

import {
  normalizeMixPanSetting,
  type MixPanMode,
  type MixPanSetting,
} from '../../audio/multiPartMix'

import { normalizeCustomParts } from '../../lib/audioParts'

import {
  BROWSE_WELCOME_KEY,
  LIBRARY_PARTS_KEY,
  LIBRARY_PARTS_MODE_KEY,
  MIX_PAN_KEY,
  MIX_PAN_KEY_V1,
  MIX_SELECTED_KEY,
  type PartSide,
  SING_MODE_KEY,
  SOLO_IN_FILE_KEY,
} from './storage'

export function createMixAndUiActions(deps: StoreDeps) {

  const appTheme = deps.appTheme
  const browseWelcomeDismissed = deps.browseWelcomeDismissed
  const emboldenText = deps.emboldenText
  const libraryAudioParts = deps.libraryAudioParts
  const libraryAudioPartsMode = deps.libraryAudioPartsMode
  const partMixPan = deps.partMixPan
  const partMixSelected = deps.partMixSelected
  const partSoloInFile = deps.partSoloInFile
  const singMode = deps.singMode
  const uiScalePercent = deps.uiScalePercent

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
    const next = new Set(libraryAudioParts.value.map((p: any) => p.toLowerCase()))
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

  /** Toggle Sing mode (list opens → fullscreen sheet). */
  function setSingMode(on: boolean): void {
    singMode.value = on
  }

  const actions = {
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
  }
  Object.assign(deps, actions)

  function bindWatches(): void {

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
  }

  return { actions, bindWatches }

}
