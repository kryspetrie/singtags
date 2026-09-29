/**
 * Coach Keychange helper (Phase K6) — list paths, apply Sketch + arrival key marker.
 */
import { computed, ref, type Ref } from 'vue'
import {
  listModulationOptions,
  type ModulationOption,
} from '../../application/arranging/KeyChangeApply'
import { voiceModulationHearPath } from '../../application/arranging/KeyChangeHear'
import { getArrangingServices } from '../../composition/arranging'
import type { AudioPreview } from '../../ports/AudioPreview'
import { useArrangementStore } from '../../stores/arrangement'
import { useTagRollStore } from '../../stores/tagRoll'
import type { HarmonySketchQuality } from '../../lib/tagRoll/types'
import { TAG_ROLL_PPQ } from '../../lib/tagRoll/types'

const PC_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

export function useCoachKeyChange(opts?: {
  /** Override playhead tick (defaults to Tag Studio playhead). */
  playheadTick?: Ref<number>
}) {
  const arrStore = useArrangementStore()
  const tagStore = useTagRollStore()

  const fromTonality = ref(0)
  const toTonality = ref(1)
  const measureBudget = ref(2)
  const includeHybrids = ref(false)
  const includePosts = ref(true)
  const holdPc = ref(0)
  const selectedPathId = ref<string | null>(null)
  const applyStepIndex = ref(0)
  const status = ref('')

  function syncFromProject(): void {
    const p = arrStore.current ?? tagStore.current
    if (!p) return
    const t = 'tonality' in p ? p.tonality : 0
    fromTonality.value = ((t % 12) + 12) % 12
    toTonality.value = (fromTonality.value + 1) % 12
    holdPc.value = fromTonality.value
  }

  const playhead = computed(() => {
    if (opts?.playheadTick) return opts.playheadTick.value
    return tagStore.current?.view?.playheadTick ?? 0
  })

  const ppq = computed(() => tagStore.current?.ppq ?? TAG_ROLL_PPQ)
  const ts = computed(
    () => tagStore.current?.timeSignature ?? { numerator: 4, denominator: 4 },
  )

  const measureTicks = computed(() => {
    const { numerator, denominator } = ts.value
    return Math.max(1, Math.round((numerator * ppq.value * 4) / denominator))
  })

  const span = computed(() => {
    const start = Math.max(0, Math.round(playhead.value))
    const end = start + measureBudget.value * measureTicks.value
    return { startTick: start, endTick: end }
  })

  const melodyNotes = computed(() => {
    const p = tagStore.current
    if (!p) return []
    const leadId = p.parts.find((x) => x.role === 'lead')?.id
    return p.notes
      .filter((n) => (leadId ? n.partId === leadId : true))
      .filter((n) => n.startTick >= span.value.startTick && n.startTick < span.value.endTick)
      .map((n) => ({
        startTick: n.startTick,
        endTick: n.startTick + n.durationTicks,
        midi: n.midi,
      }))
  })

  const options = computed((): ModulationOption[] => {
    if (fromTonality.value === toTonality.value) return []
    return listModulationOptions({
      fromTonality: fromTonality.value,
      toTonality: toTonality.value,
      preferUp: true,
      includeHybrids: includeHybrids.value,
      includePosts: includePosts.value,
      holdPc: holdPc.value,
      enumerateHybrids: includeHybrids.value,
      limit: 16,
      maxLength: Math.max(6, measureBudget.value * 3),
      startTick: span.value.startTick,
      endTick: span.value.endTick,
      ppq: ppq.value,
      numerator: ts.value.numerator,
      denominator: ts.value.denominator,
      melodyNotes: melodyNotes.value,
      beforeMeasureCount: measureBudget.value,
      afterMeasureCount: measureBudget.value,
    })
  })

  const selected = computed(() => {
    const id = selectedPathId.value
    return (
      options.value.find((o) => o.path.id === id) ??
      options.value.find((o) => o.packOk) ??
      null
    )
  })

  function selectPath(id: string): void {
    selectedPathId.value = id
    applyStepIndex.value = 0
    status.value = ''
  }

  function applyNextStep(): void {
    const opt = selected.value
    if (!opt?.packOk || !opt.patches?.length) {
      status.value = opt?.reason ?? 'Select a path that fits the measure budget.'
      return
    }
    const i = applyStepIndex.value
    const patch = opt.patches[i]
    if (!patch) {
      status.value = 'All steps applied.'
      return
    }
    tagStore.upsertHarmonySketchSpan({
      startTick: patch.startTick,
      endTick: patch.endTick,
      rootPc: patch.rootPc,
      quality: patch.quality as HarmonySketchQuality,
      source: 'coach',
      locked: true,
      pillar: patch.pillar,
    })
    applyStepIndex.value = i + 1
    if (applyStepIndex.value >= opt.patches.length) {
      // Arrival key marker at last step start
      const last = opt.patches.at(-1)!
      tagStore.setKeyAtTick(last.startTick, {
        tonality: toTonality.value,
        tonalityMode: 'major',
        preferFlats: toTonality.value === 1 || toTonality.value === 3 || toTonality.value === 5 || toTonality.value === 8 || toTonality.value === 10,
      })
      status.value = `Applied ${opt.path.label} · key → ${PC_NAMES[toTonality.value]}`
    } else {
      status.value = `Applied step ${i + 1}/${opt.patches.length}`
    }
  }

  function applyAll(): void {
    applyStepIndex.value = 0
    const opt = selected.value
    if (!opt?.patches?.length) return
    while (applyStepIndex.value < opt.patches.length) {
      applyNextStep()
    }
  }

  let audio: AudioPreview | null = null
  async function hearSelected(): Promise<void> {
    const opt = selected.value
    if (!opt?.packed?.length) return
    if (!audio) audio = getArrangingServices().createAudioPreview()
    const voicings = voiceModulationHearPath(opt.packed, {
      tonality: fromTonality.value,
      melodyNotes: melodyNotes.value,
    })
    for (const midi of voicings) {
      await audio.playStack({ midi }, 550)
      await new Promise((r) => window.setTimeout(r, 600))
    }
  }

  function dispose(): void {
    audio?.dispose()
    audio = null
  }

  return {
    PC_NAMES,
    fromTonality,
    toTonality,
    measureBudget,
    includeHybrids,
    includePosts,
    holdPc,
    selectedPathId,
    applyStepIndex,
    status,
    span,
    options,
    selected,
    syncFromProject,
    selectPath,
    applyNextStep,
    applyAll,
    hearSelected,
    dispose,
  }
}
