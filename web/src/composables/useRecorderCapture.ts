/**
 * Session-page recording transport: MediaRecorder lifecycle, level meter, leave guards.
 */
import { computed, onUnmounted, ref, shallowRef, type Ref } from 'vue'
import type { RecorderCapturePrefs } from '../types/recorder'
import {
  channelsFromStream,
  createLiveInputMeter,
  listAudioInputDevices,
  openRecorderStream,
  pickSupportedRecorderMime,
  startRecorderCapture,
  type ActiveRecording,
  type LiveInputMeter,
} from '../audio/recorderCapture'

export type LeaveRecordingDecision = 'save' | 'discard' | 'stay'

export type RecorderCaptureCallbacks = {
  capture: Ref<RecorderCapturePrefs>
  onPersistCapture: () => void
  onSavedTake: (opts: {
    blob: Blob
    mimeType: string
    durationSec: number
    channels: 1 | 2
    bitRate: number
  }) => Promise<void>
  onError: (message: string) => void
  onDevices: (devices: MediaDeviceInfo[]) => void
  /** App modal: discard in-progress recording? */
  requestCancelConfirm: () => Promise<boolean>
  /** App modal: save / discard / stay while leaving. */
  requestLeaveDecision: () => Promise<LeaveRecordingDecision>
}

export function useRecorderCapture(cb: RecorderCaptureCallbacks) {
  const recording = ref(false)
  const paused = ref(false)
  const elapsed = ref(0)
  const liveMeter = shallowRef<LiveInputMeter | null>(null)
  const starting = ref(false)
  /** Set true after intentional leave so unmount does not double-cancel. */
  const leaveHandled = ref(false)

  let active: ActiveRecording | null = null
  let elapsedTimer: ReturnType<typeof setInterval> | null = null

  const canPause = computed(() => {
    if (!recording.value || !active) return false
    return typeof active.recorder.pause === 'function'
  })

  function releaseStreamTracks(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      try {
        track.stop()
      } catch {
        /* ignore */
      }
    }
  }

  function stopLevelMeter(): void {
    liveMeter.value?.dispose()
    liveMeter.value = null
  }

  function startLevelMeter(stream: MediaStream): void {
    stopLevelMeter()
    liveMeter.value = createLiveInputMeter(stream)
  }

  async function refreshDevices(): Promise<void> {
    try {
      cb.onDevices(await listAudioInputDevices())
    } catch {
      cb.onDevices([])
    }
  }

  async function startRecording(existingStream?: MediaStream | null): Promise<void> {
    if (recording.value || starting.value) return
    starting.value = true
    let stream: MediaStream | null = existingStream ?? null
    try {
      cb.onPersistCapture()
      const mime = pickSupportedRecorderMime(cb.capture.value.mimeType)
      cb.capture.value = { ...cb.capture.value, mimeType: mime }
      if (!stream) stream = await openRecorderStream(cb.capture.value)
      active = startRecorderCapture(stream, cb.capture.value)
      stream = null
      recording.value = true
      paused.value = false
      elapsed.value = 0
      startLevelMeter(active.stream)
      void refreshDevices()
      elapsedTimer = setInterval(() => {
        if (active) elapsed.value = active.elapsedSec()
      }, 200)
    } catch (e) {
      if (stream) releaseStreamTracks(stream)
      const msg =
        e instanceof Error
          ? e.name === 'NotAllowedError'
            ? 'Microphone permission denied'
            : e.message
          : String(e)
      cb.onError(msg)
      active?.cancel()
      active = null
      recording.value = false
      paused.value = false
      stopLevelMeter()
    } finally {
      starting.value = false
    }
  }

  async function stopRecording(): Promise<void> {
    if (!active) return
    const rec = active
    active = null
    if (elapsedTimer) {
      clearInterval(elapsedTimer)
      elapsedTimer = null
    }
    stopLevelMeter()
    recording.value = false
    paused.value = false
    try {
      const channels = channelsFromStream(rec.stream)
      const { blob, mimeType, durationSec } = await rec.stop()
      if (blob.size < 64) throw new Error('Recording was empty')
      await cb.onSavedTake({
        blob,
        mimeType,
        durationSec,
        channels,
        bitRate: cb.capture.value.bitRate,
      })
    } catch (e) {
      cb.onError(e instanceof Error ? e.message : String(e))
    }
  }

  function cancelRecording(): void {
    active?.cancel()
    active = null
    recording.value = false
    paused.value = false
    stopLevelMeter()
    if (elapsedTimer) {
      clearInterval(elapsedTimer)
      elapsedTimer = null
    }
  }

  async function onCancelClick(): Promise<void> {
    if (!recording.value) return
    if (!(await cb.requestCancelConfirm())) return
    cancelRecording()
  }

  function togglePause(): void {
    if (!active || !recording.value) return
    if (active.isPaused()) {
      if (active.resume()) paused.value = false
    } else if (active.pause()) {
      paused.value = true
    }
  }

  async function confirmLeaveWhileRecording(): Promise<boolean> {
    if (!recording.value) return true
    const decision = await cb.requestLeaveDecision()
    if (decision === 'save') {
      await stopRecording()
      leaveHandled.value = true
      return true
    }
    if (decision === 'discard') {
      cancelRecording()
      leaveHandled.value = true
      return true
    }
    return false
  }

  function onBeforeUnload(e: BeforeUnloadEvent): void {
    if (!recording.value) return
    e.preventDefault()
    e.returnValue = ''
  }

  function markLeaveHandled(): void {
    leaveHandled.value = true
  }

  function dispose(): void {
    stopLevelMeter()
    if (!leaveHandled.value) cancelRecording()
  }

  onUnmounted(() => {
    dispose()
  })

  return {
    recording,
    paused,
    elapsed,
    liveMeter,
    canPause,
    leaveHandled,
    startRecording,
    stopRecording,
    cancelRecording,
    onCancelClick,
    togglePause,
    confirmLeaveWhileRecording,
    onBeforeUnload,
    markLeaveHandled,
    dispose,
    refreshDevices,
  }
}
