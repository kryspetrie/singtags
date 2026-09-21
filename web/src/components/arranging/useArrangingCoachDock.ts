/**
 * Logic for ArrangingCoachDock — session modes, focus tabs, harmonic moments.
 */
import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import { midiToNote } from '../../audio/pianoSamples'
import { tipForCoachUi, type CoachUiMode } from '../../domain/arranging/coachTips'
import { pcName } from '../../domain/arranging/chords/chords'
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'
import {
  buildHarmonicMoments,
  momentToMelodyEvent,
  type HarmonicMoment,
} from '../../domain/arranging/harmonicMoments'
import {
  defaultFocusForMode,
  resolveCoachNextAction,
  type CoachFocusTab,
} from '../../domain/arranging/nextCoachAction'
import { melodyGapsOutsidePillars, pillarAtTick } from '../../domain/arranging/pillars'
import type { ArrangementLint } from '../../domain/arranging/qa'
import { canApplyFix } from '../../application/arranging/ApplyFix'
import { whyViewForCandidate } from '../../application/arranging/CandidateWhy'
import {
  altChipsForMoment,
  candFilterLabels,
  counterpartForMoment,
  filterCandidates,
  layerHintForCandidate,
  pickCandidateForAltChip,
  type AltChipDto,
  type CandFilterId,
} from '../../application/arranging/CoachAlternates'
import { groupIssues } from '../../application/arranging/IssueBoard'
import { explanationForLint } from '../../application/arranging/ExplainCoach'
import {
  mergeArrangementIntoTagRoll,
  tagStudioToArrangement,
} from '../../application/arranging/syncTagRoll'
import { contextForSelectedMoment } from '../../application/arranging/CoachContext'
import { setCoachHighlight } from '../../lib/arranging/coachHighlight'
import {
  filterLintsInRange,
  formatLintMeasureBeatRow,
  lintStartTick,
  type TickRange,
} from '../../lib/arranging/lintsInRange'
import { partOnsetsFromTagRoll } from '../../lib/arranging/partOnsetsFromTagRoll'
import { getArrangingServices } from '../../composition/arranging'
import { useTagRollAudio } from '../../composables/useTagRollAudio'
import { useArrangementStore } from '../../stores/arrangement'
import { useTagRollStore } from '../../stores/tagRoll'

export type CoachGhostNote = {
  role: 'tenor' | 'bari' | 'bass'
  midi: number
  startTick: number
  durationTicks: number
  color: string
}

export type CoachDockEmit = {
  (e: 'previewGhost', ghosts: CoachGhostNote[]): void
  (e: 'clearGhost'): void
  (e: 'focusTick', tick: number): void
  (e: 'focusRange', startTick: number, endTick: number): void
  (e: 'focusPart', tick: number, partName: string): void
  (e: 'close'): void
  (e: 'popOut'): void
}

export function useArrangingCoachDock(
  emit: CoachDockEmit,
  opts?: { inspectRange?: Ref<TickRange | null | undefined> },
) {
  const tagStore = useTagRollStore()
  const arrStore = useArrangementStore()
  const services = getArrangingServices()
  const audio = useTagRollAudio()
  const syncing = ref(false)
  const showLanding = ref(true)
  const phase = ref<'pillars' | 'walk'>('pillars')
  const mode = ref<CoachUiMode>('quick')
  const focusTab = ref<CoachFocusTab>('choose')
  const whyIndex = ref<number | null>(null)
  const whyShowNumbers = ref(false)
  const candFilter = ref<CandFilterId>('all')
  const altsOpen = ref(false)
  const pillarTouched = ref(false)
  const selectedMomentId = ref<string | null>(null)

  const preferFlats = computed(() => !!arrStore.current?.preferFlats)
  const melody = computed(() => arrStore.current?.melody ?? [])
  const pillars = computed(() => arrStore.current?.pillars ?? [])
  const selectedMel = computed(() => arrStore.selectedMelody)
  const selectedPil = computed(() => arrStore.selectedPillar)
  const candidates = computed(() => arrStore.candidates)
  const filteredCandidates = computed(() => filterCandidates(candidates.value, candFilter.value))
  const maxScore = computed(() => Math.max(1, ...filteredCandidates.value.map((c) => c.score), 1))
  const filterOptions = candFilterLabels()

  const moments = computed((): HarmonicMoment[] => {
    const p = arrStore.current
    const tag = tagStore.current
    if (!p?.melody.length) return []
    if (!tag) {
      return buildHarmonicMoments(
        p.melody,
        p.melody.map((m) => ({
          startTick: m.startTick,
          durationTicks: m.durationTicks,
          midi: m.midi,
          isLead: true,
        })),
      )
    }
    // All TTBB starts/ends become split points (held lead + moving TBB → many moments).
    return buildHarmonicMoments(p.melody, partOnsetsFromTagRoll(tag))
  })

  const selectedMoment = computed(
    () => moments.value.find((m) => m.id === selectedMomentId.value) ?? null,
  )

  const tip = computed(() =>
    tipForCoachUi({
      mode: mode.value,
      phase: phase.value,
      hasMelody: melody.value.length > 0,
      hasPillars: pillars.value.length > 0,
      wizardStep: arrStore.current?.wizardStep,
    }),
  )

  const nextAction = computed(() =>
    resolveCoachNextAction({
      project: arrStore.current,
      mode: mode.value,
      lints: arrStore.lints,
    }),
  )

  const momIndex = computed(() => {
    const id = selectedMomentId.value
    if (!id) return -1
    return moments.value.findIndex((m) => m.id === id)
  })

  const pilIndex = computed(() => {
    const id = arrStore.selectedPillarId
    if (!id) return -1
    return pillars.value.findIndex((p) => p.id === id)
  })

  const progressLabel = computed(() => {
    const n = moments.value.length
    if (!n) return 'Add a lead melody on the roll first'
    const filled = moments.value.filter((m) =>
      arrStore.current?.stacks.some((s) => s.startTick === m.startTick),
    ).length
    const i = momIndex.value
    const at = i >= 0 ? `${i + 1}/${n}` : `—/${n}`
    return `Moment ${at} · ${filled}/${n} harmonized`
  })

  const coverageGaps = computed(() =>
    melodyGapsOutsidePillars(melody.value, pillars.value),
  )

  const activeInspectRange = computed((): TickRange | null => {
    const r = opts?.inspectRange?.value
    if (r && r.endTick > r.startTick) return { startTick: r.startTick, endTick: r.endTick }
    const m = selectedMoment.value
    if (m) return { startTick: m.startTick, endTick: m.startTick + m.durationTicks }
    return null
  })

  const rangedLints = computed(() => {
    const p = arrStore.current
    const r = activeInspectRange.value
    if (!p || !r) return [] as ArrangementLint[]
    return filterLintsInRange(arrStore.lints, p, r)
  })

  const noteLints = computed(() => rangedLints.value)

  const pillarsUnconfirmed = computed(
    () => pillars.value.filter((p) => !p.confirmed).length,
  )

  const canWalkArrange = computed(
    () => mode.value === 'review' || pillars.value.length > 0,
  )

  const currentStack = computed(() => {
    const tick = selectedMoment.value?.startTick ?? selectedMel.value?.startTick
    const p = arrStore.current
    if (tick == null || !p) return null
    return p.stacks.find((s) => s.startTick === tick) ?? null
  })

  const uncoveredSelected = computed(() => {
    const tick = selectedMoment.value?.startTick ?? selectedMel.value?.startTick
    if (tick == null) return false
    return !pillarAtTick(pillars.value, tick)
  })

  const momentContext = computed(() => {
    const p = arrStore.current
    const m = selectedMoment.value
    if (!p || !m) return null
    return contextForSelectedMoment(p, m, candidates.value)
  })

  const altChips = computed((): AltChipDto[] => {
    const p = arrStore.current
    const m = selectedMoment.value
    if (!p || !m) return []
    return altChipsForMoment(p, m, candidates.value, preferFlats.value)
  })

  const counterpart = computed(() => {
    const p = arrStore.current
    const m = selectedMoment.value
    if (!p || !m) return null
    return counterpartForMoment(p, m, preferFlats.value)
  })

  const issueGroups = computed(() => groupIssues(rangedLints.value))
  const learnHint = ref<string | null>(null)

  function lintRowLabel(lint: ArrangementLint): string {
    const p = arrStore.current
    const tag = tagStore.current
    if (!p || !tag) return `| —:— | ${lint.message} |`
    return formatLintMeasureBeatRow(lint, p, tag.timeSignature, tag.ppq)
  }

  const canLockRemaining = computed(
    () => pillars.value.some((p) => p.confirmed) && pillarsUnconfirmed.value > 0,
  )

  function setMode(next: CoachUiMode): void {
    mode.value = next
    focusTab.value = defaultFocusForMode(next)
    altsOpen.value = next === 'guided'
    if (next === 'review') phase.value = 'walk'
  }

  function enterMode(next: CoachUiMode): void {
    setMode(next)
    showLanding.value = false
  }

  function backToModes(): void {
    showLanding.value = true
    emit('clearGhost')
  }

  function selectMoment(m: HarmonicMoment): void {
    selectedMomentId.value = m.id
    whyIndex.value = null
    if (m.leadNoteId) arrStore.selectMelody(m.leadNoteId)
    arrStore.setCandidateTarget(momentToMelodyEvent(m))
    emit('clearGhost')
    emit('focusRange', m.startTick, m.startTick + m.durationTicks)
    tagStore.setPlayheadTick(m.startTick, { snap: false })
    setCoachHighlight({
      tick: m.startTick,
      kind: m.heldLead ? 'gap' : 'moment',
      projectId: tagStore.current?.id,
    })
  }

  function selectMomentIndex(i: number): void {
    const m = moments.value[i]
    if (m) selectMoment(m)
  }

  function stepMoment(dir: -1 | 1): void {
    const n = moments.value.length
    if (!n) return
    const cur = momIndex.value
    const next = cur < 0 ? (dir > 0 ? 0 : n - 1) : Math.min(n - 1, Math.max(0, cur + dir))
    selectMomentIndex(next)
  }

  async function ensureLinked(): Promise<void> {
    const tag = tagStore.current
    if (!tag) return
    syncing.value = true
    try {
      await arrStore.hydrate()
      const linkId = `arr_${tag.id}`
      const existing = arrStore.projects.find((p) => p.id === linkId)
      if (existing) await arrStore.open(existing.id)
      else {
        const next = tagStudioToArrangement(tag, services.idGen)
        next.id = linkId
        await arrStore.adoptProject(next)
      }
      arrStore.runQa()
      const p = arrStore.current
      if (p?.stacks.length && !p.pillars.length) {
        setMode('review')
        phase.value = 'walk'
      } else if (p?.pillars.some((x) => x.confirmed)) {
        phase.value = 'walk'
        setMode('quick')
        focusTab.value = 'choose'
      }
      syncSelectionFromTagStudio()
      if (!selectedMomentId.value && moments.value[0]) selectMoment(moments.value[0]!)
      if (!arrStore.selectedPillarId && pillars.value[0]) focusPillar(pillars.value[0]!.id)
    } finally {
      syncing.value = false
    }
  }

  function pushToRoll(): void {
    const tag = tagStore.current
    const arr = arrStore.current
    if (!tag || !arr) return
    const merged = mergeArrangementIntoTagRoll(tag, arr, services.idGen)
    tagStore.replaceNotesFromExternal(merged.notes, {
      title: merged.title,
      bpm: merged.bpm,
      tonality: merged.tonality,
      preferFlats: merged.preferFlats,
      lengthTicks: merged.lengthTicks,
    })
    const tick = selectedMoment.value?.startTick ?? selectedMel.value?.startTick
    if (tick != null) emit('focusTick', tick)
  }

  function syncSelectionFromTagStudio(): void {
    const tag = tagStore.current
    const arr = arrStore.current
    if (!tag || !arr) return
    const sel = tagStore.selectedNote
    if (!sel) return
    const hit = moments.value.find(
      (m) =>
        m.startTick === sel.startTick ||
        (sel.startTick >= m.startTick && sel.startTick < m.startTick + m.durationTicks),
    )
    if (hit && hit.id !== selectedMomentId.value) selectMoment(hit)
  }

  function stepNextGap(): void {
    const p = arrStore.current
    if (!p) return
    const curTick = selectedMoment.value?.startTick ?? -1
    const gap =
      moments.value.find(
        (m) => m.startTick > curTick && !p.stacks.some((s) => s.startTick === m.startTick),
      ) ?? moments.value.find((m) => !p.stacks.some((s) => s.startTick === m.startTick))
    if (gap) selectMoment(gap)
  }

  function stepNextIssue(): void {
    const list = rangedLints.value
    const p = arrStore.current
    if (!list.length || !p) return
    const curTick = selectedMoment.value?.startTick ?? -1
    const next =
      list.find((l) => {
        const t = lintStartTick(l, p)
        return t != null && t > curTick
      }) ?? list[0]!
    jumpToLint(next)
  }

  function focusPillar(id: string): void {
    const pil = pillars.value.find((p) => p.id === id)
    if (!pil) return
    arrStore.selectPillar(id)
    focusTab.value = 'now'
    phase.value = 'pillars'
    emit('focusRange', pil.startTick, pil.endTick)
    tagStore.setPlayheadTick(pil.startTick, { snap: false })
  }

  function stepPillar(dir: -1 | 1): void {
    const n = pillars.value.length
    if (!n) return
    const cur = pilIndex.value
    const next = cur < 0 ? (dir > 0 ? 0 : n - 1) : Math.min(n - 1, Math.max(0, cur + dir))
    focusPillar(pillars.value[next]!.id)
  }

  function onInfer(): void {
    arrStore.inferPillars()
    arrStore.runQa()
    phase.value = 'pillars'
    if (mode.value === 'review') setMode('quick')
    focusTab.value = 'now'
    pillarTouched.value = false
    const first =
      arrStore.current?.pillars.find((p) => !p.confirmed) ?? arrStore.current?.pillars[0]
    if (first) focusPillar(first.id)
  }

  function onAddPillarAtPlayhead(): void {
    const tick =
      tagStore.current?.view.playheadTick ?? selectedMoment.value?.startTick ?? 0
    arrStore.addPillarAt(tick)
    pillarTouched.value = true
    phase.value = 'pillars'
    focusTab.value = 'now'
    if (arrStore.selectedPillarId) focusPillar(arrStore.selectedPillarId)
  }

  function onLockPillar(): void {
    arrStore.lockSelectedPillar()
    pillarTouched.value = true
  }

  function onLockRemaining(): void {
    if (!canLockRemaining.value) return
    arrStore.lockRemaining()
  }

  function onDeletePillar(): void {
    const id = arrStore.selectedPillarId
    if (!id) return
    arrStore.removePillar(id)
  }

  function updatePillarRoot(rootPc: number): void {
    const id = arrStore.selectedPillarId
    if (!id) return
    arrStore.updatePillar(id, { rootPc, source: 'user' })
    pillarTouched.value = true
  }

  function enterWalk(): void {
    if (!canWalkArrange.value) return
    phase.value = 'walk'
    focusTab.value = 'choose'
    if (mode.value !== 'review' && arrStore.current) {
      arrStore.setWizardStep('step3_pmn_pcf')
    }
    if (moments.value.length) selectMomentIndex(Math.max(0, momIndex.value))
  }

  function addPillarHere(): void {
    const tick = selectedMoment.value?.startTick ?? selectedMel.value?.startTick
    if (tick == null) return
    arrStore.addPillarAt(tick)
    pillarTouched.value = true
    phase.value = 'pillars'
    focusTab.value = 'now'
    if (arrStore.selectedPillarId) focusPillar(arrStore.selectedPillarId)
  }

  function extendPreviousToHere(): void {
    const tick = selectedMoment.value?.startTick ?? selectedMel.value?.startTick
    if (tick == null) return
    const prev = [...pillars.value]
      .filter((p) => p.endTick <= tick || p.startTick < tick)
      .sort((a, b) => b.startTick - a.startTick)[0]
    if (!prev) {
      addPillarHere()
      return
    }
    arrStore.selectPillar(prev.id)
    arrStore.extendSelectedPillarTo(tick)
    pillarTouched.value = true
    focusPillar(prev.id)
  }

  function ghostsFor(c: HarmonizeCandidate): CoachGhostNote[] {
    const moment = selectedMoment.value
    const parts = tagStore.current?.parts ?? []
    if (!moment) return []
    const colorFor = (name: string, fallback: string) =>
      parts.find((p) => p.name === name)?.color ?? fallback
    return [
      {
        role: 'tenor',
        midi: c.midi.tenor,
        startTick: moment.startTick,
        durationTicks: moment.durationTicks,
        color: colorFor('Tenor', '#c45c26'),
      },
      {
        role: 'bari',
        midi: c.midi.bari,
        startTick: moment.startTick,
        durationTicks: moment.durationTicks,
        color: colorFor('Bari', '#2f7d4a'),
      },
      {
        role: 'bass',
        midi: c.midi.bass,
        startTick: moment.startTick,
        durationTicks: moment.durationTicks,
        color: colorFor('Bass', '#5b3d8f'),
      },
    ]
  }

  function previewCand(c: HarmonizeCandidate): void {
    emit('previewGhost', ghostsFor(c))
  }

  async function hearCand(c: HarmonizeCandidate): Promise<void> {
    previewCand(c)
    if (audio?.isTransportPlaying?.()) return
    const p = audio?.ensurePlayer()
    if (!p) return
    p.allNotesOff(true)
    const notes = [c.midi.bass, c.midi.bari, c.midi.lead, c.midi.tenor].map((m) =>
      midiToNote(m),
    )
    await Promise.all(notes.map((n) => p.noteOn(n)))
    window.setTimeout(() => {
      if (audio?.isTransportPlaying?.()) return
      p.allNotesOff(true)
    }, 700)
  }

  async function hearCurrentStack(): Promise<void> {
    const stack = currentStack.value
    if (!stack?.midi) return
    await hearCand({
      rootPc: stack.rootPc,
      natureId: stack.natureId,
      voicing: stack.voicing,
      spread: !!stack.spread,
      layer: stack.layer === 'passing' ? 'passing' : 'primary',
      scfGroup: stack.scfGroup,
      midi: stack.midi,
      score: 0,
      ruleTags: stack.ruleTags ?? [],
      label: 'current',
    })
  }

  async function hearPillarRoot(): Promise<void> {
    const pil = selectedPil.value
    if (!pil || audio?.isTransportPlaying?.()) return
    const p = audio?.ensurePlayer()
    if (!p) return
    pillarTouched.value = true
    const midi = 36 + ((pil.rootPc % 12) + 12) % 12
    p.allNotesOff(true)
    await p.noteOn(midiToNote(midi))
    window.setTimeout(() => {
      if (audio?.isTransportPlaying?.()) return
      p.allNotesOff(true)
    }, 600)
  }

  function applyCand(c: HarmonizeCandidate): void {
    arrStore.applyCandidate(c)
    arrStore.runQa()
    pushToRoll()
    emit('clearGhost')
  }

  function applyBest(): void {
    const c = filteredCandidates.value[0] ?? candidates.value[0]
    if (c) applyCand(c)
  }

  function applyAltChip(chip: AltChipDto): void {
    const hit = pickCandidateForAltChip(candidates.value, chip)
    if (hit) applyCand(hit)
  }

  function applyCounterpartNow(): void {
    const cp = counterpart.value
    if (!cp) return
    if (!arrStore.applyCounterpartStack(cp.stackId)) return
    arrStore.runQa()
    pushToRoll()
    emit('clearGhost')
  }

  async function compareHearTop2(): Promise<void> {
    const top = filteredCandidates.value.slice(0, 2)
    if (!top.length) return
    await hearCand(top[0]!)
    if (top[1]) {
      await new Promise((r) => window.setTimeout(r, 750))
      await hearCand(top[1])
    }
  }

  function fillEmptyWithBest(): void {
    const p = arrStore.current
    if (!p) return
    for (const m of moments.value) {
      if (p.stacks.some((s) => s.startTick === m.startTick)) continue
      arrStore.setCandidateTarget(momentToMelodyEvent(m))
      const top = arrStore.candidates[0]
      if (top) arrStore.applyCandidate(top)
    }
    arrStore.runQa()
    pushToRoll()
    if (selectedMoment.value) selectMoment(selectedMoment.value)
  }

  function fixAllSafe(): void {
    arrStore.fixAllSafe()
    pushToRoll()
  }

  function fixItem(lint: ArrangementLint): void {
    if (!arrStore.current) return
    if (lint.ruleId === 'key-suggestion') {
      if (!confirm(`${lint.message}\n\nApply transpose now?`)) return
      arrStore.fixLint(lint, { confirmDestructive: true })
    } else {
      arrStore.fixLint(lint)
    }
    pushToRoll()
  }

  function canFix(lint: ArrangementLint): boolean {
    const p = arrStore.current
    if (!p) return false
    return canApplyFix(p, lint, services.fixRegistry)
  }

  function learnLint(lint: ArrangementLint): void {
    const exp = explanationForLint(lint)
    learnHint.value = `${exp.headline}: ${exp.body}`
    jumpToLint(lint)
  }

  function partFromLint(lint: ArrangementLint): string | null {
    const msg = lint.message.toLowerCase()
    if (msg.includes('tenor')) return 'Tenor'
    if (msg.includes('bari')) return 'Bari'
    if (msg.includes('bass')) return 'Bass'
    if (msg.includes('lead')) return 'Lead'
    return null
  }

  function jumpToLint(lint: ArrangementLint): void {
    arrStore.selectLintTarget(lint)
    phase.value = 'walk'
    focusTab.value = 'check'
    const note = selectedMel.value
    const tick =
      note?.startTick ??
      (lint.stackId
        ? arrStore.current?.stacks.find((s) => s.id === lint.stackId)?.startTick
        : undefined)
    if (tick == null) return
    const moment = moments.value.find((m) => m.startTick === tick)
    if (moment) selectMoment(moment)
    setCoachHighlight({
      tick,
      kind: 'issue',
      projectId: tagStore.current?.id,
      lintId: lint.id,
    })
    const part = partFromLint(lint)
    if (part) emit('focusPart', tick, part)
    else emit('focusTick', tick)
    tagStore.setPlayheadTick(tick, { snap: false })
  }

  function candLabel(c: HarmonizeCandidate): string {
    const root = pcName(c.rootPc, preferFlats.value)
    const nat = c.natureId === 'major' ? '' : c.natureId === 'seventh' ? '7' : c.natureId
    return `${root}${nat}`
  }

  function candIdentity(c: HarmonizeCandidate): string {
    const v = c.voicing?.trim()
    return v ? `${candLabel(c)} · ${v}` : candLabel(c)
  }

  function whyFor(i: number) {
    return whyViewForCandidate(filteredCandidates.value[i] ?? candidates.value[i]!)
  }

  function layerHint(c: HarmonizeCandidate): string {
    return layerHintForCandidate(c)
  }

  function runNextAction(): void {
    const a = nextAction.value
    if (a.focus) focusTab.value = a.focus
    switch (a.kind) {
      case 'enter_melody':
        emit('close')
        break
      case 'suggest_pillars':
        onInfer()
        break
      case 'lock_pillars':
      case 'cover_gaps':
        phase.value = 'pillars'
        focusTab.value = 'now'
        break
      case 'walk_choose':
        enterWalk()
        break
      case 'fix_issues':
      case 'done':
        focusTab.value = 'check'
        phase.value = 'walk'
        break
    }
  }

  function goCloseForMelody(): void {
    emit('close')
  }

  watch(
    () => tagStore.selectedNoteIds.slice(),
    () => syncSelectionFromTagStudio(),
  )

  watch(
    () => tagStore.current?.notes.length,
    async () => {
      const tag = tagStore.current
      if (!tag || !arrStore.current) return
      const keepTick = selectedMoment.value?.startTick
      const keepPil = arrStore.selectedPillarId
      const next = tagStudioToArrangement(tag, services.idGen)
      next.id = arrStore.current.id
      next.pillars = arrStore.current.pillars
      next.stacks = arrStore.current.stacks.filter((s) =>
        next.melody.some(
          (m) => m.startTick <= s.startTick && s.startTick < m.startTick + m.durationTicks,
        ),
      )
      next.wizardStep = arrStore.current.wizardStep
      next.contestProfile = arrStore.current.contestProfile
      next.tuningMode = arrStore.current.tuningMode
      await arrStore.adoptProject(next)
      arrStore.runQa()
      if (keepPil && next.pillars.some((p) => p.id === keepPil)) {
        arrStore.selectPillar(keepPil)
      }
      if (keepTick != null) {
        const hit = moments.value.find((m) => m.startTick === keepTick)
        if (hit) selectMoment(hit)
      } else {
        syncSelectionFromTagStudio()
      }
    },
  )

  onUnmounted(() => {
    emit('clearGhost')
    arrStore.setCandidateTarget(null)
  })

  return {
    arrStore,
    syncing,
    showLanding,
    phase,
    mode,
    focusTab,
    whyIndex,
    whyShowNumbers,
    tip,
    nextAction,
    preferFlats,
    melody,
    moments,
    pillars,
    selectedMel,
    selectedMoment,
    selectedPil,
    candidates,
    filteredCandidates,
    maxScore,
    filterOptions,
    candFilter,
    altsOpen,
    altChips,
    counterpart,
    issueGroups,
    learnHint,
    lintRowLabel,
    progressLabel,
    coverageGaps,
    noteLints,
    pillarsUnconfirmed,
    canWalkArrange,
    canLockRemaining,
    currentStack,
    uncoveredSelected,
    momentContext,
    ensureLinked,
    setMode,
    enterMode,
    backToModes,
    selectMoment,
    stepMoment,
    stepNextGap,
    stepNextIssue,
    focusPillar,
    stepPillar,
    onInfer,
    onAddPillarAtPlayhead,
    onLockPillar,
    onLockRemaining,
    onDeletePillar,
    updatePillarRoot,
    enterWalk,
    addPillarHere,
    extendPreviousToHere,
    previewCand,
    hearCand,
    hearCurrentStack,
    hearPillarRoot,
    applyCand,
    applyBest,
    applyAltChip,
    applyCounterpartNow,
    compareHearTop2,
    fillEmptyWithBest,
    fixAllSafe,
    fixItem,
    canFix,
    learnLint,
    jumpToLint,
    candLabel,
    candIdentity,
    layerHint,
    whyFor,
    runNextAction,
    goCloseForMelody,
    pcName,
    midiToNote,
    pushToRoll,
  }
}
