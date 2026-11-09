/** Labs feature-flag preference actions. */

import { type StoreDeps } from './deps'

import { watch } from 'vue'

import {
  ARRANGING_ENABLED_KEY,
  AUDIO_RECORDER_ENABLED_KEY,
  LOCAL_LIBRARY_ENABLED_KEY,
  OPTICAL_TRANSFER_ENABLED_KEY,
  OS_SHARE_TRANSFER_ENABLED_KEY,
  SING_TOGETHER_ENABLED_KEY,
  TAG_ROLL_ENABLED_KEY,
  WEBRTC_TRANSFER_ENABLED_KEY,
} from './storage'

export function createLabsFlagActions(deps: StoreDeps) {

  const audioRecorderEnabled = deps.audioRecorderEnabled
  const localLibraryEnabled = deps.localLibraryEnabled
  const opticalTransferEnabled = deps.opticalTransferEnabled
  const osShareTransferEnabled = deps.osShareTransferEnabled
  const singTogetherEnabled = deps.singTogetherEnabled
  const tagRollEnabled = deps.tagRollEnabled
  const webrtcTransferEnabled = deps.webrtcTransferEnabled

  /** @deprecated Optical is always on (More); setter kept for API compat. */
  function setOpticalTransferEnabled(_on: boolean): void {
    opticalTransferEnabled.value = true
  }

  /** Labs: enable/disable Local Library UI and routes. */
  function setLocalLibraryEnabled(on: boolean): void {
    localLibraryEnabled.value = on
  }

  /** Labs: enable/disable WebRTC wireless transfer mode. */
  function setWebrtcTransferEnabled(on: boolean): void {
    webrtcTransferEnabled.value = on
  }

  /** @deprecated OS Share removed; no-op. */
  function setOsShareTransferEnabled(_on: boolean): void {
    osShareTransferEnabled.value = false
  }

  /** @deprecated Audio Recorder is always on (More); setter kept for API compat. */
  function setAudioRecorderEnabled(_on: boolean): void {
    audioRecorderEnabled.value = true
  }

  /** Labs: enable/disable Sing Together repertoire correlation. */
  function setSingTogetherEnabled(on: boolean): void {
    singTogetherEnabled.value = on
  }

  /** Labs: enable/disable Tag Studio (includes Coach). */
  function setTagRollEnabled(on: boolean): void {
    tagRollEnabled.value = on
  }

  /**
   * @deprecated Coach tracks Tag Studio — prefer setTagRollEnabled.
   */
  function setArrangingEnabled(on: boolean): void {
    setTagRollEnabled(on)
  }

  const actions = {
    setOpticalTransferEnabled,
    setLocalLibraryEnabled,
    setWebrtcTransferEnabled,
    setOsShareTransferEnabled,
    setAudioRecorderEnabled,
    setSingTogetherEnabled,
    setTagRollEnabled,
    setArrangingEnabled,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {

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
          // Legacy key — keep in sync so old builds / bookmarks don't leave Coach off.
          localStorage.setItem(ARRANGING_ENABLED_KEY, v ? '1' : '0')
        } catch {
          /* ignore */
        }
      },
      { flush: 'sync' },
    )
  }

  return { actions, bindWatches }

}
