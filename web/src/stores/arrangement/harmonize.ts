/** Harmonize, QA, and export actions for the arrangement store. */

import { lazyFn, type StoreDeps } from './deps'

import { usePreferencesStore } from '../preferences'

import {
  applyAllSafeFixes,
  applyCandidateToProject,
  applyCounterpart,
  applyFix,
  assessFinal,
  assessHowBarbershop,
  autoHarmonize,
  autoLabelMelodyRoles,
  canApplyFix,
  exportMidi,
  exportMusicXml,
  listCandidatesForNote,
  polishArrangementVoicing,
  strengthenArrangement,
  pathOptimize as pathOptimizeUc,
  type SoftSuggestContext,
  type PathOptimizeOpts,
  type PathOptimizeReport,
} from '../../application/arranging'

import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'

import type { ArrangementLint } from '../../domain/arranging/qa'

import { type ChordStack, type MelodyEvent } from '../../domain/arranging/types'

import { downloadMidiBytes } from '../../adapters/arranging/midi/arrangementMidiExporter'

export function createArrangementHarmonizeActions(deps: StoreDeps) {

  const candidateTarget = deps.candidateTarget
  const candidates = deps.candidates
  const current = deps.current
  const lints = deps.lints
  const mutate = lazyFn(() => deps.mutate)
  const refreshQa = lazyFn(() => deps.refreshQa)
  const replaceCurrent = lazyFn(() => deps.replaceCurrent)
  const selectedMelody = deps.selectedMelody
  const services = deps.services
  const softSuggestContext = deps.softSuggestContext

  function refreshCandidates(): void {
    const p = current.value
    const note = candidateTarget.value ?? selectedMelody.value
    if (!p || !note) {
      candidates.value = []
      return
    }
    const pathPrefs = usePreferencesStore().tagRollPathOptimizePrefs
    candidates.value = listCandidatesForNote(
      p,
      note,
      {
        preferScf: p.wizardStep === 'step5_smn_scf' || note.role === 'smn',
        limit: 16,
        softContext: softSuggestContext.value,
        pathWeights: {
          risk: pathPrefs.risk,
          cadenceBias: pathPrefs.cadenceBias,
        },
      },
      { rankerDeps: services.rankerDeps, idGen: services.idGen },
    )
  }

  function setSoftSuggestContext(ctx: SoftSuggestContext | null): void {
    softSuggestContext.value = ctx
    if (candidateTarget.value) refreshCandidates()
  }

  function setCandidateTarget(note: MelodyEvent | null): void {
    candidateTarget.value = note
    if (!note) softSuggestContext.value = null
    refreshCandidates()
  }

  function applyCandidate(c: HarmonizeCandidate): void {
    const p = current.value
    const note = candidateTarget.value ?? selectedMelody.value
    if (!p || !note) return
    replaceCurrent(
      applyCandidateToProject(p, note, c, {
        idGen: services.idGen,
        rankerDeps: services.rankerDeps,
      }),
    )
  }

  function applyCounterpartStack(stackId: string): boolean {
    const p = current.value
    if (!p) return false
    const next = applyCounterpart(p, stackId)
    if (!next) return false
    replaceCurrent(next)
    return true
  }

  function autoFillStacks(preferScfForSmn = false): void {
    const p = current.value
    if (!p) return
    const stacks = autoHarmonize(
      p,
      { preferScfForSmn },
      { idGen: services.idGen, rankerDeps: services.rankerDeps },
    )
    replaceCurrent({ ...p, stacks })
  }

  function setStacks(stacks: ChordStack[]): void {
    mutate((p: any) => {
      p.stacks = stacks
    })
  }

  function runQaNow(): ArrangementLint[] {
    refreshQa()
    return lints.value
  }

  function fixLint(lint: ArrangementLint, opts?: { confirmDestructive?: boolean }): boolean {
    const p = current.value
    if (!p || !canApplyFix(p, lint, services.fixRegistry)) return false
    const next = applyFix(p, lint, services.fixRegistry, {
      idGen: services.idGen,
      rankerDeps: services.rankerDeps,
      confirmDestructive:
        opts?.confirmDestructive ??
        (lint.ruleId === 'key-suggestion' || lint.ruleId === 'lead-range'),
    })
    if (!next) return false
    replaceCurrent(next)
    refreshCandidates()
    return true
  }

  function fixAllSafe(): number {
    const p = current.value
    if (!p) return 0
    const { project, applied } = applyAllSafeFixes(p, lints.value, services.fixRegistry, {
      idGen: services.idGen,
      rankerDeps: services.rankerDeps,
    })
    if (applied.length) replaceCurrent(project)
    refreshCandidates()
    return applied.length
  }

  function labelRoles(force = false): void {
    const p = current.value
    if (!p) return
    replaceCurrent(autoLabelMelodyRoles(p, { force }))
    refreshCandidates()
  }

  function strengthen(): number {
    const p = current.value
    if (!p) return 0
    const before = new Map(
      p.stacks.map((s: any) => [
        s.id,
        `${s.rootPc}:${s.natureId}:${s.voicing}:${s.midi?.bass},${s.midi?.bari},${s.midi?.lead},${s.midi?.tenor}`,
      ]),
    )
    const next = strengthenArrangement(p, {
      idGen: services.idGen,
      rankerDeps: services.rankerDeps,
      // Coach default: allow moderate upgrades (domain default 1.5 is quite strict).
      minScoreGain: 0.75,
    })
    const changed = next.stacks.filter((s) => {
      const key = `${s.rootPc}:${s.natureId}:${s.voicing}:${s.midi?.bass},${s.midi?.bari},${s.midi?.lead},${s.midi?.tenor}`
      return before.get(s.id) !== key
    }).length
    if (changed) replaceCurrent(next)
    refreshCandidates()
    return changed
  }

  function polishVoicing(): number {
    const p = current.value
    if (!p) return 0
    const { project, applied } = polishArrangementVoicing(p, { registry: services.fixRegistry })
    if (applied.length) replaceCurrent(project)
    refreshCandidates()
    return applied.length
  }

  async function pathOptimize(opts: PathOptimizeOpts): Promise<PathOptimizeReport | null> {
    const p = current.value
    if (!p) return null
    const { project, report } = await pathOptimizeUc(p, opts, {
      idGen: services.idGen,
      rankerDeps: services.rankerDeps,
    })
    if (report.applied) {
      replaceCurrent(project)
      refreshCandidates()
    }
    return report
  }

  function finalChecklist() {
    return current.value ? assessFinal(current.value) : { ready: false, items: [] }
  }
  function howBarbershopFactors() {
    return current.value ? assessHowBarbershop(current.value).factors : []
  }

  function downloadMidi(justIntonation = false): boolean {
    const p = current.value
    if (!p) return false
    const result = exportMidi(p, services.midiExporter, { justIntonation, blockOnErrors: true })
    if (!result.ok) return false
    downloadMidiBytes(result.bytes, p.title)
    return true
  }

  function downloadMusicXml(): boolean {
    const p = current.value
    if (!p || !services.musicXmlExporter) return false
    const result = exportMusicXml(p, services.musicXmlExporter, { blockOnErrors: true })
    if (!result.ok) return false
    const blob = new Blob([result.xml], { type: 'application/vnd.recordare.musicxml+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(p.title || 'arrangement').replace(/[^\w.-]+/g, '_')}.musicxml`
    a.click()
    URL.revokeObjectURL(a.href)
    return true
  }

  const actions = {
    refreshCandidates,
    setSoftSuggestContext,
    setCandidateTarget,
    applyCandidate,
    applyCounterpartStack,
    autoFillStacks,
    setStacks,
    runQaNow,
    fixLint,
    fixAllSafe,
    labelRoles,
    strengthen,
    polishVoicing,
    pathOptimize,
    finalChecklist,
    howBarbershopFactors,
    downloadMidi,
    downloadMusicXml,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
