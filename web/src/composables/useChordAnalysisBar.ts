/**
 * Chord-analysis strip state for Tag Studio (segments, mode, overrides).
 */
import { computed, ref, watch, type Ref } from 'vue'
import {
  absoluteChordLabel,
  buildChordAnalysisSegments,
  listNatureNameCandidates,
  type ChordAnalysisMode,
  type ChordAnalysisOverride,
  type ChordAnalysisSegment,
  type NatureNameCandidate,
} from '../domain/arranging/chordAnalysisBar'
import { isKnownStack } from '../domain/arranging/coachEntryMode'
import {
  impliedStacksForBareMelody,
  inferImpliedChordsFromMelody,
  type BareMelodyMoment,
} from '../domain/arranging/impliedMelodyChord'
import { tagStudioToArrangement } from '../application/arranging/syncTagRoll'
import { mergeStacksFromRollImport } from '../domain/arranging/mergeStacksFromRoll'
import {
  loadChordAnalysisCollapsed,
  loadChordAnalysisMode,
  loadChordAnalysisOverrides,
  saveChordAnalysisCollapsed,
  saveChordAnalysisMode,
  saveChordAnalysisOverride,
} from '../lib/tagRoll/chordAnalysisPrefs'
import type { TagRollProject } from '../lib/tagRoll/types'
import { useArrangementStore } from '../stores/arrangement'
import { DEFAULT_CONTEST_PROFILE } from '../domain/arranging/contestProfile'

function partByName(project: TagRollProject, name: string) {
  return project.parts.find((p) => p.name === name)
}

/** Lead spans with no TBB sounding — candidates for key-based implication.
 * Held leads are clipped at the next harmony onset so we don't paint one
 * implied chord across later stack changes under the same note.
 */
export function bareMelodyMomentsFromTag(tag: TagRollProject): BareMelodyMoment[] {
  const lead =
    (tag.melodyPartId ? tag.parts.find((p) => p.id === tag.melodyPartId) : null) ??
    partByName(tag, 'Lead')
  if (!lead) return []
  const tenor = partByName(tag, 'Tenor')
  const bari = partByName(tag, 'Bari')
  const bass = partByName(tag, 'Bass')
  const harmonyIds = [tenor?.id, bari?.id, bass?.id].filter(Boolean) as string[]

  const leadNotes = tag.notes
    .filter((n) => n.partId === lead.id)
    .sort((a, b) => a.startTick - b.startTick || a.midi - b.midi)

  const harmonyOnsets = tag.notes
    .filter((n) => harmonyIds.includes(n.partId))
    .map((n) => n.startTick)
    .sort((a, b) => a - b)

  const out: BareMelodyMoment[] = []
  for (const n of leadNotes) {
    const hasHarmony = harmonyIds.some((partId) =>
      tag.notes.some(
        (h) =>
          h.partId === partId &&
          h.startTick <= n.startTick &&
          n.startTick < h.startTick + h.durationTicks,
      ),
    )
    if (hasHarmony) continue
    const leadEnd = n.startTick + n.durationTicks
    const cut = harmonyOnsets.find((t) => t > n.startTick && t < leadEnd)
    out.push({
      startTick: n.startTick,
      durationTicks: Math.max(1, (cut ?? leadEnd) - n.startTick),
      midi: n.midi,
    })
  }
  return out
}

export function useChordAnalysisBar(project: Ref<TagRollProject | null>) {
  const arrStore = useArrangementStore()

  const collapsed = ref(loadChordAnalysisCollapsed(false))
  const mode = ref<ChordAnalysisMode>(loadChordAnalysisMode('name'))
  const overrides = ref<Record<string, ChordAnalysisOverride>>({})

  watch(
    () => project.value?.id,
    (id) => {
      overrides.value = id ? loadChordAnalysisOverrides(id) : {}
    },
    { immediate: true },
  )

  function setCollapsed(on: boolean): void {
    collapsed.value = on
    saveChordAnalysisCollapsed(on)
  }

  function setMode(next: ChordAnalysisMode): void {
    mode.value = next
    saveChordAnalysisMode(next)
  }

  function setOverride(tick: number, patch: ChordAnalysisOverride): void {
    const id = project.value?.id
    if (!id) return
    overrides.value = saveChordAnalysisOverride(id, String(tick), patch)
  }

  const linkedArrangement = computed(() => {
    const tag = project.value
    if (!tag) return null
    const linkId = `arr_${tag.id}`
    return (
      arrStore.projects.find((p) => p.id === linkId) ??
      (arrStore.current?.id === linkId ? arrStore.current : null)
    )
  })

  const harmonyStacks = computed(() => {
    const tag = project.value
    if (!tag) return []
    let live: ReturnType<typeof tagStudioToArrangement>['stacks'] = []
    try {
      let n = 0
      live = tagStudioToArrangement(tag, {
        next: (prefix: string) => `${prefix}_ca_${n++}`,
      }).stacks
    } catch {
      live = []
    }
    const linked = linkedArrangement.value?.stacks ?? []
    // Live roll owns split timing (held lead + TBB changes); linked keeps named Apply.
    return mergeStacksFromRollImport(live, linked)
  })

  const tonalityMode = computed(
    () => linkedArrangement.value?.tonalityMode ?? project.value?.tonalityMode ?? 'major',
  )

  const bareMoments = computed(() => {
    const tag = project.value
    return tag ? bareMelodyMomentsFromTag(tag) : []
  })

  const impliedStacks = computed(() => {
    const tag = project.value
    if (!tag) return []
    return impliedStacksForBareMelody({
      moments: bareMoments.value,
      existingStacks: harmonyStacks.value,
      tonality: tag.tonality,
      mode: tonalityMode.value,
    })
  })

  const analysisStacks = computed(() => {
    const byTick = new Map(harmonyStacks.value.map((s) => [s.startTick, s]))
    for (const s of impliedStacks.value) {
      if (!byTick.has(s.startTick)) byTick.set(s.startTick, s)
    }
    return [...byTick.values()].sort((a, b) => a.startTick - b.startTick)
  })

  const nameCandidatesByTick = computed(() => {
    const tag = project.value
    const map = new Map<number, NatureNameCandidate[]>()
    if (!tag) return map
    const profile = linkedArrangement.value?.contestProfile ?? DEFAULT_CONTEST_PROFILE
    const mode = tonalityMode.value
    const momentsByTick = new Map(bareMoments.value.map((m) => [m.startTick, m]))

    for (const s of analysisStacks.value) {
      if (s.midi && !isKnownStack(s)) {
        map.set(
          s.startTick,
          listNatureNameCandidates({
            midi: s.midi,
            profile,
            tonality: tag.tonality,
            preferFlats: tag.preferFlats,
            limit: 3,
          }),
        )
        continue
      }
      if (!s.midi && s.natureId !== 'unknown') {
        const midi = momentsByTick.get(s.startTick)?.midi
        if (midi == null) continue
        map.set(
          s.startTick,
          inferImpliedChordsFromMelody({
            melodyMidi: midi,
            tonality: tag.tonality,
            mode,
            limit: 3,
          }).map((c) => ({
            rootPc: c.rootPc,
            natureId: c.natureId,
            label: absoluteChordLabel(c.rootPc, c.natureId, tag.preferFlats, {
              tonality: tag.tonality,
              tonalityMode: mode,
            }),
            roman: c.roman,
          })),
        )
      }
    }
    return map
  })

  const segments = computed((): ChordAnalysisSegment[] => {
    const tag = project.value
    if (!tag) return []
    return buildChordAnalysisSegments({
      stacks: analysisStacks.value,
      tonality: tag.tonality,
      tonalityMode: tonalityMode.value,
      preferFlats: tag.preferFlats,
      nameCandidatesByTick: nameCandidatesByTick.value,
      overrides: overrides.value,
      lengthTicks: tag.lengthTicks,
    })
  })

  return {
    collapsed,
    mode,
    segments,
    setCollapsed,
    setMode,
    setOverride,
  }
}
