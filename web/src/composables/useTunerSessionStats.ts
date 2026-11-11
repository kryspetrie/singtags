/**
 * Live session intonation stats + pitch history ribbon (not persisted).
 */
import { computed, reactive, ref, shallowRef, watch, type Ref } from 'vue'
import {
  createInTuneZoneAccumulator,
  holdInTuneProgress,
  inTuneZonePercents,
  pushInTuneZoneSample,
  resetInTuneZoneAccumulator,
  type InTuneZoneAccumulator,
  type InTuneZonePercents,
} from '../domain/tuner/inTuneZones'

export type PitchHistoryPoint = {
  tMs: number
  cents: number
  midi: number | null
  zone: 'in' | 'near' | 'far'
}

export function useTunerSessionStats(opts: {
  enabled: Ref<boolean>
  frozen: Ref<boolean>
  windowCents: Ref<number>
  clarityMin: Ref<number>
  /** Rolling history length (ms). */
  historyMs?: number
}) {
  const historyMs = opts.historyMs ?? 12_000
  const acc = reactive(createInTuneZoneAccumulator()) as InTuneZoneAccumulator
  const history = shallowRef<PitchHistoryPoint[]>([])
  const percents = ref<InTuneZonePercents>(inTuneZonePercents(acc))
  const holdProgress = ref(0)

  function refreshDerived(): void {
    percents.value = inTuneZonePercents(acc)
    holdProgress.value = holdInTuneProgress(acc, 2500)
  }

  function reset(): void {
    resetInTuneZoneAccumulator(acc)
    history.value = []
    refreshDerived()
  }

  function push(sample: {
    tMs: number
    cents: number | null
    clarity: number
    displayMidi: number | null
  }): void {
    if (!opts.enabled.value || opts.frozen.value) return

    const resetBySilence = pushInTuneZoneSample(
      acc,
      { tMs: sample.tMs, cents: sample.cents, clarity: sample.clarity },
      {
        windowCents: opts.windowCents.value,
        clarityMin: opts.clarityMin.value,
        nearMult: 2,
        silenceResetMs: 2000,
      },
    )
    if (resetBySilence) history.value = []

    if (sample.cents != null && Number.isFinite(sample.cents) && sample.clarity >= opts.clarityMin.value) {
      const win = Math.max(0.5, opts.windowCents.value)
      const a = Math.abs(sample.cents)
      const zone: PitchHistoryPoint['zone'] =
        a <= win ? 'in' : a <= win * 2 ? 'near' : 'far'
      const next = history.value.slice()
      next.push({
        tMs: sample.tMs,
        cents: sample.cents,
        midi: sample.displayMidi,
        zone,
      })
      const cutoff = sample.tMs - historyMs
      while (next.length && next[0]!.tMs < cutoff) next.shift()
      // Cap points (~60 Hz max → 12s ≈ 720; keep 360 for paint).
      while (next.length > 360) next.shift()
      history.value = next
    }

    refreshDerived()
  }

  watch(
    () => opts.enabled.value,
    (on) => {
      if (!on) reset()
    },
  )

  const hasVoice = computed(() => percents.value.totalVoicedMs > 80)

  return {
    acc,
    percents,
    holdProgress,
    history,
    hasVoice,
    push,
    reset,
  }
}
