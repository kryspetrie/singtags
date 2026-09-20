/** localStorage keys for shared UI preferences. */

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
/** Labs: OS Share handoff (Quick Share / AirDrop via share sheet). Default off. */
export const OS_SHARE_TRANSFER_ENABLED_KEY = 'singtags.labs.osShareTransfer.enabled.v1'
export const AUDIO_RECORDER_ENABLED_KEY = 'singtags.labs.audioRecorder.enabled.v1'
/** Labs: Sing Together repertoire correlation via QR. Default off. */
export const SING_TOGETHER_ENABLED_KEY = 'singtags.labs.singTogether.enabled.v1'
/** Labs: Tag Studio piano-roll composer. Default off. */
export const TAG_ROLL_ENABLED_KEY = 'singtags.labs.tagStudio.enabled.v1'
export const TAG_ROLL_CELL_W_KEY = 'singtags.labs.tagStudio.cellW.v1'
export const TAG_ROLL_CELL_H_KEY = 'singtags.labs.tagStudio.cellH.v1'
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

try {
  localStorage.removeItem(LEGACY_AUDIO_QUALITY_KEY)
} catch {
  /* ignore */
}
