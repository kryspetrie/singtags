/** Pillar inference and edits for the arrangement store. */

import { lazyFn, type StoreDeps } from './deps'

import { confirmAllPillars as confirmAllPillarsUc, inferPillars as inferPillarsUc } from '../../application/arranging'

import { type Pillar } from '../../domain/arranging/types'

import {
  addPillarAtTick,
  deletePillar,
  extendPillarToCover,
  lockPillar,
  lockRemainingPillars,
  pillarAtTick,
  trimPillarEnd,
} from '../../domain/arranging/pillars'

import { nextHomeRootProposal, spanKey } from '../../domain/arranging/proposePillarAt'

export function createArrangementPillarActions(deps: StoreDeps) {

  const current = deps.current
  const mutate = lazyFn(() => deps.mutate)
  const playheadTick = deps.playheadTick
  const replaceCurrent = lazyFn(() => deps.replaceCurrent)
  const selectedPillarId = deps.selectedPillarId
  const services = deps.services
  const skippedHomeRootSpans = deps.skippedHomeRootSpans

  function inferPillars(): void {
    const p = current.value
    if (!p) return
    const pillars = inferPillarsUc(p, { idGen: services.idGen })
    replaceCurrent({ ...p, pillars, wizardStep: 'step1_roots' })
    selectedPillarId.value = pillars.find((x) => !x.confirmed)?.id ?? pillars[0]?.id ?? null
  }

  /**
   * Guided propose: one draft home root at/after cursor. Returns false when none left.
   * Reuses an existing unconfirmed draft on the same span instead of stacking.
   */
  function proposeNextHomeRoot(cursorTick?: number): boolean {
    const p = current.value
    if (!p) return false
    const cursor = cursorTick ?? playheadTick.value
    const proposal = nextHomeRootProposal({
      melody: p.melody,
      pillars: p.pillars,
      tonality: p.tonality,
      mode: p.tonalityMode ?? 'major',
      cursorTick: cursor,
      skippedSpans: skippedHomeRootSpans.value,
    })
    if (!proposal) return false

    const hit = pillarAtTick(p.pillars, proposal.startTick)
    if (
      hit &&
      !hit.confirmed &&
      hit.startTick === proposal.startTick &&
      hit.endTick === proposal.endTick
    ) {
      selectedPillarId.value = hit.id
      return true
    }

    let pillars = p.pillars
    if (hit && !hit.confirmed) pillars = deletePillar(pillars, hit.id)
    pillars = addPillarAtTick(pillars, proposal.startTick, {
      rootPc: proposal.rootPc,
      endTick: proposal.endTick,
      id: services.idGen.next('pil'),
      reason: proposal.reason,
      confidence: proposal.confidence,
      source: 'inferred',
    })
    replaceCurrent({
      ...p,
      pillars,
      wizardStep: p.wizardStep === 'melody' ? 'step1_roots' : p.wizardStep,
    })
    const neu = pillarAtTick(pillars, proposal.startTick)
    selectedPillarId.value = neu?.id ?? null
    return true
  }

  /** Discard the selected draft, remember its span as skipped, clear selection. */
  function skipProposedPillar(): void {
    const p = current.value
    const id = selectedPillarId.value
    if (!p || !id) return
    const pil = p.pillars.find((x: any) => x.id === id)
    if (!pil || pil.confirmed) return
    const key = spanKey(pil.startTick, pil.endTick)
    if (!skippedHomeRootSpans.value.includes(key)) {
      skippedHomeRootSpans.value = [...skippedHomeRootSpans.value, key]
    }
    replaceCurrent({ ...p, pillars: deletePillar(p.pillars, id) })
    selectedPillarId.value = null
  }

  function clearSkippedHomeRoots(): void {
    skippedHomeRootSpans.value = []
  }

  function setPillars(pillars: Pillar[]): void {
    mutate((p: any) => {
      p.pillars = pillars
    })
  }

  function updatePillar(id: string, patch: Partial<Pillar>): void {
    mutate((p: any) => {
      const pil = p.pillars.find((x: any) => x.id === id)
      if (!pil) return
      Object.assign(pil, patch)
    })
  }

  function confirmAllPillars(): void {
    const p = current.value
    if (!p) return
    replaceCurrent(confirmAllPillarsUc(p))
  }

  function selectPillar(id: string | null): void {
    selectedPillarId.value = id
  }

  function addPillarAt(tick: number, rootPc?: number): void {
    const p = current.value
    if (!p) return
    const root = rootPc ?? ((p.tonality % 12) + 12) % 12
    const pillars = addPillarAtTick(p.pillars, tick, {
      rootPc: root,
      id: services.idGen.next('pil'),
    })
    replaceCurrent({ ...p, pillars, wizardStep: p.wizardStep === 'melody' ? 'step1_roots' : p.wizardStep })
    const hit = pillars.find((x) => x.startTick <= tick && tick < x.endTick)
    selectedPillarId.value = hit?.id ?? null
  }

  function extendSelectedPillarTo(tick: number): void {
    const p = current.value
    const id = selectedPillarId.value
    if (!p || !id) return
    replaceCurrent({ ...p, pillars: extendPillarToCover(p.pillars, id, tick) })
  }

  function trimSelectedPillarEnd(endTick: number): void {
    const p = current.value
    const id = selectedPillarId.value
    if (!p || !id) return
    replaceCurrent({ ...p, pillars: trimPillarEnd(p.pillars, id, endTick) })
  }

  function removePillar(id: string): void {
    const p = current.value
    if (!p) return
    replaceCurrent({ ...p, pillars: deletePillar(p.pillars, id) })
    if (selectedPillarId.value === id) selectedPillarId.value = null
  }

  function lockSelectedPillar(): void {
    const p = current.value
    const id = selectedPillarId.value
    if (!p || !id) return
    const pillars = lockPillar(p.pillars, id)
    const step = pillars.some((x) => x.confirmed) ? 'step2_confirm' : p.wizardStep
    replaceCurrent({ ...p, pillars, wizardStep: step })
  }

  function lockRemaining(): void {
    const p = current.value
    if (!p) return
    replaceCurrent({ ...p, pillars: lockRemainingPillars(p.pillars), wizardStep: 'step2_confirm' })
  }

  const actions = {
    inferPillars,
    proposeNextHomeRoot,
    skipProposedPillar,
    clearSkippedHomeRoots,
    setPillars,
    updatePillar,
    confirmAllPillars,
    selectPillar,
    addPillarAt,
    extendSelectedPillarTo,
    trimSelectedPillarEnd,
    removePillar,
    lockSelectedPillar,
    lockRemaining,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
