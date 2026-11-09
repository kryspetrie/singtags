/**
 * Stereo tail routing for the tag player: solo, balance, and mono fan.
 * Transport and bake stay on TagAudioPlayer.
 */
import type { SoloMode } from './channelSolo'
import type { PartSide } from '../lib/audioLayout'
import { OUTPUT_HEADROOM } from './playerUtils'

export type PlayerChannelRoute = {
  solo: SoloMode
  monoPanSide: PartSide | null
  peakL: number
  peakR: number
  normL: number
  normR: number
  gainL: GainNode | null
  gainR: GainNode | null
  merger: ChannelMergerNode | null
  splitter: ChannelSplitterNode | null
  monoFan: GainNode | null
  balance: { l: number; r: number }
}

export function routeStereoOutputs(p: PlayerChannelRoute): void {
  if (!p.gainL || !p.gainR || !p.merger) return
  try {
    p.gainL.disconnect()
  } catch {
    /* ignore */
  }
  try {
    p.gainR.disconnect()
  } catch {
    /* ignore */
  }

  if (p.solo === 'left') {
    const peak = p.peakL > 1e-4 ? p.peakL : 1
    p.gainL.gain.value = Math.min(p.normL, OUTPUT_HEADROOM / peak)
    p.gainR.gain.value = 0
    p.gainL.connect(p.merger, 0, 0)
    p.gainL.connect(p.merger, 0, 1)
  } else if (p.solo === 'right') {
    const peak = p.peakR > 1e-4 ? p.peakR : 1
    p.gainL.gain.value = 0
    p.gainR.gain.value = Math.min(p.normR, OUTPUT_HEADROOM / peak)
    p.gainR.connect(p.merger, 0, 0)
    p.gainR.connect(p.merger, 0, 1)
  } else {
    p.gainL.gain.value = p.balance.l
    p.gainR.gain.value = p.balance.r
    p.gainL.connect(p.merger, 0, 0)
    p.gainR.connect(p.merger, 0, 1)
  }
}

export function connectPlayerSource(
  p: PlayerChannelRoute,
  src: AudioBufferSourceNode,
  mono: boolean,
): void {
  try {
    p.splitter?.disconnect()
  } catch {
    /* ignore */
  }
  try {
    p.monoFan?.disconnect()
  } catch {
    /* ignore */
  }

  // Only true mono files use the mono fan. Dual-mono stereo (identical L/R) must
  // still go through the splitter — collapsing via GainNode downmixes L+R and was
  // re-creating "same signal in both speakers" when monoPanSide was unset.
  // Learning-track rebuild (finalizeBlobUrl) is responsible for hard L/R separation.
  if (mono && p.monoPanSide) {
    src.connect(p.monoFan!)
    if (p.monoPanSide === 'left') p.monoFan!.connect(p.gainL!)
    else p.monoFan!.connect(p.gainR!)
  } else if (mono) {
    src.connect(p.monoFan!)
    p.monoFan!.connect(p.gainL!)
    p.monoFan!.connect(p.gainR!)
  } else {
    src.connect(p.splitter!)
    p.splitter!.connect(p.gainL!, 0)
    p.splitter!.connect(p.gainR!, 1)
  }
  routeStereoOutputs(p)
}
