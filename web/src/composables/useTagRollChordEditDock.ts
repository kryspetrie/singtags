/**
 * Sketch / Detected chord-edit session for the right-hand dock (exclusive with Coach / Harmonize).
 */
import { computed, type ComputedRef, type Ref } from 'vue'
import type { ChordAnalysisMode, ChordAnalysisSegment } from '../domain/arranging/chordAnalysisBar'
import {
  rankHintsFromCandidates,
  type ChordRankHint,
} from '../lib/tagRoll/harmonizer/chordPickOptions'
import type { HarmonyPreviewDraft } from '../lib/tagRoll/harmonyPreviewDraft'
import {
  isHarmonySketchQuality,
  type HarmonySketchQuality,
} from '../lib/tagRoll/harmonySketch'
import type { TagRollProject } from '../lib/tagRoll/types'
import type { ChordEditDraft } from '../components/tagRoll/TagRollChordEditPopover.vue'

export type ChordEditDockSession = {
  variant: 'declared' | 'detected'
  segId: string
}

export function useTagRollChordEditDock(opts: {
  coachOpen: Ref<boolean>
  harmonizeOpen: Ref<boolean>
  session: Ref<ChordEditDockSession | null>
  onClosePreview: () => void
  project: ComputedRef<TagRollProject | null | undefined>
  declaredSegments: ComputedRef<readonly ChordAnalysisSegment[]>
  detectSegments: ComputedRef<readonly ChordAnalysisSegment[]>
  declaredMode: ComputedRef<ChordAnalysisMode>
  detectedMode: ComputedRef<ChordAnalysisMode>
  nameCandidatesByTick: ComputedRef<
    ReadonlyMap<
      number,
      readonly { rootPc: number; natureId: string; label?: string; cadenceLabel?: string }[]
    >
  >
  harmonyPreview: Ref<HarmonyPreviewDraft | null>
  selectSketchSpans: (ids: string[]) => void
  setChordCursor: (
    range: { startTick: number; endTick: number },
    opts?: { select?: 'pillar' | 'column' | 'range' | 'none' },
  ) => void
  applyDraft: (id: string, draft: { rootPc: number; quality: HarmonySketchQuality }) => void
  removeSketch: (id: string) => void
  hearSketch: (
    startTick: number,
    endTick: number,
    draft?: { rootPc: number; quality: HarmonySketchQuality },
  ) => void
}) {
  const isOpen = computed(() => opts.session.value != null)

  function open(next: ChordEditDockSession): void {
    opts.coachOpen.value = false
    opts.harmonizeOpen.value = false
    const cur = opts.session.value
    if (cur?.variant === next.variant && cur.segId === next.segId) {
      close()
      return
    }
    opts.session.value = next
  }

  function close(): void {
    if (!opts.session.value) return
    opts.onClosePreview()
    opts.session.value = null
  }

  /** Switch Detected → Sketch after Lock/Apply keeps the dock on the new span. */
  function promoteToDeclared(segId: string): void {
    if (!opts.session.value) return
    opts.session.value = { variant: 'declared', segId }
  }

  const seg = computed((): ChordAnalysisSegment | null => {
    const s = opts.session.value
    if (!s) return null
    const list =
      s.variant === 'declared' ? opts.declaredSegments.value : opts.detectSegments.value
    return list.find((x) => x.id === s.segId) ?? null
  })

  const mode = computed(() =>
    opts.session.value?.variant === 'detected'
      ? opts.detectedMode.value
      : opts.declaredMode.value,
  )

  const rankHints = computed((): ChordRankHint[] | null => {
    const s = seg.value
    if (!s) return null
    const raw = opts.nameCandidatesByTick.value?.get(s.startTick)
    if (!raw?.length) return null
    return rankHintsFromCandidates(raw)
  })

  function leadMidiAtTick(tick: number): number | null {
    const p = opts.project.value
    if (!p) return null
    const melId =
      p.view.melodyPartId ?? p.parts.find((x) => x.name === 'Lead')?.id ?? null
    if (!melId) return null
    const hit = p.notes.find(
      (n) =>
        n.partId === melId && n.startTick <= tick && tick < n.startTick + n.durationTicks,
    )
    return hit?.midi ?? null
  }

  const leadMidi = computed(() => {
    const s = seg.value
    return s ? leadMidiAtTick(s.startTick) : null
  })

  function onLaneEdit(variant: 'declared' | 'detected', target: ChordAnalysisSegment): void {
    if (variant === 'declared') opts.selectSketchSpans([target.id])
    open({ variant, segId: target.id })
    opts.setChordCursor(
      { startTick: target.startTick, endTick: target.endTick },
      { select: 'none' },
    )
  }

  function onDraft(draft: ChordEditDraft | null): void {
    const s = seg.value
    if (!draft || !s || s.rootPc == null) {
      if (opts.harmonyPreview.value?.source === 'popover') opts.harmonyPreview.value = null
      return
    }
    const q0 = (s.quality ?? 'major') as HarmonySketchQuality
    opts.harmonyPreview.value = {
      id: s.id,
      startTick: s.startTick,
      endTick: s.endTick,
      rootPc: draft.rootPc,
      quality: draft.quality,
      baseline: {
        rootPc: s.rootPc,
        quality: isHarmonySketchQuality(q0) ? q0 : 'major',
      },
      source: 'popover',
    }
  }

  function onHear(draft: ChordEditDraft): void {
    const s = seg.value
    if (!s) return
    opts.hearSketch(s.startTick, s.endTick, {
      rootPc: draft.rootPc,
      quality: draft.quality,
    })
  }

  function onApply(draft: ChordEditDraft): void {
    const session = opts.session.value
    if (!session) return
    opts.applyDraft(session.segId, draft)
    if (session.variant === 'detected') promoteToDeclared(session.segId)
    opts.selectSketchSpans([session.segId])
  }

  function onRemove(): void {
    const s = seg.value
    if (!s || opts.session.value?.variant !== 'declared') return
    opts.removeSketch(s.id)
    close()
  }

  return {
    isOpen,
    open,
    close,
    promoteToDeclared,
    seg,
    mode,
    rankHints,
    leadMidi,
    onLaneEdit,
    onDraft,
    onHear,
    onApply,
    onRemove,
  }
}
