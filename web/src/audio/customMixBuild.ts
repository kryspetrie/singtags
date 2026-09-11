/**
 * Build the Custom-tab multi-part mix (stereo WAV object URL).
 * Shared by TagPlayer playback and TagDownloads export.
 */

import { buildSoloMixObjectUrl, type SoloMixResult } from './multiPartMix'
import { buildUltraMixObjectUrl } from './partLeftReconstruct'
import type { PartSide } from '../lib/audioLayout'

export interface CustomMixPartInput {
  part: string
  url: string
  soloInFile: PartSide
  /** Output pan (−1…+1). */
  pan: number
}

/**
 * Combine ≥2 learning parts into one stereo mix object URL.
 * Caller must revoke the URL when done.
 */
export async function buildCustomMixObjectUrl(
  parts: CustomMixPartInput[],
  opts: { ultraStem: boolean },
): Promise<SoloMixResult> {
  if (parts.length < 2) throw new Error('Need at least two parts to combine')
  if (opts.ultraStem) {
    return buildUltraMixObjectUrl(
      parts.map((p) => ({ part: p.part, url: p.url, pan: p.pan })),
    )
  }
  return buildSoloMixObjectUrl(
    parts.map((p) => ({
      url: p.url,
      soloInFile: p.soloInFile,
      pan: p.pan,
    })),
  )
}
