/**
 * Coach cadence multi-moment plans (Phase C3) — suggest + Sketch apply + Hear/Show.
 */
import { computed, onUnmounted, ref, type Ref } from 'vue'
import {
  listCadencePlans,
  planStepToSketchPatch,
  planToSketchPatches,
} from '../../application/arranging/CadencePlans'
import {
  cadencePlanReplaceRange,
  voiceCadencePlanHearPath,
} from '../../application/arranging/CadencePlanHear'
import type { CadenceSuggestion } from '../../domain/arranging/cadences'
import { loadCadenceBias } from '../../domain/arranging/cadences'
import type { HarmonicMoment } from '../../domain/arranging/harmonicMoments'
import { getArrangingServices } from '../../composition/arranging'
import type { AudioPreview } from '../../ports/AudioPreview'
import { coachGhostsForVoicing, coachSketchPreviewDraft } from '../../lib/arranging/coachChordPreview'
import type { CoachPreviewGhost } from '../../lib/arranging/coachChordPreview'
import type { HarmonyPreviewDraft } from '../../lib/tagRoll/harmonyPreviewDraft'
import type { HarmonySketchQuality } from '../../lib/tagRoll/types'
import { useArrangementStore } from '../../stores/arrangement'
import { useTagRollStore } from '../../stores/tagRoll'

export function useCoachCadencePlans(opts: {
  moments: Ref<readonly HarmonicMoment[]>
  selectedMomentId: Ref<string | null>
}) {
  const arrStore = useArrangementStore()
  const tagStore = useTagRollStore()
  const hearingPlanId = ref<string | null>(null)
  const previewPlanId = ref<string | null>(null)
  let audio: AudioPreview | null = null
  let hearGen = 0

  const cadencePlanMoments = computed(() =>
    opts.moments.value.map((m) => ({
      startTick: m.startTick,
      endTick: m.startTick + Math.max(1, m.durationTicks),
      melodyMidi: m.leadMidi,
    })),
  )

  const cadencePlans = computed((): CadenceSuggestion[] => {
    const p = arrStore.current
    const moments = cadencePlanMoments.value
    if (!p || !moments.length) return []
    const sketch = tagStore.current?.harmonySketch ?? []
    const selId = opts.selectedMomentId.value
    const fromIndex = Math.max(
      0,
      selId ? opts.moments.value.findIndex((m) => m.id === selId) : 0,
    )
    return listCadencePlans({
      moments,
      tonality: p.tonality,
      mode: p.tonalityMode ?? 'major',
      fromIndex: fromIndex >= 0 ? fromIndex : 0,
      bias: loadCadenceBias('strong'),
      limit: 6,
      sketchSpans: sketch.map((s) => ({
        startTick: s.startTick,
        endTick: s.endTick,
        rootPc: s.rootPc,
        natureId: s.quality,
        locked: s.locked,
      })),
      pillars: (p.pillars ?? []).map((pil) => ({
        startTick: pil.startTick,
        rootPc: pil.rootPc,
      })),
    })
  })

  function applyCadencePatches(
    plan: CadenceSuggestion,
    stepIndex?: number,
  ): { applied: number; skipped: string[] } {
    const moments = cadencePlanMoments.value
    const sketch = tagStore.current?.harmonySketch ?? []
    const sketchSpans = sketch.map((s) => ({
      startTick: s.startTick,
      endTick: s.endTick,
      rootPc: s.rootPc,
      natureId: s.quality,
      locked: s.locked,
    }))
    const result =
      stepIndex == null ?
        planToSketchPatches(plan, moments, sketchSpans)
      : planStepToSketchPatch(plan, stepIndex, moments, sketchSpans)

    let applied = 0
    for (const patch of result.patches) {
      tagStore.upsertHarmonySketchSpan({
        startTick: patch.startTick,
        endTick: patch.endTick,
        rootPc: patch.rootPc,
        quality: patch.quality as HarmonySketchQuality,
        source: 'coach',
        locked: true,
        pillar: patch.pillar,
      })
      applied += 1
    }
    return { applied, skipped: result.skipped }
  }

  function applyCadencePlan(plan: CadenceSuggestion): void {
    applyCadencePatches(plan)
  }

  function applyCadencePlanStep(plan: CadenceSuggestion, stepIndex: number): void {
    applyCadencePatches(plan, stepIndex)
  }

  function stopHearCadencePlan(): void {
    hearGen += 1
    hearingPlanId.value = null
    audio?.dispose()
    audio = null
  }

  async function hearCadencePlan(plan: CadenceSuggestion): Promise<void> {
    if (hearingPlanId.value === plan.id) {
      stopHearCadencePlan()
      return
    }
    const moments = cadencePlanMoments.value
    const tonality = arrStore.current?.tonality ?? 0
    const voicings = voiceCadencePlanHearPath(plan, moments, { tonality })
    if (!voicings.length) return
    stopHearCadencePlan()
    const gen = hearGen
    hearingPlanId.value = plan.id
    if (!audio) audio = getArrangingServices().createAudioPreview()
    try {
      for (const midi of voicings) {
        if (gen !== hearGen) return
        await audio.playStack({ midi }, 550)
        if (gen !== hearGen) return
        await new Promise((r) => window.setTimeout(r, 600))
      }
    } finally {
      if (gen === hearGen) hearingPlanId.value = null
    }
  }

  function buildCadencePlanPreview(
    plan: CadenceSuggestion,
    colorFor: (partName: string, fallback: string) => string,
  ): {
    range: { startTick: number; endTick: number }
    draft: HarmonyPreviewDraft
    ghosts: CoachPreviewGhost[]
  } | null {
    const moments = cadencePlanMoments.value
    const range = cadencePlanReplaceRange(plan, moments)
    if (!range) return null
    const tonality = arrStore.current?.tonality ?? 0
    const voicings = voiceCadencePlanHearPath(plan, moments, { tonality })
    const ghosts: CoachPreviewGhost[] = []
    let vi = 0
    for (const st of plan.steps) {
      const mi = plan.startMomentIndex + st.momentOffset
      const m = moments[mi]
      const midi = voicings[vi++]
      if (!m || !midi) continue
      const dur = Math.max(1, m.endTick - m.startTick)
      ghosts.push(
        ...coachGhostsForVoicing(
          { rootPc: st.rootPc, natureId: st.natureId, midi },
          m.startTick,
          dur,
          colorFor,
        ),
      )
    }
    const first = plan.steps[0]!
    const draft = coachSketchPreviewDraft(
      range.startTick,
      range.endTick - range.startTick,
      first.rootPc,
      first.natureId,
    )
    return { range, draft, ghosts }
  }

  function clearCadencePlanPreview(): void {
    previewPlanId.value = null
  }

  function markCadencePlanPreview(planId: string | null): void {
    previewPlanId.value = planId
  }

  onUnmounted(() => {
    stopHearCadencePlan()
  })

  return {
    cadencePlans,
    applyCadencePlan,
    applyCadencePlanStep,
    hearCadencePlan,
    stopHearCadencePlan,
    hearingPlanId,
    previewPlanId,
    buildCadencePlanPreview,
    clearCadencePlanPreview,
    markCadencePlanPreview,
    cadencePlanReplaceRange: (plan: CadenceSuggestion) =>
      cadencePlanReplaceRange(plan, cadencePlanMoments.value),
  }
}
