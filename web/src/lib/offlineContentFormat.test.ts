/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  AUDIO_CONTENT_FORMAT_ID,
  OFFLINE_CONTENT_FORMAT_KEY,
  SHEETS_CONTENT_FORMAT_ID,
  currentOfflineContentFormat,
  packsNeedingFormatReset,
  readOfflineContentFormatStamp,
  writeOfflineContentFormatStamp,
} from './offlineContentFormat'

describe('offlineContentFormat', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stamps current sheets/audio format ids', () => {
    expect(currentOfflineContentFormat()).toEqual({
      sheets: SHEETS_CONTENT_FORMAT_ID,
      audio: AUDIO_CONTENT_FORMAT_ID,
    })
  })

  it('does not reset packs on first run (no stamp yet)', () => {
    expect(packsNeedingFormatReset(null)).toEqual({ sheets: false, audio: false })
  })

  it('flags only the packs whose media format id changed', () => {
    expect(
      packsNeedingFormatReset({
        sheets: SHEETS_CONTENT_FORMAT_ID,
        audio: 'audio-ancient-v0',
      }),
    ).toEqual({ sheets: false, audio: true })
    expect(
      packsNeedingFormatReset({
        sheets: 'sheets-ancient-v0',
        audio: 'audio-ancient-v0',
      }),
    ).toEqual({ sheets: true, audio: true })
  })

  it('round-trips the localStorage stamp', () => {
    writeOfflineContentFormatStamp(currentOfflineContentFormat())
    expect(readOfflineContentFormatStamp()).toEqual(currentOfflineContentFormat())
    expect(localStorage.getItem(OFFLINE_CONTENT_FORMAT_KEY)).toBeTruthy()
  })
})
