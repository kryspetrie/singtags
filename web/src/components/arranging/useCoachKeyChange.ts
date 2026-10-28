/**
 * Coach Keychange helper (Phase K6) — list paths, apply Sketch + arrival key marker.
 */
import { computed, ref, watch, type Ref } from 'vue'
import {
  listModulationOptions,
  type ModulationOption,
} from '../../application/arranging/KeyChangeApply'
import { keyChangeRollGhosts, voiceModulationHearPath } from '../../application/arranging/KeyChangeHear'
import { getArrangingServices } from '../../composition/arranging'
import type { AudioPreview } from '../../ports/AudioPreview'
import { useTagRollStore } from '../../stores/tagRoll'
import type { HarmonySketchQuality } from '../../lib/tagRoll/types'
import { TAG_ROLL_PPQ } from '../../lib/tagRoll/types'
import { keyAtTick } from '../../lib/tagRoll/keyMap'

const PC_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

export function useCoachKeyChange(opts?: {
  /** Override playhead tick (defaults to Tag Studio playhead). */
  playheadTick?: Ref<number>
}) {
  const tagStore = useTagRollStore()

  const fromTonality = ref(0)
  const toTonality = ref(1)
  const measureBudget = ref(2)
  const includeHybrids = ref(false)
  const includePosts = ref(false)
  const holdPc = ref(0)
  const fromTouched = ref(false)
  const selectedPathId = ref<string | null>(null)
  const applyStepIndex = ref(0)
  const status = ref('')

  function keyFromPlayhead(): void {
    if (fromTouched.value) return
    const p = tagStore.current
    if (!p) return
    const key = keyAtTick(p.view?.playheadTick ?? 0, p.keyMarkers, {
      tonality: p.tonality,
      tonalityMode: p.tonalityMode,
      preferFlats: p.preferFlats,
    })
    fromTonality.value = ((key.tonality % 12) + 12) % 12
    holdPc.value = fromTonality.value
  }

  function syncFromProject(): void {
    fromTouched.value = false
    keyFromPlayhead()
    toTonality.value = (fromTonality.value + 1) % 12
  }

  function touchFrom(): void {
    fromTouched.value = true
  }

  function setLift(semis: number): void {
    toTonality.value = (((fromTonality.value + semis) % 12) + 12) % 12
  }

  const playhead = computed(() => {
    if (opts?.playheadTick) return opts.playheadTick.value
    return tagStore.current?.view?.playheadTick ?? 0
  })

  watch(playhead, () => keyFromPlayhead())

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
    const leadId = p.parts.find((x) => x.name === 'Lead')?.id
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
    for (const opt of options.value) {
      if (opt.path.id === id) return opt
      const alt = opt.alts?.find((a) => a.path.id === id)
      if (alt) return alt
    }
    return options.value.find((o) => o.packOk) ?? null
  })

  const previewGhosts = computed(() => {
    const packed = selected.value?.packOk ? selected.value.packed : undefined
    if (!packed?.length) return []
    const parts = tagStore.current?.parts ?? []
    return keyChangeRollGhosts(packed, {
      tonality: fromTonality.value,
      melodyNotes: melodyNotes.value,
      colorFor: (name) => parts.find((p) => p.name === name)?.color,
    })
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
    previewGhosts,
    syncFromProject,
    touchFrom,
    setLift,
    selectPath,
    applyNextStep,
    applyAll,
    hearSelected,
    dispose,
  }
}
