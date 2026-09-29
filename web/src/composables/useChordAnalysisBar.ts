/**
 * Chord-analysis strip state for Tag Studio (segments, mode, overrides).
 */
import { computed, ref, watch, type Ref } from 'vue'
import {
  absoluteChordLabel,
  DETECT_ALT_LIMIT,
  detectAltCandidateCount,
  listNatureNameCandidates,
  nextDetectAltIndex,
  type ChordAnalysisMode,
  type ChordAnalysisOverride,
  type ChordAnalysisSegment,
  type NatureNameCandidate,
} from '../domain/arranging/chordAnalysisBar'
import {
  expandHeldMomentsForCadences,
  impliedStacksForBareMelody,
  inferImpliedChordsFromMelody,
  reorderImpliedByMelodyRole,
  type BareMelodyMoment,
} from '../domain/arranging/impliedMelodyChord'
import { phraseRoleAtMelodyIndex } from '../domain/arranging/cadences'
import { tagStudioToArrangement } from '../application/arranging/syncTagRoll'
import { mergeStacksFromRollImport } from '../domain/arranging/mergeStacksFromRoll'
import { buildHarmonyStripRows } from '../lib/tagRoll/harmonyStrip'
import {
  loadChordAnalysisOverrides,
  loadDeclaredChordMode,
  loadDetectedChordMode,
  saveChordAnalysisOverride,
  saveDeclaredChordMode,
  saveDetectedChordMode,
} from '../lib/tagRoll/chordAnalysisPrefs'
import { deferOverlappingOnsets } from '../lib/tagRoll/portamento'
import type { TagRollNote, TagRollProject } from '../lib/tagRoll/types'
import { useArrangementStore } from '../stores/arrangement'
import { usePreferencesStore } from '../stores/preferences'
import { DEFAULT_CONTEST_PROFILE } from '../domain/arranging/contestProfile'

function partByName(project: TagRollProject, name: string) {
  return project.parts.find((p) => p.name === name)
}

/** Unique portamento-deferred onsets for notes on one part. */
function deferredPartOnsets(notes: readonly TagRollNote[]): number[] {
  return deferOverlappingOnsets(
    notes.map((n) => ({
      startTick: n.startTick,
      durationTicks: n.durationTicks,
      midi: n.midi,
      id: n.id,
    })),
    (a, b) => a.midi - b.midi || a.id.localeCompare(b.id),
  ).map((n) => n.startTick)
}

/** Lead spans with no TBB sounding — candidates for key-based implication.
 * Held leads are clipped at the next harmony onset so we don't paint one
 * implied chord across later stack changes under the same note.
 * Same-part portamento overlaps use release timing (destination onset at
 * predecessor end) — matches sheet / Uncovered / coach moments.
 */
export function bareMelodyMomentsFromTag(tag: TagRollProject): BareMelodyMoment[] {
  const lead =
    (tag.view.melodyPartId ? tag.parts.find((p) => p.id === tag.view.melodyPartId) : null) ??
    partByName(tag, 'Lead')
  if (!lead) return []
  const tenor = partByName(tag, 'Tenor')
  const bari = partByName(tag, 'Bari')
  const bass = partByName(tag, 'Bass')
  const harmonyIds = [tenor?.id, bari?.id, bass?.id].filter(Boolean) as string[]

  const roleById = new Map(
    tag.notes.filter((n) => n.partId === lead.id).map((n) => [n.id, n.role] as const),
  )
  const leadNotes = deferOverlappingOnsets(
    tag.notes
      .filter((n) => n.partId === lead.id)
      .map((n) => ({
        startTick: n.startTick,
        durationTicks: n.durationTicks,
        midi: n.midi,
        id: n.id,
      })),
    (a, b) => a.midi - b.midi || a.id.localeCompare(b.id),
  )

  const harmonyOnsets = harmonyIds
    .flatMap((partId) => deferredPartOnsets(tag.notes.filter((n) => n.partId === partId)))
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
    const role = roleById.get(n.id)
    out.push({
      startTick: n.startTick,
      durationTicks: Math.max(1, (cut ?? leadEnd) - n.startTick),
      midi: n.midi,
      ...(role === 'pmn' || role === 'smn' ? { melodyRole: role } : {}),
    })
  }
  return out
}

export function useChordAnalysisBar(project: Ref<TagRollProject | null>) {
  const arrStore = useArrangementStore()
  const prefs = usePreferencesStore()

  const declaredMode = ref<ChordAnalysisMode>(loadDeclaredChordMode('name'))
  const detectedMode = ref<ChordAnalysisMode>(loadDetectedChordMode('name'))
  const overrides = ref<Record<string, ChordAnalysisOverride>>({})

  watch(
    () => project.value?.id,
    (id) => {
      overrides.value = id ? loadChordAnalysisOverrides(id) : {}
    },
    { immediate: true },
  )

  function setDeclaredMode(next: ChordAnalysisMode): void {
    declaredMode.value = next
    saveDeclaredChordMode(next)
  }

  function setDetectedMode(next: ChordAnalysisMode): void {
    detectedMode.value = next
    saveDetectedChordMode(next)
  }

  /** @deprecated Prefer setDeclaredMode / setDetectedMode. */
  function setMode(next: ChordAnalysisMode): void {
    setDeclaredMode(next)
    setDetectedMode(next)
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

  /** Mild/Bold may split long holds into tension→resolve onsets (forceImplied). */
  const detectMoments = computed((): BareMelodyMoment[] => {
    const tag = project.value
    if (!tag) return []
    return expandHeldMomentsForCadences(bareMoments.value, {
      interest: prefs.detectedInterest,
      tonality: tag.tonality,
      mode: tonalityMode.value,
      ppq: tag.ppq,
      timeSignature: tag.timeSignature,
      tweaks: prefs.detectedScoreTweaks,
    })
  })

  const impliedStacks = computed(() => {
    const tag = project.value
    if (!tag) return []
    return impliedStacksForBareMelody({
      moments: detectMoments.value,
      existingStacks: harmonyStacks.value,
      tonality: tag.tonality,
      mode: tonalityMode.value,
      songEndTick: tag.lengthTicks,
      interest: prefs.detectedInterest,
      ppq: tag.ppq,
      timeSignature: tag.timeSignature,
      tweaks: prefs.detectedScoreTweaks,
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
    const momentsByTick = new Map(detectMoments.value.map((m) => [m.startTick, m]))

    const mergeUnique = (
      primary: readonly NatureNameCandidate[],
      extra: readonly NatureNameCandidate[],
      limit = DETECT_ALT_LIMIT,
    ): NatureNameCandidate[] => {
      const out: NatureNameCandidate[] = []
      for (const c of [...primary, ...extra]) {
        if (out.some((x) => x.label === c.label)) continue
        out.push(c)
        if (out.length >= limit) break
      }
      return out
    }

    const interest = prefs.detectedInterest
    const tweaks = prefs.detectedScoreTweaks

    for (const s of analysisStacks.value) {
      if (s.midi) {
        const sounding = listNatureNameCandidates({
          midi: s.midi,
          profile,
          tonality: tag.tonality,
          preferFlats: tag.preferFlats,
          limit: DETECT_ALT_LIMIT,
        })
        // Pad with melody-implied homes when the voicing ID is unambiguous.
        const moments = detectMoments.value
        const mi = moments.findIndex((m) => m.startTick === s.startTick)
        const moment =
          momentsByTick.get(s.startTick) ??
          (mi >= 0 ? moments[mi] : undefined)
        const melodyMidi = moment?.midi ?? s.midi.lead
        const nextMidi = mi >= 0 ? moments[mi + 1]?.midi ?? null : null
        const prevMidi = mi > 0 ? moments[mi - 1]?.midi ?? null : null
        const phraseRole =
          mi >= 0 ? phraseRoleAtMelodyIndex(moments, mi, tag.lengthTicks) : undefined
        let prevRootPc: number | null = null
        let prevNatureId: string | null = null
        if (mi > 0) {
          const prevTick = moments[mi - 1]!.startTick
          const prevStack = analysisStacks.value
            .filter((x) => x.startTick <= prevTick && x.natureId !== 'unknown')
            .sort((a, b) => b.startTick - a.startTick)[0]
          if (prevStack) {
            prevRootPc = prevStack.rootPc
            prevNatureId = prevStack.natureId
          }
        }
        const implied = reorderImpliedByMelodyRole(
          inferImpliedChordsFromMelody({
            melodyMidi,
            tonality: tag.tonality,
            mode,
            limit: DETECT_ALT_LIMIT,
            nextMelodyMidi: nextMidi,
            prevMelodyMidi: prevMidi,
            prevRootPc,
            prevNatureId,
            phraseRole,
            interest,
            tweaks,
          }),
          moment?.melodyRole,
          interest,
        ).map((c) => ({
          rootPc: c.rootPc,
          natureId: c.natureId,
          label: absoluteChordLabel(c.rootPc, c.natureId, tag.preferFlats, {
            tonality: tag.tonality,
            tonalityMode: mode,
          }),
          roman: c.roman,
          cadenceLabel: c.cadenceHint?.label,
        }))
        map.set(s.startTick, mergeUnique(sounding, implied, DETECT_ALT_LIMIT))
        continue
      }
      if (s.natureId !== 'unknown') {
        const moment = momentsByTick.get(s.startTick)
        const midi = moment?.midi
        if (midi == null) continue
        const moments = detectMoments.value
        const mi = moments.findIndex((m) => m.startTick === s.startTick)
        const nextMidi = mi >= 0 ? moments[mi + 1]?.midi ?? null : null
        const prevMidi = mi > 0 ? moments[mi - 1]?.midi ?? null : null
        const phraseRole =
          mi >= 0 ? phraseRoleAtMelodyIndex(moments, mi, tag.lengthTicks) : undefined
        let prevRootPc: number | null = null
        let prevNatureId: string | null = null
        if (mi > 0) {
          const prevTick = moments[mi - 1]!.startTick
          const prevStack = analysisStacks.value
            .filter((x) => x.startTick <= prevTick && x.natureId !== 'unknown')
            .sort((a, b) => b.startTick - a.startTick)[0]
          if (prevStack) {
            prevRootPc = prevStack.rootPc
            prevNatureId = prevStack.natureId
          }
        }
        const ranked = reorderImpliedByMelodyRole(
          inferImpliedChordsFromMelody({
            melodyMidi: midi,
            tonality: tag.tonality,
            mode,
            limit: DETECT_ALT_LIMIT,
            nextMelodyMidi: nextMidi,
            prevMelodyMidi: prevMidi,
            prevRootPc,
            prevNatureId,
            phraseRole,
            interest,
            tweaks,
          }),
          moment?.melodyRole,
          interest,
        )
        const forced = moment?.forceImplied
        const rows: {
          rootPc: number
          natureId: string
          roman?: string
          cadenceLabel?: string
        }[] = []
        if (forced) {
          rows.push({
            rootPc: forced.rootPc,
            natureId: forced.natureId,
            roman: forced.roman,
          })
        }
        for (const c of ranked) {
          if (forced && c.rootPc === forced.rootPc && c.natureId === forced.natureId) continue
          rows.push({
            rootPc: c.rootPc,
            natureId: c.natureId,
            roman: c.roman,
            cadenceLabel: c.cadenceHint?.label,
          })
          if (rows.length >= DETECT_ALT_LIMIT) break
        }
        map.set(
          s.startTick,
          rows.map((c) => ({
            rootPc: c.rootPc,
            natureId: c.natureId,
            label: absoluteChordLabel(c.rootPc, c.natureId, tag.preferFlats, {
              tonality: tag.tonality,
              tonalityMode: mode,
            }),
            roman: c.roman,
            cadenceLabel: c.cadenceLabel,
          })),
        )
      }
    }
    return map
  })

  /** Map a Detected cell tick → analysis-stack tick (holes may clip past the onset). */
  function analysisTickForDetect(startTick: number): number {
    const stacks = analysisStacks.value
    const covering = stacks
      .filter(
        (s) =>
          s.startTick <= startTick &&
          s.startTick + Math.max(1, s.durationTicks) > startTick,
      )
      .sort((a, b) => b.startTick - a.startTick)[0]
    if (covering) return covering.startTick
    if (nameCandidatesByTick.value.has(startTick)) return startTick
    let best = startTick
    let bestDist = Number.POSITIVE_INFINITY
    for (const t of nameCandidatesByTick.value.keys()) {
      if (t > startTick) continue
      const d = startTick - t
      if (d < bestDist) {
        bestDist = d
        best = t
      }
    }
    return best
  }

  /** Session-local Detected Alt pick per *fragment* startTick (sketch-split halves are independent). */
  const detectAltIndexByTick = ref<Record<number, number>>({})

  function cycleDetectAlt(fragmentStartTick: number): void {
    const candTick = analysisTickForDetect(fragmentStartTick)
    const n = detectAltCandidateCount(nameCandidatesByTick.value.get(candTick))
    if (n < 2) return
    const cur = detectAltIndexByTick.value[fragmentStartTick] ?? 0
    detectAltIndexByTick.value = {
      ...detectAltIndexByTick.value,
      [fragmentStartTick]: nextDetectAltIndex(cur, n),
    }
  }

  const stripRows = computed(() => {
    const tag = project.value
    if (!tag) return { declared: [], detect: [] }
    return buildHarmonyStripRows({
      sketch: tag.harmonySketch ?? [],
      detectStacks: analysisStacks.value,
      tonality: tag.tonality,
      tonalityMode: tonalityMode.value,
      preferFlats: tag.preferFlats,
      lengthTicks: tag.lengthTicks,
      notes: tag.notes,
      nameCandidatesByTick: nameCandidatesByTick.value,
      detectAltIndexByStartTick: detectAltIndexByTick.value,
      resolveCandidateTick: analysisTickForDetect,
    })
  })

  const declaredSegments = computed((): ChordAnalysisSegment[] =>
    stripRows.value.declared.map((s) => ({
      id: s.id,
      startTick: s.startTick,
      endTick: s.endTick,
      locked: s.locked,
      implied: false,
      rootPc: s.rootPc,
      quality: s.quality,
      name: s.name,
      nameOptions: s.nameOptions,
      roman: s.roman,
      romanOptions: s.romanOptions,
      displayName: s.displayName,
      displayRoman: s.displayRoman,
    })),
  )

  const detectSegments = computed((): ChordAnalysisSegment[] =>
    stripRows.value.detect.map((s) => {
      const candTick = analysisTickForDetect(s.startTick)
      const cands = nameCandidatesByTick.value.get(candTick)
      const altCount = detectAltCandidateCount(cands)
      const rawAlt = detectAltIndexByTick.value[s.startTick] ?? 0
      const altIndex = altCount > 0 ? Math.min(Math.max(0, rawAlt), altCount - 1) : 0
      return {
        id: s.id,
        startTick: s.startTick,
        endTick: s.endTick,
        locked: false,
        implied: true,
        rootPc: s.rootPc,
        quality: s.quality,
        name: s.name,
        nameOptions: s.nameOptions,
        roman: s.roman,
        romanOptions: s.romanOptions,
        displayName: s.displayName,
        displayRoman: s.displayRoman,
        cadenceLabel: s.cadenceLabel,
        altIndex,
        altCount,
      }
    }),
  )

  /** Flat list for Hear / pick lookups (declared first). */
  const segments = computed((): ChordAnalysisSegment[] => [
    ...declaredSegments.value,
    ...detectSegments.value,
  ])

  return {
    declaredMode,
    detectedMode,
    /** @deprecated Prefer declaredMode / detectedMode. */
    mode: declaredMode,
    segments,
    declaredSegments,
    detectSegments,
    nameCandidatesByTick,
    cycleDetectAlt,
    setDeclaredMode,
    setDetectedMode,
    setMode,
    setOverride,
  }
}
